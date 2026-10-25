-- Janu Print | FAB — Admin-only catalog writes and catalog image uploads.
-- Apply manually in the Supabase SQL Editor after reviewing the target project.
-- Does not disable RLS, modify existing bucket settings, or expose service-role access.

begin;

-- The app uses public image URLs, so create these buckets as public only when
-- absent. Existing bucket visibility and upload settings are left unchanged.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  ('products', 'products', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('gallery', 'gallery', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Use a separate SECURITY DEFINER check to avoid recursive RLS evaluation on
-- admin_profiles without changing the helper used by existing payment policies.
-- It only answers whether the current auth.uid() exists in the admin allowlist.
create or replace function public.jpf_is_catalog_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.admin_profiles ap
    where ap.id = (select auth.uid())
  );
$$;

revoke all on function public.jpf_is_catalog_admin() from public, anon, authenticated;
grant execute on function public.jpf_is_catalog_admin() to authenticated;

alter table public.categories enable row level security;
alter table public.products enable row level security;

drop policy if exists jpf_admin_categories_insert on public.categories;
create policy jpf_admin_categories_insert
  on public.categories
  for insert
  to authenticated
  with check ((select public.jpf_is_catalog_admin()));

drop policy if exists jpf_admin_categories_update on public.categories;
create policy jpf_admin_categories_update
  on public.categories
  for update
  to authenticated
  using ((select public.jpf_is_catalog_admin()))
  with check ((select public.jpf_is_catalog_admin()));

drop policy if exists jpf_admin_categories_delete on public.categories;
create policy jpf_admin_categories_delete
  on public.categories
  for delete
  to authenticated
  using ((select public.jpf_is_catalog_admin()));

drop policy if exists jpf_admin_products_insert on public.products;
create policy jpf_admin_products_insert
  on public.products
  for insert
  to authenticated
  with check ((select public.jpf_is_catalog_admin()));

drop policy if exists jpf_admin_products_update on public.products;
create policy jpf_admin_products_update
  on public.products
  for update
  to authenticated
  using ((select public.jpf_is_catalog_admin()))
  with check ((select public.jpf_is_catalog_admin()));

drop policy if exists jpf_admin_catalog_images_insert on storage.objects;
create policy jpf_admin_catalog_images_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('products', 'gallery')
    and (select public.jpf_is_catalog_admin())
  );

drop policy if exists jpf_admin_catalog_images_delete on storage.objects;
create policy jpf_admin_catalog_images_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('products', 'gallery')
    and (select public.jpf_is_catalog_admin())
  );

commit;

-- After applying, verify the policies with:
-- select schemaname, tablename, policyname, roles, cmd, qual, with_check
-- from pg_policies
-- where (schemaname = 'public' and tablename in ('categories', 'products'))
--    or (schemaname = 'storage' and tablename = 'objects')
-- order by schemaname, tablename, policyname;
