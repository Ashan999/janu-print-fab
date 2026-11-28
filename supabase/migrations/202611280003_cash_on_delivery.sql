-- Add Cash on Delivery while keeping bank transfer and receipt verification.
begin;

alter table public.orders
  add column if not exists payment_method text not null default 'bank_transfer';

-- A payment receipt is only required for bank transfer. Older schemas may
-- have made their legacy receipt-path column NOT NULL.
do $$
declare
  receipt_column record;
begin
  for receipt_column in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name in ('payment_slip_path', 'payment_slip_url', 'payment_receipt_url')
      and is_nullable = 'NO'
  loop
    execute format('alter table public.orders alter column %I drop not null', receipt_column.column_name);
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_payment_method_check'
  ) then
    alter table public.orders
      add constraint orders_payment_method_check
      check (payment_method in ('bank_transfer', 'cash_on_delivery'));
  end if;
end;
$$;

comment on column public.orders.payment_method is
  'Customer-selected payment method: bank_transfer or cash_on_delivery.';

create or replace function public.jpf_customer_set_payment_method(
  p_order_id uuid,
  p_payment_method text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record jsonb;
  selected_method text := lower(trim(coalesce(p_payment_method, '')));
  receipt_path text;
  current_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to select a payment method.' using errcode = '42501';
  end if;

  if selected_method not in ('bank_transfer', 'cash_on_delivery') then
    raise exception 'Choose a valid payment method.' using errcode = '22023';
  end if;

  select to_jsonb(o) into order_record
  from public.orders o
  where o.id = p_order_id
  for update;

  if order_record is null then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  if coalesce(order_record->>'user_id', order_record->>'customer_id') is distinct from auth.uid()::text then
    raise exception 'You cannot update this order.' using errcode = '42501';
  end if;

  receipt_path := coalesce(
    order_record->>'payment_receipt_url',
    order_record->>'payment_slip_path',
    order_record->>'payment_slip_url'
  );
  current_status := lower(coalesce(order_record->>'payment_status', 'pending'));

  if current_status in ('paid', 'refunded') then
    raise exception 'The payment method cannot be changed after payment is settled.' using errcode = '55000';
  end if;

  if selected_method = 'bank_transfer' and nullif(receipt_path, '') is null then
    raise exception 'Upload the bank transfer receipt first.' using errcode = '22023';
  end if;

  if selected_method = 'cash_on_delivery' and nullif(receipt_path, '') is not null then
    raise exception 'This order already has a bank transfer receipt.' using errcode = '55000';
  end if;

  update public.orders
  set payment_method = selected_method,
      payment_status = case when selected_method = 'cash_on_delivery' then 'pending' else payment_status end,
      payment_reference = case when selected_method = 'cash_on_delivery' then null else payment_reference end,
      payment_submitted_at = case when selected_method = 'cash_on_delivery' then null else payment_submitted_at end
  where id = p_order_id;
end;
$$;

revoke all on function public.jpf_customer_set_payment_method(uuid, text) from public, anon;
grant execute on function public.jpf_customer_set_payment_method(uuid, text) to authenticated;

create or replace function public.jpf_admin_mark_cod_paid(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record jsonb;
  current_status text;
begin
  if not (select public.jpf_app_is_admin()) then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  select to_jsonb(o) into order_record
  from public.orders o
  where o.id = p_order_id
  for update;

  if order_record is null then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  if order_record->>'payment_method' is distinct from 'cash_on_delivery' then
    raise exception 'This order is not Cash on Delivery.' using errcode = '22023';
  end if;

  current_status := lower(coalesce(order_record->>'payment_status', 'pending'));
  if current_status <> 'pending' then
    raise exception 'This COD order is not awaiting cash payment.' using errcode = '55000';
  end if;

  update public.orders
  set payment_status = 'paid',
      payment_verified_at = now(),
      paid_at = now(),
      status = case
        when lower(coalesce(status, '')) in ('pending', 'pending verification') then 'Payment Verified'
        else status
      end
  where id = p_order_id;
end;
$$;

revoke all on function public.jpf_admin_mark_cod_paid(uuid) from public, anon;
grant execute on function public.jpf_admin_mark_cod_paid(uuid) to authenticated;

commit;
