-- Delivery fees are configurable by staff, visible to customers, and stored
-- with each order. COD order creation skips the legacy slip check only inside
-- the dedicated authenticated COD RPC; bank-transfer validation is unchanged.
begin;

alter table public.shop_settings
  add column if not exists delivery_fee numeric(12,2) not null default 0;

alter table public.orders
  add column if not exists delivery_fee numeric(12,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.shop_settings'::regclass
      and conname = 'shop_settings_delivery_fee_nonnegative'
  ) then
    alter table public.shop_settings
      add constraint shop_settings_delivery_fee_nonnegative check (delivery_fee >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_delivery_fee_nonnegative'
  ) then
    alter table public.orders
      add constraint orders_delivery_fee_nonnegative check (delivery_fee >= 0);
  end if;
end;
$$;

insert into public.shop_settings (
  id, contact_phone, whatsapp_number, contact_email, business_address,
  business_hours, bank_name, account_name, account_number, branch_name, delivery_fee
)
values ('default', '', '', '', '', '', '', '', '', '', 0)
on conflict (id) do nothing;

grant select on table public.shop_settings to anon, authenticated;
grant insert, update on table public.shop_settings to authenticated;

-- Patch the existing place_order validation so its legacy error is bypassed
-- only when called from the dedicated COD wrapper below. Keep the function's
-- current arguments, return type, and all other checks intact.
do $$
declare
  function_row record;
  patched_definition text;
  patched_count integer := 0;
begin
  for function_row in
    select p.oid, p.proname, pg_catalog.pg_get_functiondef(p.oid) as definition
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prosrc ilike '%Invalid payment slip%'
  loop
    patched_count := patched_count + 1;
    if position('current_setting(''jpf.payment_method''' in function_row.definition) > 0 then
      continue;
    end if;

    patched_definition := regexp_replace(
      function_row.definition,
      $pattern$(raise[[:space:]]+exception[[:space:]]+'Invalid payment slip[^']*'[^;]*;)$pattern$,
      $replacement$if pg_catalog.current_setting('jpf.payment_method', true) is distinct from 'cash_on_delivery' then \1 end if;$replacement$,
      'gi'
    );

    if patched_definition = function_row.definition then
      raise exception 'Could not safely update public.%: the expected Invalid payment slip check was not found.', function_row.proname;
    end if;

    execute patched_definition;
  end loop;

  if patched_count = 0 then
    raise exception 'Could not find a public database function containing the expected Invalid payment slip check. Please share the place_order SQL definition.';
  end if;
end;
$$;

create or replace function public.jpf_customer_place_cod_order(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to place an order.' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('jpf.payment_method', 'cash_on_delivery', true);

  execute $query$
    select pg_catalog.to_jsonb(placed_order)
    from public.place_order($1, $2, $3, $4, null::text, $5::jsonb) as placed_order
    limit 1
  $query$
  into order_result
  using p_customer_name, p_phone, p_address, p_notes, p_items;

  return order_result;
end;
$$;

revoke all on function public.jpf_customer_place_cod_order(text, text, text, text, jsonb) from public, anon;
grant execute on function public.jpf_customer_place_cod_order(text, text, text, text, jsonb) to authenticated;

create or replace function public.jpf_customer_apply_delivery_fee(p_order_id uuid)
returns numeric(12,2)
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record jsonb;
  configured_fee numeric(12,2);
  subtotal numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'Sign in to update the order total.' using errcode = '42501';
  end if;

  select pg_catalog.to_jsonb(o)
  into order_record
  from public.orders o
  where o.id = p_order_id
  for update;

  if order_record is null then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  if coalesce(order_record->>'user_id', order_record->>'customer_id') is distinct from auth.uid()::text then
    raise exception 'You cannot update this order.' using errcode = '42501';
  end if;

  select coalesce(s.delivery_fee, 0)
  into configured_fee
  from public.shop_settings s
  where s.id = 'default';
  configured_fee := coalesce(configured_fee, 0);

  select coalesce(sum(
    coalesce(i.unit_price, 0)
    * greatest(1, coalesce(nullif(pg_catalog.to_jsonb(i)->>'quantity', '')::integer, 1))
  ), 0)
  into subtotal
  from public.order_items i
  where (pg_catalog.to_jsonb(i)->>'order_id')::uuid = p_order_id;

  update public.orders o
  set delivery_fee = configured_fee,
      total_amount = subtotal + configured_fee,
      pricing_snapshot = coalesce(o.pricing_snapshot, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'subtotal', subtotal,
        'delivery_fee', configured_fee,
        'total_price', subtotal + configured_fee
      )
  where o.id = p_order_id;

  return configured_fee;
end;
$$;

revoke all on function public.jpf_customer_apply_delivery_fee(uuid) from public, anon;
grant execute on function public.jpf_customer_apply_delivery_fee(uuid) to authenticated;

comment on column public.shop_settings.delivery_fee is
  'Default LKR delivery fee displayed at checkout and saved to each new order.';
comment on column public.orders.delivery_fee is
  'Delivery charge applied when this order was placed.';

commit;
