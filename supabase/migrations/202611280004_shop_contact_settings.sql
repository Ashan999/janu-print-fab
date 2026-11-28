-- Public shop contact settings, editable by admins and readable by customers.
begin;

create table if not exists public.shop_settings (
  id text primary key default 'default' check (id = 'default'),
  contact_phone text,
  whatsapp_number text,
  contact_email text,
  business_address text,
  business_hours text,
  bank_name text,
  account_name text,
  account_number text,
  branch_name text,
  updated_at timestamptz not null default now()
);

alter table public.shop_settings
  add column if not exists contact_phone text,
  add column if not exists whatsapp_number text,
  add column if not exists contact_email text,
  add column if not exists business_address text,
  add column if not exists business_hours text,
  add column if not exists bank_name text,
  add column if not exists account_name text,
  add column if not exists account_number text,
  add column if not exists branch_name text,
  add column if not exists updated_at timestamptz not null default now();

insert into public.shop_settings (
  id, contact_phone, whatsapp_number, contact_email, business_address,
  business_hours, bank_name, account_name, account_number, branch_name
)
values ('default', '', '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

alter table public.shop_settings enable row level security;

drop policy if exists jpf_shop_settings_public_select on public.shop_settings;
create policy jpf_shop_settings_public_select on public.shop_settings
  for select to anon, authenticated
  using (id = 'default');

drop policy if exists jpf_shop_settings_public_select_guard on public.shop_settings;
create policy jpf_shop_settings_public_select_guard on public.shop_settings
  as restrictive for select to anon, authenticated
  using (id = 'default');

drop policy if exists jpf_shop_settings_admin_all on public.shop_settings;
create policy jpf_shop_settings_admin_all on public.shop_settings
  for all to authenticated
  using ((select public.jpf_app_is_admin()))
  with check ((select public.jpf_app_is_admin()));

drop policy if exists jpf_shop_settings_admin_insert_guard on public.shop_settings;
create policy jpf_shop_settings_admin_insert_guard on public.shop_settings
  as restrictive for insert to anon, authenticated
  with check ((select public.jpf_app_is_admin()));

drop policy if exists jpf_shop_settings_admin_update_guard on public.shop_settings;
create policy jpf_shop_settings_admin_update_guard on public.shop_settings
  as restrictive for update to anon, authenticated
  using ((select public.jpf_app_is_admin()))
  with check ((select public.jpf_app_is_admin()));

grant select on table public.shop_settings to anon, authenticated;
grant insert, update on table public.shop_settings to authenticated;

commit;
