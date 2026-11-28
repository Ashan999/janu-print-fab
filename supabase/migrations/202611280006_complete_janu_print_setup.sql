-- Janu Print FAB: consolidated Supabase setup bundle
-- Combines repository migrations 001 through 005 in dependency order.
-- Prerequisites: the existing core tables, base order RPC, and base payment setup must already be installed.
-- Apply this single file in the Supabase SQL Editor; do not separately run migrations 001-005 afterward.

begin;

-- Included migration: 202611280001_janu_print_customer_and_pricing_hardening.sql
  -- Janu Print FAB customer data and pricing hardening.
  -- Additive migration: does not delete catalog, customer, or order data.
  -- Apply to the Supabase project used by this storefront before deploying the UI.



  -- Delegate to the same admin check used by the React app. This project may
  -- store its allowlist in a differently named table, so do not assume a table.
  create or replace function public.jpf_app_is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
  set row_security = off
  as $$
    select coalesce(public.is_admin(), false);
  $$;

  revoke all on function public.jpf_app_is_admin() from public, anon;
  grant execute on function public.jpf_app_is_admin() to anon, authenticated;

  -- Public catalog fields and additional product photography.
  alter table public.products
    add column if not exists is_active boolean not null default true;

  create table if not exists public.product_images (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id) on delete cascade,
    image_url text not null,
    role text not null default 'detail',
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    constraint product_images_role_check check (role in ('main', 'front', 'back', 'detail', 'model')),
    constraint product_images_sort_check check (sort_order >= 0)
  );
  create index if not exists product_images_product_sort_idx
    on public.product_images (product_id, sort_order, created_at);

  alter table public.products enable row level security;
  alter table public.product_images enable row level security;
  alter table public.pricing_rules enable row level security;
  alter table public.category_settings enable row level security;
  alter table public.product_print_configs enable row level security;

  drop policy if exists jpf_products_catalog_select on public.products;
  create policy jpf_products_catalog_select on public.products
    for select to anon, authenticated
    using (is_active = true or (select public.jpf_app_is_admin()));
  drop policy if exists jpf_products_active_read_guard on public.products;
  create policy jpf_products_active_read_guard on public.products
    as restrictive for select to anon, authenticated
    using (is_active = true or (select public.jpf_app_is_admin()));
  drop policy if exists jpf_products_write_admin_insert_guard on public.products;
  drop policy if exists jpf_products_admin_insert on public.products;
  create policy jpf_products_admin_insert on public.products
    for insert to authenticated with check ((select public.jpf_app_is_admin()));
  create policy jpf_products_write_admin_insert_guard on public.products
    as restrictive for insert to anon, authenticated
    with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_products_write_admin_update_guard on public.products;
  drop policy if exists jpf_products_admin_update on public.products;
  create policy jpf_products_admin_update on public.products
    for update to authenticated
    using ((select public.jpf_app_is_admin()))
    with check ((select public.jpf_app_is_admin()));
  create policy jpf_products_write_admin_update_guard on public.products
    as restrictive for update to anon, authenticated
    using ((select public.jpf_app_is_admin()))
    with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_products_write_admin_delete_guard on public.products;
  drop policy if exists jpf_products_admin_delete on public.products;
  create policy jpf_products_admin_delete on public.products
    for delete to authenticated using ((select public.jpf_app_is_admin()));
  create policy jpf_products_write_admin_delete_guard on public.products
    as restrictive for delete to anon, authenticated
    using ((select public.jpf_app_is_admin()));

  drop policy if exists jpf_product_images_catalog_select on public.product_images;
  create policy jpf_product_images_catalog_select on public.product_images
    for select to anon, authenticated
    using (
      (select public.jpf_app_is_admin())
      or exists (select 1 from public.products p where p.id = product_images.product_id and p.is_active = true)
    );
  drop policy if exists jpf_product_images_admin_insert_guard on public.product_images;
  drop policy if exists jpf_product_images_admin_insert on public.product_images;
  create policy jpf_product_images_admin_insert on public.product_images
    for insert to authenticated with check ((select public.jpf_app_is_admin()));
  create policy jpf_product_images_admin_insert_guard on public.product_images
    as restrictive for insert to anon, authenticated with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_product_images_admin_update_guard on public.product_images;
  drop policy if exists jpf_product_images_admin_update on public.product_images;
  create policy jpf_product_images_admin_update on public.product_images
    for update to authenticated
    using ((select public.jpf_app_is_admin())) with check ((select public.jpf_app_is_admin()));
  create policy jpf_product_images_admin_update_guard on public.product_images
    as restrictive for update to anon, authenticated
    using ((select public.jpf_app_is_admin())) with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_product_images_admin_delete_guard on public.product_images;
  drop policy if exists jpf_product_images_admin_delete on public.product_images;
  create policy jpf_product_images_admin_delete on public.product_images
    for delete to authenticated using ((select public.jpf_app_is_admin()));
  create policy jpf_product_images_admin_delete_guard on public.product_images
    as restrictive for delete to anon, authenticated using ((select public.jpf_app_is_admin()));

  drop policy if exists jpf_pricing_rules_active_read on public.pricing_rules;
  create policy jpf_pricing_rules_active_read on public.pricing_rules
    for select to anon, authenticated using (is_active = true or (select public.jpf_app_is_admin()));
  drop policy if exists jpf_pricing_rules_active_read_guard on public.pricing_rules;
  create policy jpf_pricing_rules_active_read_guard on public.pricing_rules
    as restrictive for select to anon, authenticated
    using (is_active = true or (select public.jpf_app_is_admin()));
  drop policy if exists jpf_pricing_rules_admin_insert_guard on public.pricing_rules;
  drop policy if exists jpf_pricing_rules_admin_insert on public.pricing_rules;
  create policy jpf_pricing_rules_admin_insert on public.pricing_rules
    for insert to authenticated with check ((select public.jpf_app_is_admin()));
  create policy jpf_pricing_rules_admin_insert_guard on public.pricing_rules
    as restrictive for insert to anon, authenticated with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_pricing_rules_admin_update_guard on public.pricing_rules;
  drop policy if exists jpf_pricing_rules_admin_update on public.pricing_rules;
  create policy jpf_pricing_rules_admin_update on public.pricing_rules
    for update to authenticated
    using ((select public.jpf_app_is_admin())) with check ((select public.jpf_app_is_admin()));
  create policy jpf_pricing_rules_admin_update_guard on public.pricing_rules
    as restrictive for update to anon, authenticated
    using ((select public.jpf_app_is_admin())) with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_pricing_rules_admin_delete_guard on public.pricing_rules;
  drop policy if exists jpf_pricing_rules_admin_delete on public.pricing_rules;
  create policy jpf_pricing_rules_admin_delete on public.pricing_rules
    for delete to authenticated using ((select public.jpf_app_is_admin()));
  create policy jpf_pricing_rules_admin_delete_guard on public.pricing_rules
    as restrictive for delete to anon, authenticated using ((select public.jpf_app_is_admin()));

  drop policy if exists jpf_category_settings_read on public.category_settings;
  create policy jpf_category_settings_read on public.category_settings
    for select to anon, authenticated
    using (is_active = true or (select public.jpf_app_is_admin()));
  drop policy if exists jpf_category_settings_read_guard on public.category_settings;
  create policy jpf_category_settings_read_guard on public.category_settings
    as restrictive for select to anon, authenticated
    using (is_active = true or (select public.jpf_app_is_admin()));
  drop policy if exists jpf_category_settings_admin_insert_guard on public.category_settings;
  drop policy if exists jpf_category_settings_admin_insert on public.category_settings;
  create policy jpf_category_settings_admin_insert on public.category_settings
    for insert to authenticated with check ((select public.jpf_app_is_admin()));
  create policy jpf_category_settings_admin_insert_guard on public.category_settings
    as restrictive for insert to anon, authenticated with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_category_settings_admin_update_guard on public.category_settings;
  drop policy if exists jpf_category_settings_admin_update on public.category_settings;
  create policy jpf_category_settings_admin_update on public.category_settings
    for update to authenticated
    using ((select public.jpf_app_is_admin())) with check ((select public.jpf_app_is_admin()));
  create policy jpf_category_settings_admin_update_guard on public.category_settings
    as restrictive for update to anon, authenticated
    using ((select public.jpf_app_is_admin())) with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_category_settings_admin_delete_guard on public.category_settings;
  drop policy if exists jpf_category_settings_admin_delete on public.category_settings;
  create policy jpf_category_settings_admin_delete on public.category_settings
    for delete to authenticated using ((select public.jpf_app_is_admin()));
  create policy jpf_category_settings_admin_delete_guard on public.category_settings
    as restrictive for delete to anon, authenticated using ((select public.jpf_app_is_admin()));

  drop policy if exists jpf_product_print_configs_read on public.product_print_configs;
  create policy jpf_product_print_configs_read on public.product_print_configs
    for select to anon, authenticated using (true);
  drop policy if exists jpf_product_print_configs_admin_insert_guard on public.product_print_configs;
  drop policy if exists jpf_product_print_configs_admin_insert on public.product_print_configs;
  create policy jpf_product_print_configs_admin_insert on public.product_print_configs
    for insert to authenticated with check ((select public.jpf_app_is_admin()));
  create policy jpf_product_print_configs_admin_insert_guard on public.product_print_configs
    as restrictive for insert to anon, authenticated with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_product_print_configs_admin_update_guard on public.product_print_configs;
  drop policy if exists jpf_product_print_configs_admin_update on public.product_print_configs;
  create policy jpf_product_print_configs_admin_update on public.product_print_configs
    for update to authenticated
    using ((select public.jpf_app_is_admin())) with check ((select public.jpf_app_is_admin()));
  create policy jpf_product_print_configs_admin_update_guard on public.product_print_configs
    as restrictive for update to anon, authenticated
    using ((select public.jpf_app_is_admin())) with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_product_print_configs_admin_delete_guard on public.product_print_configs;
  drop policy if exists jpf_product_print_configs_admin_delete on public.product_print_configs;
  create policy jpf_product_print_configs_admin_delete on public.product_print_configs
    for delete to authenticated using ((select public.jpf_app_is_admin()));
  create policy jpf_product_print_configs_admin_delete_guard on public.product_print_configs
    as restrictive for delete to anon, authenticated using ((select public.jpf_app_is_admin()));

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'gallery-images', 'gallery-images', true, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  )
  on conflict (id) do update
    set public = true,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists jpf_gallery_images_public_read on storage.objects;
  create policy jpf_gallery_images_public_read on storage.objects
    for select to anon, authenticated using (bucket_id = 'gallery-images');
  drop policy if exists jpf_gallery_images_admin_insert on storage.objects;
  create policy jpf_gallery_images_admin_insert on storage.objects
    for insert to authenticated
    with check (bucket_id = 'gallery-images' and (select public.jpf_app_is_admin()));
  drop policy if exists jpf_gallery_images_admin_update on storage.objects;
  create policy jpf_gallery_images_admin_update on storage.objects
    for update to authenticated
    using (bucket_id = 'gallery-images' and (select public.jpf_app_is_admin()))
    with check (bucket_id = 'gallery-images' and (select public.jpf_app_is_admin()));
  drop policy if exists jpf_gallery_images_admin_delete on storage.objects;
  create policy jpf_gallery_images_admin_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'gallery-images' and (select public.jpf_app_is_admin()));
  drop policy if exists jpf_gallery_images_admin_insert_guard on storage.objects;
  create policy jpf_gallery_images_admin_insert_guard on storage.objects
    as restrictive for insert to anon, authenticated
    with check (bucket_id <> 'gallery-images' or (select public.jpf_app_is_admin()));
  drop policy if exists jpf_gallery_images_admin_update_guard on storage.objects;
  create policy jpf_gallery_images_admin_update_guard on storage.objects
    as restrictive for update to anon, authenticated
    using (bucket_id <> 'gallery-images' or (select public.jpf_app_is_admin()))
    with check (bucket_id <> 'gallery-images' or (select public.jpf_app_is_admin()));
  drop policy if exists jpf_gallery_images_admin_delete_guard on storage.objects;
  create policy jpf_gallery_images_admin_delete_guard on storage.objects
    as restrictive for delete to anon, authenticated
    using (bucket_id <> 'gallery-images' or (select public.jpf_app_is_admin()));

  -- Central pricing supports product overrides and exact package definitions.
  alter table public.pricing_rules
    add column if not exists product_id uuid references public.products(id) on delete cascade,
    add column if not exists combination_config jsonb;

  -- Preserve the project's current rule types while allowing the new custom base
  -- rule. Reuse the existing check expression instead of guessing its old list.
  do $$
  declare
    existing_definition text;
    existing_expression text;
    constraint_is_valid boolean;
  begin
    select pg_get_constraintdef(c.oid), c.convalidated
      into existing_definition, constraint_is_valid
    from pg_constraint c
    where c.conrelid = 'public.pricing_rules'::regclass
      and c.conname = 'pricing_rules_rule_type_check'
      and c.contype = 'c';

    if existing_definition is not null then
      existing_expression := regexp_replace(existing_definition, '^CHECK[[:space:]]+', '', 'i');
      existing_expression := regexp_replace(existing_expression, '[[:space:]]+NOT VALID$', '', 'i');

      if strpos(lower(existing_expression), lower(quote_literal('custom'))) = 0 then
        alter table public.pricing_rules drop constraint pricing_rules_rule_type_check;
        execute format(
          'alter table public.pricing_rules add constraint pricing_rules_rule_type_check check ((%s) or rule_type::text = %L)%s',
          existing_expression,
          'custom',
          case when constraint_is_valid then '' else ' not valid' end
        );
      end if;
    end if;
  end;
  $$;

  do $$
  begin
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.pricing_rules'::regclass
        and conname = 'pricing_rules_combination_config_array_check'
    ) then
      alter table public.pricing_rules
        add constraint pricing_rules_combination_config_array_check
        check (
          combination_config is null
          or (
            case
              when jsonb_typeof(combination_config) = 'array'
                then jsonb_array_length(combination_config) >= 2
              else false
            end
          )
        ) not valid;
    end if;
  end;
  $$;

  create index if not exists pricing_rules_product_active_idx
    on public.pricing_rules (product_id, is_active)
    where product_id is not null;

  -- Customer profiles and saved delivery locations are private to their owner.
  create table if not exists public.customer_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text not null default '',
    phone text not null default '',
    nic text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table if not exists public.customer_addresses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    label text not null default 'Home',
    recipient_name text not null,
    phone text not null,
    address text not null,
    city text not null,
    district text not null default '',
    postal_code text not null default '',
    notes text,
    is_default boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint customer_addresses_label_check check (label in ('Home', 'Office', 'Other')),
    constraint customer_addresses_recipient_check check (length(trim(recipient_name)) >= 2),
    constraint customer_addresses_phone_check check (length(trim(phone)) >= 7),
    constraint customer_addresses_address_check check (length(trim(address)) >= 5),
    constraint customer_addresses_city_check check (length(trim(city)) >= 2)
  );

  create unique index if not exists customer_addresses_one_default_idx
    on public.customer_addresses (user_id)
    where is_default;
  create index if not exists customer_addresses_user_idx
    on public.customer_addresses (user_id, created_at desc);

  create table if not exists public.customer_artworks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    file_path text not null,
    mime_type text not null,
    file_size_bytes bigint not null default 0,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint customer_artworks_name_check check (length(trim(name)) between 1 and 120),
    constraint customer_artworks_size_check check (file_size_bytes >= 0)
  );
  create index if not exists customer_artworks_user_idx
    on public.customer_artworks (user_id, created_at desc);

  create table if not exists public.wishlist_items (
    user_id uuid not null references auth.users(id) on delete cascade,
    product_id uuid not null references public.products(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, product_id)
  );
  create index if not exists wishlist_items_user_created_idx
    on public.wishlist_items (user_id, created_at desc);

  alter table public.customer_profiles enable row level security;
  alter table public.customer_addresses enable row level security;
  alter table public.customer_artworks enable row level security;
  alter table public.wishlist_items enable row level security;

  drop policy if exists jpf_profile_owner_select on public.customer_profiles;
  create policy jpf_profile_owner_select on public.customer_profiles
    for select to authenticated using (id = (select auth.uid()) or (select public.jpf_app_is_admin()));
  drop policy if exists jpf_profile_owner_insert on public.customer_profiles;
  create policy jpf_profile_owner_insert on public.customer_profiles
    for insert to authenticated with check (id = (select auth.uid()));
  drop policy if exists jpf_profile_owner_update on public.customer_profiles;
  create policy jpf_profile_owner_update on public.customer_profiles
    for update to authenticated
    using (id = (select auth.uid()) or (select public.jpf_app_is_admin()))
    with check (id = (select auth.uid()) or (select public.jpf_app_is_admin()));

  drop policy if exists jpf_address_owner_select on public.customer_addresses;
  create policy jpf_address_owner_select on public.customer_addresses
    for select to authenticated using (user_id = (select auth.uid()) or (select public.jpf_app_is_admin()));
  drop policy if exists jpf_address_owner_insert on public.customer_addresses;
  create policy jpf_address_owner_insert on public.customer_addresses
    for insert to authenticated with check (user_id = (select auth.uid()));
  drop policy if exists jpf_address_owner_update on public.customer_addresses;
  create policy jpf_address_owner_update on public.customer_addresses
    for update to authenticated
    using (user_id = (select auth.uid()) or (select public.jpf_app_is_admin()))
    with check (user_id = (select auth.uid()) or (select public.jpf_app_is_admin()));
  drop policy if exists jpf_address_owner_delete on public.customer_addresses;
  create policy jpf_address_owner_delete on public.customer_addresses
    for delete to authenticated using (user_id = (select auth.uid()) or (select public.jpf_app_is_admin()));

  drop policy if exists jpf_artwork_owner_select on public.customer_artworks;
  create policy jpf_artwork_owner_select on public.customer_artworks
    for select to authenticated using (user_id = (select auth.uid()) or (select public.jpf_app_is_admin()));
  drop policy if exists jpf_artwork_owner_insert on public.customer_artworks;
  create policy jpf_artwork_owner_insert on public.customer_artworks
    for insert to authenticated with check (user_id = (select auth.uid()));
  drop policy if exists jpf_artwork_owner_delete on public.customer_artworks;
  create policy jpf_artwork_owner_delete on public.customer_artworks
    for delete to authenticated using (user_id = (select auth.uid()) or (select public.jpf_app_is_admin()));

  drop policy if exists jpf_wishlist_owner_select on public.wishlist_items;
  create policy jpf_wishlist_owner_select on public.wishlist_items
    for select to authenticated using (user_id = (select auth.uid()));
  drop policy if exists jpf_wishlist_owner_insert on public.wishlist_items;
  create policy jpf_wishlist_owner_insert on public.wishlist_items
    for insert to authenticated with check (user_id = (select auth.uid()));
  drop policy if exists jpf_wishlist_owner_delete on public.wishlist_items;
  create policy jpf_wishlist_owner_delete on public.wishlist_items
    for delete to authenticated using (user_id = (select auth.uid()));

  -- Keep the existing order contract and history intact while adding fields for
  -- payment, shipment, and immutable order-time pricing snapshots.
  alter table if exists public.orders
    add column if not exists payment_status text not null default 'pending',
    add column if not exists shipping_status text not null default 'not_ready',
    add column if not exists courier_name text,
    add column if not exists tracking_number text,
    add column if not exists tracking_url text,
    add column if not exists payment_reference text,
    add column if not exists payment_receipt_url text,
    add column if not exists payment_submitted_at timestamptz,
    add column if not exists payment_verified_at timestamptz,
    add column if not exists delivery_fee numeric(12,2) not null default 0,
    add column if not exists pricing_snapshot jsonb,
    add column if not exists paid_at timestamptz,
    add column if not exists admin_notes text;

  alter table if exists public.order_items
    add column if not exists unit_price numeric(12,2),
    add column if not exists price_snapshot jsonb,
    add column if not exists print_locations jsonb not null default '[]'::jsonb;

  -- Order reads are limited to the owning signed-in customer and the admin
  -- allowlist. Restrictive guards intersect older permissive policies safely.
  alter table public.orders enable row level security;
  alter table public.order_items enable row level security;

  drop policy if exists jpf_orders_owner_select on public.orders;
  create policy jpf_orders_owner_select on public.orders
    for select to authenticated
    using (
      (select public.jpf_app_is_admin())
      or (
        auth.uid() is not null
        and coalesce(to_jsonb(orders)->>'user_id', to_jsonb(orders)->>'customer_id') = (select auth.uid())::text
      )
    );
  drop policy if exists jpf_orders_owner_select_guard on public.orders;
  create policy jpf_orders_owner_select_guard on public.orders
    as restrictive for select to anon, authenticated
    using (
      (select public.jpf_app_is_admin())
      or (
        auth.uid() is not null
        and coalesce(to_jsonb(orders)->>'user_id', to_jsonb(orders)->>'customer_id') = (select auth.uid())::text
      )
    );
  drop policy if exists jpf_orders_admin_all on public.orders;
  create policy jpf_orders_admin_all on public.orders
    for all to authenticated
    using ((select public.jpf_app_is_admin()))
    with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_orders_admin_write_guard on public.orders;
  create policy jpf_orders_admin_write_guard on public.orders
    as restrictive for insert to anon, authenticated
    with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_orders_admin_update_guard on public.orders;
  create policy jpf_orders_admin_update_guard on public.orders
    as restrictive for update to anon, authenticated
    using ((select public.jpf_app_is_admin()))
    with check ((select public.jpf_app_is_admin()));
  -- Table privileges are separate from RLS. Grant UPDATE to signed-in users;
  -- the restrictive policy above still limits actual updates to admins.
  grant update on table public.orders to authenticated;
  drop policy if exists jpf_orders_admin_delete_guard on public.orders;
  create policy jpf_orders_admin_delete_guard on public.orders
    as restrictive for delete to anon, authenticated
    using ((select public.jpf_app_is_admin()));

  drop policy if exists jpf_order_items_owner_select on public.order_items;
  create policy jpf_order_items_owner_select on public.order_items
    for select to authenticated
    using (
      exists (
        select 1 from public.orders o
        where o.id::text = to_jsonb(order_items)->>'order_id'
          and (
            (select public.jpf_app_is_admin())
            or coalesce(to_jsonb(o)->>'user_id', to_jsonb(o)->>'customer_id') = (select auth.uid())::text
          )
      )
    );
  drop policy if exists jpf_order_items_owner_select_guard on public.order_items;
  create policy jpf_order_items_owner_select_guard on public.order_items
    as restrictive for select to anon, authenticated
    using (
      exists (
        select 1 from public.orders o
        where o.id::text = to_jsonb(order_items)->>'order_id'
          and (
            (select public.jpf_app_is_admin())
            or (auth.uid() is not null and coalesce(to_jsonb(o)->>'user_id', to_jsonb(o)->>'customer_id') = (select auth.uid())::text)
          )
      )
    );
  drop policy if exists jpf_order_items_admin_all on public.order_items;
  create policy jpf_order_items_admin_all on public.order_items
    for all to authenticated
    using ((select public.jpf_app_is_admin()))
    with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_order_items_admin_write_guard on public.order_items;
  create policy jpf_order_items_admin_write_guard on public.order_items
    as restrictive for insert to anon, authenticated
    with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_order_items_admin_update_guard on public.order_items;
  create policy jpf_order_items_admin_update_guard on public.order_items
    as restrictive for update to anon, authenticated
    using ((select public.jpf_app_is_admin()))
    with check ((select public.jpf_app_is_admin()));
  drop policy if exists jpf_order_items_admin_delete_guard on public.order_items;
  create policy jpf_order_items_admin_delete_guard on public.order_items
    as restrictive for delete to anon, authenticated
    using ((select public.jpf_app_is_admin()));

  -- Sort-independent signature for an exact package match. Duplicate locations
  -- are preserved in the array, so one matching location cannot satisfy a
  -- multi-location package by itself.
  create or replace function public.jpf_package_signature(p_locations jsonb)
  returns text[]
  language sql
  immutable
  set search_path = ''
  as $$
    select coalesce(
      array_agg(
        lower(trim(value->>'location')) || '|' ||
        lower(trim(value->>'method')) || '|' ||
        lower(trim(value->>'size'))
        order by
          lower(trim(value->>'location')) || '|' ||
          lower(trim(value->>'method')) || '|' ||
          lower(trim(value->>'size'))
      ),
      array[]::text[]
    )
    from jsonb_array_elements(
      case when jsonb_typeof(p_locations) = 'array' then p_locations else '[]'::jsonb end
    ) as entries(value)
    where nullif(trim(value->>'location'), '') is not null
      and nullif(trim(value->>'method'), '') is not null
      and nullif(trim(value->>'size'), '') is not null;
  $$;

  revoke all on function public.jpf_package_signature(jsonb) from public, anon, authenticated;

  -- New custom-design pricing is configured centrally in pricing_rules. Seed the
  -- existing storefront fallback once; later admin changes remain authoritative.
  insert into public.pricing_rules (name, rule_type, price, is_active)
  select 'Custom T-Shirt Base', 'custom', 2200, true
  where not exists (
    select 1 from public.pricing_rules where rule_type = 'custom' and is_active = true
  );

  create or replace function public.jpf_price_order_item()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    item_data jsonb := to_jsonb(new);
    product_data jsonb;
    item_kind text;
    product_key uuid;
    item_size text;
    shirt_type text;
    locations jsonb;
    selected_signature text[];
    selected_count integer;
    base_price numeric(12,2) := 0;
    print_price numeric(12,2) := 0;
    final_unit_price numeric(12,2) := 0;
    base_rule public.pricing_rules%rowtype;
    package_rule public.pricing_rules%rowtype;
    print_rule public.pricing_rules%rowtype;
    base_rule_found boolean := false;
    package_found boolean := false;
    print_rule_found boolean := false;
    location_item jsonb;
    location_snapshots jsonb := '[]'::jsonb;
    applied_rules jsonb := '[]'::jsonb;
    location_price numeric(12,2);
    location_index integer := 0;
    custom_price numeric(12,2);
    product_id_text text;
  begin
    product_id_text := nullif(item_data->>'product_id', '');
    product_key := case when product_id_text is null then null else product_id_text::uuid end;
    item_kind := lower(coalesce(item_data->>'item_type', item_data->>'type', 'gallery'));
    item_size := nullif(item_data->>'size', '');
    locations := case
      when jsonb_typeof(item_data->'print_locations') = 'array' then item_data->'print_locations'
      else '[]'::jsonb
    end;
    selected_count := jsonb_array_length(locations);

    if coalesce((item_data->>'quantity')::integer, 0) < 1
       or coalesce((item_data->>'quantity')::integer, 0) > 99 then
      raise exception 'Order item quantity must be between 1 and 99.' using errcode = '22023';
    end if;

    if item_kind = 'custom' then
      select r.price into custom_price
      from public.pricing_rules r
      where r.rule_type = 'custom'
        and r.is_active = true
        and r.product_id is null
      order by r.created_at desc nulls last, r.id
      limit 1;
      custom_price := coalesce(custom_price, 2200);
      base_price := custom_price;
    else
      if product_key is null then
        raise exception 'Choose a valid product for this order item.' using errcode = '22023';
      end if;
      select to_jsonb(p) into product_data
      from public.products p
      where p.id = product_key;
      if product_data is null then
        raise exception 'This product is no longer available.' using errcode = 'P0002';
      end if;
      if coalesce((product_data->>'is_active')::boolean, true) is false then
        raise exception 'This product is no longer available.' using errcode = 'P0002';
      end if;
      if item_size is null then
        raise exception 'Choose a size for each product.' using errcode = '22023';
      end if;
      if jsonb_typeof(product_data->'available_sizes') = 'array'
         and not exists (
           select 1 from jsonb_array_elements_text(product_data->'available_sizes') as sizes(value)
           where lower(sizes.value) = lower(item_size)
         ) then
        raise exception 'The selected size is no longer available.' using errcode = '22023';
      end if;

      shirt_type := nullif(product_data->>'shirt_type', '');
      base_price := coalesce(nullif(product_data->>'price', '')::numeric, 0);
      select r.* into base_rule
      from public.pricing_rules r
      where r.is_active = true
        and r.rule_type in ('tshirt', 'tshirt_base')
        and (r.product_id is null or r.product_id = product_key)
        and (nullif(trim(r.t_shirt_type), '') is null or lower(trim(r.t_shirt_type)) = lower(coalesce(shirt_type, '')))
      order by
        case when r.product_id = product_key then 100 else 0 end
          + case when nullif(trim(r.t_shirt_type), '') is not null then 10 else 0 end desc,
        r.created_at desc nulls last,
        r.id
      limit 1;
      base_rule_found := found;
      if base_rule_found then
        base_price := base_rule.price;
        applied_rules := applied_rules || jsonb_build_array(jsonb_build_object(
          'id', base_rule.id, 'name', base_rule.name, 'rule_type', base_rule.rule_type, 'price', base_rule.price
        ));
      end if;
    end if;

    selected_signature := public.jpf_package_signature(locations);
    if selected_count > 0 and cardinality(selected_signature) = selected_count then
      select r.* into package_rule
      from public.pricing_rules r
      where r.is_active = true
        and r.rule_type in ('combination', 'package')
        and case
          when jsonb_typeof(r.combination_config) = 'array'
            then jsonb_array_length(r.combination_config) = selected_count
          else false
        end
        and public.jpf_package_signature(r.combination_config) = selected_signature
        and (r.product_id is null or r.product_id = product_key)
        and (nullif(trim(r.t_shirt_type), '') is null or lower(trim(r.t_shirt_type)) = lower(coalesce(shirt_type, '')))
      order by
        case when r.product_id = product_key then 100 else 0 end
          + case when nullif(trim(r.t_shirt_type), '') is not null then 10 else 0 end desc,
        r.created_at desc nulls last,
        r.id
      limit 1;
      package_found := found;
    end if;

    if package_found then
      print_price := package_rule.price;
      applied_rules := applied_rules || jsonb_build_array(jsonb_build_object(
        'id', package_rule.id, 'name', package_rule.name, 'rule_type', package_rule.rule_type, 'price', package_rule.price
      ));
      location_snapshots := locations;
    else
      for location_item in select value from jsonb_array_elements(locations) as selected(value)
      loop
        location_index := location_index + 1;
        if nullif(trim(location_item->>'location'), '') is null
           or nullif(trim(location_item->>'method'), '') is null
           or nullif(trim(location_item->>'size'), '') is null then
          raise exception 'Each print location needs a method and size.' using errcode = '22023';
        end if;
        select r.* into print_rule
        from public.pricing_rules r
        where r.is_active = true
          and r.rule_type in ('print', 'print_method', 'print_size', 'print_location')
          and (r.product_id is null or r.product_id = product_key)
          and (nullif(trim(r.t_shirt_type), '') is null or lower(trim(r.t_shirt_type)) = lower(coalesce(shirt_type, '')))
          and (nullif(trim(r.print_method), '') is null or lower(trim(r.print_method)) = lower(trim(location_item->>'method')))
          and (nullif(trim(r.print_location), '') is null or lower(trim(r.print_location)) = lower(trim(location_item->>'location')))
          and (nullif(trim(r.print_size), '') is null or lower(trim(r.print_size)) = lower(trim(location_item->>'size')))
        order by
          case when r.product_id = product_key then 100 else 0 end
            + case when nullif(trim(r.t_shirt_type), '') is not null then 10 else 0 end
            + case when nullif(trim(r.print_method), '') is not null then 1 else 0 end
            + case when nullif(trim(r.print_location), '') is not null then 1 else 0 end
            + case when nullif(trim(r.print_size), '') is not null then 1 else 0 end desc,
          r.created_at desc nulls last,
          r.id
        limit 1;
        print_rule_found := found;
        if print_rule_found then
          location_price := coalesce(print_rule.price, 0);
        elsif item_kind = 'custom' then
          -- The legacy custom price includes one print location; each additional
          -- location keeps the former LKR 500 surcharge until rules override it.
          location_price := case when location_index = 1 then 0 else 500 end;
        else
          raise exception 'Printing prices are not configured for this product setup.' using errcode = '55000';
        end if;
        print_price := print_price + location_price;
        location_snapshots := location_snapshots || jsonb_build_array(jsonb_build_object(
          'location', location_item->>'location',
          'method', location_item->>'method',
          'size', location_item->>'size',
          'artwork_path', location_item->>'artwork_path',
          'price', location_price,
          'pricing_rule_id', case when print_rule_found then print_rule.id else null end,
          'pricing_rule_name', case when print_rule_found then print_rule.name else null end
        ));
        if print_rule_found then
          applied_rules := applied_rules || jsonb_build_array(jsonb_build_object(
            'id', print_rule.id, 'name', print_rule.name, 'rule_type', print_rule.rule_type, 'price', print_rule.price
          ));
        end if;
      end loop;
    end if;

    final_unit_price := base_price + print_price;
    new.unit_price := final_unit_price;
    new.print_locations := location_snapshots;
    new.price_snapshot := jsonb_build_object(
      'engine_version', 'jpf-central-v1',
      'base_price', base_price,
      'print_price', print_price,
      'unit_price', final_unit_price,
      'pricing_mode', case when package_found then 'combination' else 'individual' end,
      'applied_rules', applied_rules,
      'locations', location_snapshots
    );

    if product_data is not null then
      new := jsonb_populate_record(new, jsonb_build_object(
        'title', product_data->>'title',
        'image_url', product_data->>'image_url'
      ));
    end if;
    return new;
  end;
  $$;

  revoke all on function public.jpf_price_order_item() from public, anon, authenticated;

  create or replace function public.jpf_rollup_order_total()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    target_order_id uuid;
    subtotal numeric(12,2);
    line_items jsonb;
    delivery numeric(12,2);
  begin
    target_order_id := case when tg_op = 'DELETE' then (to_jsonb(old)->>'order_id')::uuid else (to_jsonb(new)->>'order_id')::uuid end;
    if target_order_id is null then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;

    select
      coalesce(sum(coalesce(i.unit_price, 0) * greatest(1, coalesce((to_jsonb(i)->>'quantity')::integer, 1))), 0),
      coalesce(jsonb_agg(jsonb_build_object(
        'item_id', to_jsonb(i)->>'id',
        'quantity', coalesce((to_jsonb(i)->>'quantity')::integer, 1),
        'unit_price', i.unit_price,
        'snapshot', i.price_snapshot
      ) order by to_jsonb(i)->>'id'), '[]'::jsonb)
    into subtotal, line_items
    from public.order_items i
    where (to_jsonb(i)->>'order_id')::uuid = target_order_id;

    select coalesce(nullif(to_jsonb(o)->>'delivery_fee', '')::numeric, 0)
    into delivery
    from public.orders o where o.id = target_order_id;

    update public.orders o
    set total_amount = subtotal + coalesce(delivery, 0),
        pricing_snapshot = jsonb_build_object(
          'engine_version', 'jpf-central-v1',
          'subtotal', subtotal,
          'delivery_fee', coalesce(delivery, 0),
          'total_price', subtotal + coalesce(delivery, 0),
          'items', line_items
        )
    where o.id = target_order_id;

    if tg_op = 'DELETE' then return old; else return new; end if;
  end;
  $$;

  revoke all on function public.jpf_rollup_order_total() from public, anon, authenticated;

  create or replace function public.jpf_recalculate_order_total()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    subtotal numeric(12,2);
  begin
    if old.pricing_snapshot->>'engine_version' = 'jpf-central-v1' then
      select coalesce(sum(coalesce(i.unit_price, 0) * greatest(1, coalesce((to_jsonb(i)->>'quantity')::integer, 1))), 0)
      into subtotal
      from public.order_items i
      where (to_jsonb(i)->>'order_id')::uuid = old.id;
      new.total_amount := subtotal + coalesce(new.delivery_fee, 0);
      new.pricing_snapshot := old.pricing_snapshot || jsonb_build_object(
        'subtotal', subtotal,
        'delivery_fee', coalesce(new.delivery_fee, 0),
        'total_price', subtotal + coalesce(new.delivery_fee, 0)
      );
    end if;
    return new;
  end;
  $$;

  revoke all on function public.jpf_recalculate_order_total() from public, anon, authenticated;

  create or replace function public.jpf_capture_order_snapshot()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    new.pricing_snapshot := jsonb_build_object(
      'engine_version', 'jpf-central-v1',
      'subtotal', 0,
      'delivery_fee', coalesce(new.delivery_fee, 0),
      'total_price', coalesce(new.total_amount, 0),
      'items', '[]'::jsonb
    );
    return new;
  end;
  $$;

  revoke all on function public.jpf_capture_order_snapshot() from public, anon, authenticated;

  drop trigger if exists jpf_capture_order_snapshot_trg on public.orders;
  create trigger jpf_capture_order_snapshot_trg
    before insert on public.orders
    for each row execute function public.jpf_capture_order_snapshot();

  drop trigger if exists jpf_recalculate_order_total_trg on public.orders;
  create trigger jpf_recalculate_order_total_trg
    before update on public.orders
    for each row execute function public.jpf_recalculate_order_total();

  drop trigger if exists jpf_price_order_item_trg on public.order_items;
  create trigger jpf_price_order_item_trg
    before insert
    on public.order_items
    for each row execute function public.jpf_price_order_item();

  drop trigger if exists jpf_rollup_order_total_trg on public.order_items;
  create trigger jpf_rollup_order_total_trg
    after insert or update or delete on public.order_items
    for each row execute function public.jpf_rollup_order_total();

  create index if not exists orders_payment_status_created_idx
    on public.orders (payment_status, created_at desc);
  create index if not exists orders_shipping_status_created_idx
    on public.orders (shipping_status, created_at desc);

  -- Prevent a signed-in customer from changing protected financial or production
  -- fields by calling the Data API directly. Existing order creation RPCs still
  -- work as database-owner functions; the allowlisted admin can manage orders.
  create or replace function public.jpf_guard_order_admin_fields()
  returns trigger
  language plpgsql
  set search_path = ''
  as $$
  begin
    if current_user in ('anon', 'authenticated')
       and auth.uid() is not null
       and not (select public.jpf_app_is_admin())
       and row(
         new.status, new.payment_status, new.shipping_status, new.courier_name,
         new.tracking_number, new.tracking_url, new.delivery_fee,
         new.payment_reference, new.payment_receipt_url, new.payment_submitted_at,
         new.payment_verified_at, new.pricing_snapshot, new.paid_at, new.admin_notes,
         new.total_amount
       ) is distinct from row(
         old.status, old.payment_status, old.shipping_status, old.courier_name,
         old.tracking_number, old.tracking_url, old.delivery_fee,
         old.payment_reference, old.payment_receipt_url, old.payment_submitted_at,
         old.payment_verified_at, old.pricing_snapshot, old.paid_at, old.admin_notes,
         old.total_amount
       ) then
      raise exception 'Order status, payment, shipping and price fields are managed by Janu Print FAB.'
        using errcode = '42501';
    end if;
    return new;
  end;
  $$;

  revoke all on function public.jpf_guard_order_admin_fields() from public, anon, authenticated;
  drop trigger if exists jpf_guard_order_admin_fields_trg on public.orders;
  create trigger jpf_guard_order_admin_fields_trg
    before update on public.orders
    for each row execute function public.jpf_guard_order_admin_fields();

  create or replace function public.jpf_admin_review_payment(
    p_order_id uuid,
    p_decision text,
    p_note text default null
  )
  returns void
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    order_record jsonb;
    receipt_path text;
    existing_status text;
  begin
    if not (select public.jpf_app_is_admin()) then
      raise exception 'Admins only.' using errcode = '42501';
    end if;
    if p_decision not in ('paid', 'rejected') then
      raise exception 'Choose paid or rejected.' using errcode = '22023';
    end if;

    select to_jsonb(o) into order_record
    from public.orders o
    where o.id = p_order_id
    for update;
    if order_record is null then
      raise exception 'Order not found.' using errcode = 'P0002';
    end if;

    receipt_path := coalesce(
      order_record->>'payment_receipt_url',
      order_record->>'payment_slip_path',
      order_record->>'payment_slip_url'
    );
    existing_status := coalesce(order_record->>'payment_status', 'pending');
    if existing_status not in ('receipt_submitted', 'pending', 'rejected', 'under_review') then
      raise exception 'This payment cannot be reviewed in its current state.' using errcode = '55000';
    end if;
    if p_decision = 'paid' and nullif(receipt_path, '') is null then
      raise exception 'Cannot verify payment without a submitted receipt.' using errcode = '22023';
    end if;
    if p_decision = 'rejected' and nullif(trim(p_note), '') is null then
      raise exception 'Add a note explaining why the receipt was rejected.' using errcode = '22023';
    end if;

    update public.orders
    set payment_status = p_decision,
        payment_verified_at = case when p_decision = 'paid' then now() else null end,
        paid_at = case when p_decision = 'paid' then now() else null end,
        admin_notes = coalesce(nullif(trim(p_note), ''), admin_notes),
        status = case
          when p_decision = 'paid' and lower(coalesce(status, '')) in ('pending', 'pending verification') then 'Payment Verified'
          else status
        end
    where id = p_order_id;
  end;
  $$;

  revoke all on function public.jpf_admin_review_payment(uuid, text, text) from public, anon;
  grant execute on function public.jpf_admin_review_payment(uuid, text, text) to authenticated;

  create or replace function public.jpf_submit_payment_reference(
    p_order_id uuid,
    p_reference text default null
  )
  returns void
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    order_record jsonb;
    receipt_path text;
  begin
    if auth.uid() is null then
      raise exception 'Sign in to submit payment details.' using errcode = '42501';
    end if;
    select to_jsonb(o) into order_record
    from public.orders o
    where o.id = p_order_id
    for update;
    if order_record is null then
      raise exception 'Order not found.' using errcode = 'P0002';
    end if;
    if coalesce(order_record->>'user_id', order_record->>'customer_id') <> auth.uid()::text then
      raise exception 'You cannot update payment details for this order.' using errcode = '42501';
    end if;
    receipt_path := coalesce(order_record->>'payment_receipt_url', order_record->>'payment_slip_path', order_record->>'payment_slip_url');
    if nullif(receipt_path, '') is null then
      raise exception 'Upload a bank transfer receipt before submitting payment details.' using errcode = '22023';
    end if;
    if length(coalesce(p_reference, '')) > 120 then
      raise exception 'Payment reference is too long.' using errcode = '22023';
    end if;

    update public.orders
    set payment_status = 'receipt_submitted',
        payment_reference = nullif(trim(p_reference), ''),
        payment_submitted_at = now()
    where id = p_order_id;
  end;
  $$;

  revoke all on function public.jpf_submit_payment_reference(uuid, text) from public, anon;
  grant execute on function public.jpf_submit_payment_reference(uuid, text) to authenticated;

  create or replace function public.jpf_customer_cancel_order(p_order_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    order_record jsonb;
    current_status text;
  begin
    if auth.uid() is null then
      raise exception 'Sign in to cancel an order.' using errcode = '42501';
    end if;

    select to_jsonb(o) into order_record
    from public.orders o
    where o.id = p_order_id
    for update;

    if order_record is null then
      raise exception 'Order not found.' using errcode = 'P0002';
    end if;

    if coalesce(order_record->>'user_id', order_record->>'customer_id') <> auth.uid()::text then
      raise exception 'You cannot cancel this order.' using errcode = '42501';
    end if;

    current_status := lower(coalesce(order_record->>'status', ''));
    if current_status in ('printing', 'shipped', 'completed', 'cancelled', 'canceled') then
      raise exception 'This order can no longer be cancelled because production or delivery has started.' using errcode = '55000';
    end if;

    update public.orders
    set status = 'Cancelled', shipping_status = 'cancelled'
    where id = p_order_id;
  end;
  $$;

  revoke all on function public.jpf_customer_cancel_order(uuid) from public, anon;
  grant execute on function public.jpf_customer_cancel_order(uuid) to authenticated;

  -- Private customer artwork: the first storage folder must equal auth.uid().
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'customer-designs', 'customer-designs', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists jpf_customer_designs_owner_select on storage.objects;
  create policy jpf_customer_designs_owner_select on storage.objects
    for select to authenticated
    using (
      bucket_id = 'customer-designs'
      and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.jpf_app_is_admin()))
    );
  drop policy if exists jpf_customer_designs_owner_insert on storage.objects;
  create policy jpf_customer_designs_owner_insert on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'customer-designs'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  drop policy if exists jpf_customer_designs_owner_update on storage.objects;
  create policy jpf_customer_designs_owner_update on storage.objects
    for update to authenticated
    using (
      bucket_id = 'customer-designs'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
      bucket_id = 'customer-designs'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  drop policy if exists jpf_customer_designs_owner_delete on storage.objects;
  create policy jpf_customer_designs_owner_delete on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'customer-designs'
      and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.jpf_app_is_admin()))
    );

  -- Restrictive guards prevent older permissive storage policies from making
  -- customer artwork public or allowing cross-account access.
  drop policy if exists jpf_customer_designs_select_guard on storage.objects;
  create policy jpf_customer_designs_select_guard on storage.objects
    as restrictive for select to anon, authenticated
    using (
      bucket_id <> 'customer-designs'
      or (
        auth.uid() is not null
        and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.jpf_app_is_admin()))
      )
    );
  drop policy if exists jpf_customer_designs_insert_guard on storage.objects;
  create policy jpf_customer_designs_insert_guard on storage.objects
    as restrictive for insert to anon, authenticated
    with check (
      bucket_id <> 'customer-designs'
      or (
        auth.uid() is not null
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
    );
  drop policy if exists jpf_customer_designs_update_guard on storage.objects;
  create policy jpf_customer_designs_update_guard on storage.objects
    as restrictive for update to anon, authenticated
    using (bucket_id <> 'customer-designs')
    with check (bucket_id <> 'customer-designs');
  drop policy if exists jpf_customer_designs_delete_guard on storage.objects;
  create policy jpf_customer_designs_delete_guard on storage.objects
    as restrictive for delete to anon, authenticated
    using (
      bucket_id <> 'customer-designs'
      or (
        auth.uid() is not null
        and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.jpf_app_is_admin()))
      )
    );

  -- Bank receipts are private too. The React checkout uploads under the signed-in
  -- user's UUID, and only that account plus admins can read them.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'payment-slips', 'payment-slips', false, 8388608,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- Remove the earlier token-folder guards if the legacy payment hardening
  -- migration was applied. This flow authenticates customers and stores receipts
  -- under their own UUID folder; the bucket remains private.
  drop policy if exists jpf_receipts_insert on storage.objects;
  drop policy if exists jpf_receipts_select_admin on storage.objects;
  drop policy if exists jpf_receipts_select_owner on storage.objects;
  drop policy if exists jpf_receipts_select_guard on storage.objects;
  drop policy if exists jpf_receipts_insert_guard on storage.objects;
  drop policy if exists jpf_receipts_update_guard on storage.objects;
  drop policy if exists jpf_receipts_delete_guard on storage.objects;

  -- Keep legacy order-capability receipts readable/uploadable when the earlier
  -- payment hardening migration is present, while allowing the authenticated
  -- account-folder flow used by this React checkout. Dynamic calls keep this
  -- migration safe on projects where the legacy helper functions are absent.
  create or replace function public.jpf_legacy_receipt_owner(p_object_name text)
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
  set row_security = off
  as $$
  declare
    allowed boolean := false;
  begin
    if auth.uid() is null or to_regprocedure('public.jpf_owns_order(text)') is null then
      return false;
    end if;
    execute 'select public.jpf_owns_order($1)'
      into allowed
      using split_part(coalesce(p_object_name, ''), '/', 1);
    return coalesce(allowed, false);
  end;
  $$;

  create or replace function public.jpf_legacy_receipt_upload(p_object_name text)
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
  set row_security = off
  as $$
  declare
    allowed boolean := false;
  begin
    if to_regprocedure('public.jpf_order_accepts_receipt(text,text)') is null then
      return false;
    end if;
    execute 'select public.jpf_order_accepts_receipt($1, $2)'
      into allowed
      using split_part(coalesce(p_object_name, ''), '/', 1), split_part(coalesce(p_object_name, ''), '/', 2);
    return coalesce(allowed, false);
  end;
  $$;
  revoke all on function public.jpf_legacy_receipt_owner(text) from public, anon;
  revoke all on function public.jpf_legacy_receipt_upload(text) from public;
  grant execute on function public.jpf_legacy_receipt_owner(text) to authenticated;
  grant execute on function public.jpf_legacy_receipt_upload(text) to anon, authenticated;

  drop policy if exists jpf_payment_slips_owner_select on storage.objects;
  create policy jpf_payment_slips_owner_select on storage.objects
    for select to authenticated
    using (
      bucket_id = 'payment-slips'
      and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or (select public.jpf_app_is_admin())
        or (select public.jpf_legacy_receipt_owner(name))
      )
    );
  drop policy if exists jpf_payment_slips_owner_insert on storage.objects;
  create policy jpf_payment_slips_owner_insert on storage.objects
    for insert to anon, authenticated
    with check (
      bucket_id = 'payment-slips'
      and (
        (auth.uid() is not null and (storage.foldername(name))[1] = (select auth.uid())::text)
        or (select public.jpf_legacy_receipt_upload(name))
      )
    );
  drop policy if exists jpf_payment_slips_owner_delete on storage.objects;
  create policy jpf_payment_slips_owner_delete on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'payment-slips'
      and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.jpf_app_is_admin()))
    );

  drop policy if exists jpf_payment_slips_select_guard on storage.objects;
  create policy jpf_payment_slips_select_guard on storage.objects
    as restrictive for select to anon, authenticated
    using (
      bucket_id <> 'payment-slips'
      or (
        auth.uid() is not null
        and (
          (storage.foldername(name))[1] = (select auth.uid())::text
          or (select public.jpf_app_is_admin())
          or (select public.jpf_legacy_receipt_owner(name))
        )
      )
    );
  drop policy if exists jpf_payment_slips_insert_guard on storage.objects;
  create policy jpf_payment_slips_insert_guard on storage.objects
    as restrictive for insert to anon, authenticated
    with check (
      bucket_id <> 'payment-slips'
      or (
        (auth.uid() is not null and (storage.foldername(name))[1] = (select auth.uid())::text)
        or (select public.jpf_legacy_receipt_upload(name))
      )
    );
  drop policy if exists jpf_payment_slips_update_guard on storage.objects;
  create policy jpf_payment_slips_update_guard on storage.objects
    as restrictive for update to anon, authenticated
    using (bucket_id <> 'payment-slips')
    with check (bucket_id <> 'payment-slips');
  drop policy if exists jpf_payment_slips_delete_guard on storage.objects;
  create policy jpf_payment_slips_delete_guard on storage.objects
    as restrictive for delete to anon, authenticated
    using (
      bucket_id <> 'payment-slips'
      or (
        auth.uid() is not null
        and (
          (storage.foldername(name))[1] = (select auth.uid())::text
          or (select public.jpf_app_is_admin())
          or (select public.jpf_legacy_receipt_owner(name))
        )
      )
    );




-- Included migration: 202611280002_grant_admin_order_updates.sql
-- The admin orders screen updates shipment and order status fields directly.
-- PostgreSQL table privileges are required in addition to the RLS policies.
-- The migration 202611280001 installs restrictive admin-only update policies.


grant update on table public.orders to authenticated;




-- Included migration: 202611280003_cash_on_delivery.sql
-- Add Cash on Delivery while keeping bank transfer and receipt verification.


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




-- Included migration: 202611280004_shop_contact_settings.sql
-- Public shop contact settings, editable by admins and readable by customers.


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




-- Included migration: 202611280005_delivery_charges_and_cod_orders.sql
-- Delivery fees are configurable by staff, visible to customers, and stored
-- with each order. COD order creation skips the legacy slip check only inside
-- the dedicated authenticated COD RPC; bank-transfer validation is unchanged.


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

