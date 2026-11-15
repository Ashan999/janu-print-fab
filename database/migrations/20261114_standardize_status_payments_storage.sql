-- Janu Print | FAB - standardisation + hardening migration (2026-11-14)
-- Run ONCE in Supabase SQL Editor, AFTER database/payment-flow-final.sql.
-- Safe to re-run. Does not drop tables or columns and does not disable RLS.
--
-- What this does
--   1. orders.payment_method check now also allows 'payhere'
--   2. order status is always stored lower-case (pending, accepted, printing,
--      ready, completed, cancelled) - existing rows are normalised and a
--      trigger keeps it that way for every client (customer site, admin, SQL)
--   3. every status change is logged to order_status_history by a trigger
--   4. admin can read/write order_status_history, customers can read their own
--   5. tracking columns used by the admin dashboard exist on orders
--   6. jpf_get_payment_status accepts the payment token OR the order owner OR admin
--   7. artwork bucket becomes PRIVATE (signed URLs only) and uploaders can clean up
--      files of an order that was never created; receipts can be cleaned up while
--      the order still accepts a receipt
--   8. contact_details gets bank / PayHere / logo columns if they are missing
--   9. admin can upload branding images (logo)

begin;

-- ---------------------------------------------------------------------------
-- helper (same definition as payment-flow-final.sql, repeated so this file
-- can be run on its own)
-- ---------------------------------------------------------------------------
create or replace function public.jpf_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_profiles ap where ap.id = auth.uid());
$$;
grant execute on function public.jpf_is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. payment method check (adds payhere; legacy rows are not re-validated)
-- ---------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method is null
         or payment_method in ('bank_deposit', 'online_transfer', 'bank_transfer', 'payhere'))
  not valid;

-- ---------------------------------------------------------------------------
-- 2. one status format everywhere: lower-case
-- ---------------------------------------------------------------------------
update public.orders
   set status = lower(trim(status))
 where status is not null and status <> lower(trim(status));

update public.order_status_history
   set status = lower(trim(status))
 where status is not null and status <> lower(trim(status));

create or replace function public.jpf_normalize_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is not null then
    new.status := lower(trim(new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists jpf_normalize_status_trg on public.orders;
create trigger jpf_normalize_status_trg
before insert or update of status on public.orders
for each row execute function public.jpf_normalize_status();

drop trigger if exists jpf_normalize_status_trg on public.order_status_history;
create trigger jpf_normalize_status_trg
before insert or update of status on public.order_status_history
for each row execute function public.jpf_normalize_status();

-- ---------------------------------------------------------------------------
-- 3. log every status change (the initial 'pending' row is already created by
--    jp_order_initial_status, so only UPDATEs are logged here)
-- ---------------------------------------------------------------------------
create or replace function public.jpf_log_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not null and new.status is distinct from old.status then
    insert into public.order_status_history (order_id, status, note)
    values (new.id, new.status, 'Status updated.');
  end if;
  return new;
end;
$$;

drop trigger if exists jpf_log_status_change_trg on public.orders;
create trigger jpf_log_status_change_trg
after update of status on public.orders
for each row execute function public.jpf_log_status_change();

-- ---------------------------------------------------------------------------
-- 4. order_status_history access
-- ---------------------------------------------------------------------------
drop policy if exists jpf_history_admin_all on public.order_status_history;
create policy jpf_history_admin_all on public.order_status_history
  for all to authenticated
  using (public.jpf_is_admin())
  with check (public.jpf_is_admin());

drop policy if exists jpf_history_select_owner on public.order_status_history;
create policy jpf_history_select_owner on public.order_status_history
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_status_history.order_id
      and o.customer_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- 5. admin tracking columns + admin write access on orders
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists delivery_provider text,
  add column if not exists tracking_number text,
  add column if not exists estimated_delivery timestamptz,
  add column if not exists dispatched_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'jpf_admin_orders_all'
  ) then
    create policy jpf_admin_orders_all on public.orders
      for all to authenticated
      using (public.jpf_is_admin())
      with check (public.jpf_is_admin());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. payment status RPC: token holder, order owner or admin
-- ---------------------------------------------------------------------------
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
    and (
      public.jpf_payment_token_matches(p_order_id, coalesce(p_payment_token, ''))
      or public.jpf_owns_order(p_order_id::text)
      or public.jpf_is_admin()
    );
$$;
grant execute on function public.jpf_get_payment_status(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7a. artwork bucket: private + signed URLs
--     Folder 1 of every object is the order id (uuid) generated by the browser
--     before the order exists. "Unclaimed" = no order with that id yet.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('artwork', 'artwork', false)
on conflict (id) do update set public = false;

create or replace function public.jpf_artwork_unclaimed(p_order_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_order_id, '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     and not exists (select 1 from public.orders o where o.id::text = p_order_id);
$$;
revoke all on function public.jpf_artwork_unclaimed(text) from public;
grant execute on function public.jpf_artwork_unclaimed(text) to anon, authenticated;

-- remove old public/anon read policies that mention the artwork bucket
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and concat_ws(' ', qual, with_check) ilike '%artwork%'
      and policyname not like 'jpf\_artwork\_%' escape '\'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

drop policy if exists jpf_artwork_insert on storage.objects;
create policy jpf_artwork_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'artwork'
              and public.jpf_artwork_unclaimed((storage.foldername(name))[1]));

drop policy if exists jpf_artwork_select_admin on storage.objects;
create policy jpf_artwork_select_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'artwork' and public.jpf_is_admin());

drop policy if exists jpf_artwork_select_owner on storage.objects;
create policy jpf_artwork_select_owner on storage.objects
  for select to authenticated
  using (bucket_id = 'artwork' and public.jpf_owns_order((storage.foldername(name))[1]));

drop policy if exists jpf_artwork_select_unclaimed on storage.objects;
create policy jpf_artwork_select_unclaimed on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'artwork' and public.jpf_artwork_unclaimed((storage.foldername(name))[1]));

