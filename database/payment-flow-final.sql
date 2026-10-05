-- Final self-contained Janu Print | FAB payment security migration.
-- Run this entire file once in the Supabase SQL Editor.
-- Preserves the existing payment_method check and values:
-- bank_deposit, online_transfer, bank_transfer. PayHere remains disabled.

begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.orders
  add column if not exists payment_status text default 'pending',
  add column if not exists payment_reference text,
  add column if not exists payment_receipt_url text,
  add column if not exists payment_notes text,
  add column if not exists payment_amount numeric,
  add column if not exists payment_submitted_at timestamptz,
  add column if not exists payment_verified_at timestamptz,
  add column if not exists payhere_payment_id text,
  add column if not exists payhere_order_id text,
  add column if not exists payment_capability_hash text;

create table if not exists public.order_payment_capabilities (
  order_id uuid primary key,
  token_hash text not null,
  created_at timestamptz not null default now(),
  constraint order_payment_capabilities_hash_check
    check (token_hash ~ '^[a-f0-9]{64}$')
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.order_payment_capabilities'::regclass
      and conname = 'order_payment_capabilities_hash_check'
  ) then
    alter table public.order_payment_capabilities
      add constraint order_payment_capabilities_hash_check
      check (token_hash ~ '^[a-f0-9]{64}$');
  end if;
end;
$$;

alter table public.order_payment_capabilities enable row level security;
revoke all on table public.order_payment_capabilities from public, anon, authenticated;

create or replace function public.jpf_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles ap
    where ap.id = auth.uid()
  );
$$;

create or replace function public.jpf_payment_token_matches(
  p_order_id uuid,
  p_payment_token text
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    p_payment_token ~ '^[a-f0-9]{64}$'
    and exists (
      select 1
      from public.order_payment_capabilities c
      where c.order_id = p_order_id
        and c.token_hash = encode(digest(convert_to(p_payment_token, 'UTF8'), 'sha256'), 'hex')
    ),
    false
  );
$$;

create or replace function public.jpf_capture_payment_capability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_capability_hash is null then
    if coalesce(auth.role(), '') in ('anon', 'authenticated')
       and not public.jpf_is_admin() then
      raise exception 'A payment capability is required to create an order.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.payment_capability_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid payment capability hash.'
      using errcode = '22023';
  end if;

  insert into public.order_payment_capabilities (order_id, token_hash)
  values (new.id, new.payment_capability_hash);

  new.payment_capability_hash := null;
  return new;
end;
$$;

create or replace function public.jpf_guard_payment_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.payment_status := 'pending';
    new.payment_reference := null;
    new.payment_receipt_url := null;
    new.payment_amount := null;
    new.payment_submitted_at := null;
    new.payment_verified_at := null;
    new.payhere_payment_id := null;
    new.payhere_order_id := null;
    return new;
  end if;

  if new.payment_capability_hash is distinct from old.payment_capability_hash then
    raise exception 'Payment capability hashes cannot be changed after order creation.'
      using errcode = '42501';
  end if;

  if current_user in ('anon', 'authenticated')
     and row(
       new.payment_status, new.payment_method, new.payment_reference, new.payment_receipt_url,
       new.payment_amount, new.payment_submitted_at, new.payment_verified_at,
       new.payhere_payment_id, new.payhere_order_id
     ) is distinct from row(
       old.payment_status, old.payment_method, old.payment_reference, old.payment_receipt_url,
       old.payment_amount, old.payment_submitted_at, old.payment_verified_at,
       old.payhere_payment_id, old.payhere_order_id
     ) then
    raise exception 'Payment fields can only be changed through payment RPCs.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.jpf_cleanup_payment_capability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.order_payment_capabilities
  where order_id = old.id;
  return old;
end;
$$;