drop policy if exists jpf_artwork_delete_unclaimed on storage.objects;
create policy jpf_artwork_delete_unclaimed on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'artwork' and public.jpf_artwork_unclaimed((storage.foldername(name))[1]));

-- restrictive guards: nothing else can widen access to this bucket
drop policy if exists jpf_artwork_select_guard on storage.objects;
create policy jpf_artwork_select_guard on storage.objects
  as restrictive for select to anon, authenticated
  using (bucket_id <> 'artwork'
         or public.jpf_is_admin()
         or public.jpf_owns_order((storage.foldername(name))[1])
         or public.jpf_artwork_unclaimed((storage.foldername(name))[1]));

drop policy if exists jpf_artwork_insert_guard on storage.objects;
create policy jpf_artwork_insert_guard on storage.objects
  as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'artwork'
              or public.jpf_artwork_unclaimed((storage.foldername(name))[1]));

drop policy if exists jpf_artwork_update_guard on storage.objects;
create policy jpf_artwork_update_guard on storage.objects
  as restrictive for update to anon, authenticated
  using (bucket_id <> 'artwork') with check (bucket_id <> 'artwork');

drop policy if exists jpf_artwork_delete_guard on storage.objects;
create policy jpf_artwork_delete_guard on storage.objects
  as restrictive for delete to anon, authenticated
  using (bucket_id <> 'artwork'
         or public.jpf_artwork_unclaimed((storage.foldername(name))[1]));

-- ---------------------------------------------------------------------------
-- 7b. payment-slips: allow clean-up of a receipt while the order still accepts
--     one (pending / rejected / failed). Submitted receipts stay locked.
-- ---------------------------------------------------------------------------
drop policy if exists jpf_receipts_select_capability on storage.objects;
create policy jpf_receipts_select_capability on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'payment-slips'
         and public.jpf_order_accepts_receipt((storage.foldername(name))[1], (storage.foldername(name))[2]));

drop policy if exists jpf_receipts_select_guard on storage.objects;
create policy jpf_receipts_select_guard on storage.objects
  as restrictive for select to anon, authenticated
  using (bucket_id <> 'payment-slips'
         or public.jpf_is_admin()
         or public.jpf_owns_order((storage.foldername(name))[1])
         or public.jpf_order_accepts_receipt((storage.foldername(name))[1], (storage.foldername(name))[2]));

drop policy if exists jpf_receipts_delete_capability on storage.objects;
create policy jpf_receipts_delete_capability on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'payment-slips'
         and public.jpf_order_accepts_receipt((storage.foldername(name))[1], (storage.foldername(name))[2]));

drop policy if exists jpf_receipts_delete_guard on storage.objects;
create policy jpf_receipts_delete_guard on storage.objects
  as restrictive for delete to anon, authenticated
  using (bucket_id <> 'payment-slips'
         or public.jpf_order_accepts_receipt((storage.foldername(name))[1], (storage.foldername(name))[2]));

-- ---------------------------------------------------------------------------
-- 8. contact_details: bank / PayHere / logo settings (no fake defaults)
-- ---------------------------------------------------------------------------
alter table public.contact_details
  add column if not exists bank_name text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_branch text,
  add column if not exists bank_instructions text,
  add column if not exists currency text default 'LKR',
  add column if not exists payhere_enabled boolean default false,
  add column if not exists payhere_merchant_id text,
  add column if not exists payhere_sandbox boolean default true,
  add column if not exists logo_url text;

-- ---------------------------------------------------------------------------
-- 9. branding bucket: public read (logo) + admin upload/delete
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists jpf_admin_branding_insert on storage.objects;
create policy jpf_admin_branding_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and public.jpf_is_admin());

drop policy if exists jpf_admin_branding_delete on storage.objects;
create policy jpf_admin_branding_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and public.jpf_is_admin());

commit;

-- Optional checks after running:
--   select distinct status from public.orders;                      -- all lower-case
--   select id, public from storage.buckets where id = 'artwork';    -- public = false
--   select conname, convalidated from pg_constraint where conname = 'orders_payment_method_check';