create or replace function public.jpf_order_accepts_receipt(
  p_order_id text,
  p_capability_hash text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    join public.order_payment_capabilities c on c.order_id = o.id
    where o.id::text = p_order_id
      and p_capability_hash ~ '^[a-f0-9]{64}$'
      and c.token_hash = p_capability_hash
      and o.payment_method = 'bank_transfer'
      and coalesce(o.payment_status, 'pending') in ('pending', 'rejected', 'failed')
  );
$$;

create or replace function public.jpf_owns_order(p_order_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.orders o
      where o.id::text = p_order_id
        and o.customer_id = auth.uid()
    );
$$;

create or replace function public.jpf_submit_bank_payment(
  p_order_id uuid,
  p_payment_token text,
  p_reference text,
  p_receipt_path text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  o public.orders;
begin
  select * into o
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;
  if not public.jpf_payment_token_matches(p_order_id, p_payment_token) then
    raise exception 'A valid payment capability is required.' using errcode = '42501';
  end if;
  if o.payment_method is distinct from 'bank_transfer' then
    raise exception 'This order is not using bank transfer.';
  end if;
  if coalesce(o.payment_status, 'pending') not in ('pending', 'rejected', 'failed') then
    raise exception 'Payment can no longer be changed for this order.';
  end if;
  if nullif(p_receipt_path, '') is null
     or split_part(p_receipt_path, '/', 1) <> p_order_id::text
     or split_part(p_receipt_path, '/', 2)
        <> encode(digest(convert_to(p_payment_token, 'UTF8'), 'sha256'), 'hex') then
    raise exception 'A valid bank transfer slip is required.';
  end if;
  if not exists (
    select 1
    from storage.objects so
    where so.bucket_id = 'payment-slips'
      and so.name = p_receipt_path
  ) then
    raise exception 'The uploaded payment slip could not be found.';
  end if;

  update public.orders
  set payment_status = 'receipt_submitted',
      payment_reference = nullif(trim(p_reference), ''),
      payment_receipt_url = p_receipt_path,
      payment_amount = o.total_amount,
      payment_submitted_at = now(),
      payment_verified_at = null,
      payment_notes = nullif(trim(p_notes), '')
  where id = p_order_id;
end;
$$;

create or replace function public.jpf_get_payment_status(
  p_order_id uuid,
  p_payment_token text
)
returns table(payment_status text, payment_method text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(o.payment_status, 'pending'), o.payment_method
  from public.orders o
  where o.id = p_order_id
    and public.jpf_payment_token_matches(p_order_id, p_payment_token);
$$;

create or replace function public.jpf_admin_review_payment(
  p_order_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
begin
  if not public.jpf_is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('paid', 'rejected', 'under_review') then
    raise exception 'Invalid payment review decision.';
  end if;

  select * into o
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;
  if o.payment_method is distinct from 'bank_transfer' then
    raise exception 'Only bank transfers can be reviewed manually.';
  end if;
  if coalesce(o.payment_status, 'pending') not in ('receipt_submitted', 'under_review') then
    raise exception 'Only submitted payments can be reviewed.';
  end if;
  if p_decision = 'paid' and o.payment_receipt_url is null then
    raise exception 'Cannot approve a payment without an uploaded receipt.';
  end if;
  if p_decision = 'rejected' and nullif(trim(p_note), '') is null then
    raise exception 'Add a note explaining the rejection.';
  end if;

  update public.orders
  set payment_status = p_decision,
      payment_verified_at = case when p_decision = 'paid' then now() else null end,
      payment_notes = nullif(trim(p_note), '')
  where id = p_order_id;
end;
$$;

drop trigger if exists jpf_a_capture_payment_capability_trg on public.orders;
create trigger jpf_a_capture_payment_capability_trg
before insert on public.orders
for each row execute function public.jpf_capture_payment_capability();

drop trigger if exists jpf_guard_payment_columns_trg on public.orders;
create trigger jpf_guard_payment_columns_trg
before insert or update on public.orders
for each row execute function public.jpf_guard_payment_columns();

drop trigger if exists jpf_cleanup_payment_capability_trg on public.orders;
create trigger jpf_cleanup_payment_capability_trg
after delete on public.orders
for each row execute function public.jpf_cleanup_payment_capability();

drop policy if exists jpf_customer_payment_update on public.orders;

revoke all on function public.jpf_is_admin() from public, anon, authenticated;
revoke all on function public.jpf_payment_token_matches(uuid, text) from public, anon, authenticated;
revoke all on function public.jpf_capture_payment_capability() from public, anon, authenticated;
revoke all on function public.jpf_cleanup_payment_capability() from public, anon, authenticated;
revoke all on function public.jpf_guard_payment_columns() from public, anon, authenticated;
revoke all on function public.jpf_order_accepts_receipt(text, text) from public, anon, authenticated;
revoke all on function public.jpf_owns_order(text) from public, anon, authenticated;
revoke all on function public.jpf_submit_bank_payment(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.jpf_get_payment_status(uuid, text) from public, anon, authenticated;
revoke all on function public.jpf_admin_review_payment(uuid, text, text) from public, anon, authenticated;

grant execute on function public.jpf_is_admin() to anon, authenticated;
grant execute on function public.jpf_order_accepts_receipt(text, text) to anon, authenticated;
grant execute on function public.jpf_owns_order(text) to anon, authenticated;
grant execute on function public.jpf_submit_bank_payment(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.jpf_get_payment_status(uuid, text) to anon, authenticated;
grant execute on function public.jpf_admin_review_payment(uuid, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-slips',
  'payment-slips',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- Remove old public reads and any old payment-slip write policies. Restrictive
-- bucket guards below also block broad generic policies from exposing this bucket.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        (
          cmd = 'SELECT'
          and (
            roles && array['anon'::name, 'public'::name]
            or concat_ws(' ', qual, with_check) ilike '%payment-slips%'
          )
        )
        or cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      )
      and concat_ws(' ', qual, with_check) ilike '%payment-slips%'
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end;
$$;

drop policy if exists jpf_receipts_insert on storage.objects;
create policy jpf_receipts_insert on storage.objects
for insert to anon, authenticated
with check (
  bucket_id = 'payment-slips'
  and public.jpf_order_accepts_receipt(
    (storage.foldername(name))[1],
    (storage.foldername(name))[2]
  )
);

drop policy if exists jpf_receipts_select_admin on storage.objects;
create policy jpf_receipts_select_admin on storage.objects
for select to authenticated
using (bucket_id = 'payment-slips' and public.jpf_is_admin());

drop policy if exists jpf_receipts_select_owner on storage.objects;
create policy jpf_receipts_select_owner on storage.objects
for select to authenticated
using (
  bucket_id = 'payment-slips'
  and public.jpf_owns_order((storage.foldername(name))[1])
);

drop policy if exists jpf_receipts_select_guard on storage.objects;
create policy jpf_receipts_select_guard on storage.objects
as restrictive for select to anon, authenticated
using (
  bucket_id <> 'payment-slips'
  or public.jpf_is_admin()
  or public.jpf_owns_order((storage.foldername(name))[1])
);

drop policy if exists jpf_receipts_insert_guard on storage.objects;
create policy jpf_receipts_insert_guard on storage.objects
as restrictive for insert to anon, authenticated
with check (
  bucket_id <> 'payment-slips'
  or public.jpf_order_accepts_receipt(
    (storage.foldername(name))[1],
    (storage.foldername(name))[2]
  )
);

drop policy if exists jpf_receipts_update_guard on storage.objects;
create policy jpf_receipts_update_guard on storage.objects
as restrictive for update to anon, authenticated
using (bucket_id <> 'payment-slips')
with check (bucket_id <> 'payment-slips');

drop policy if exists jpf_receipts_delete_guard on storage.objects;
create policy jpf_receipts_delete_guard on storage.objects
as restrictive for delete to anon, authenticated
using (bucket_id <> 'payment-slips');

commit;
