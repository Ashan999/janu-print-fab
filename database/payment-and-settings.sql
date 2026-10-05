-- Janu Print | FAB — payment fields, bank display settings, optional RLS helpers
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS / idempotent policy names).

-- ---------------------------------------------------------------------------
-- orders: payment lifecycle (separate from production status)
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists payment_status text default 'pending';
alter table public.orders add column if not exists payment_reference text;
alter table public.orders add column if not exists payment_receipt_url text;
alter table public.orders add column if not exists payment_notes text;
alter table public.orders add column if not exists payment_amount numeric;
alter table public.orders add column if not exists payment_submitted_at timestamptz;
alter table public.orders add column if not exists payment_verified_at timestamptz;
alter table public.orders add column if not exists payhere_payment_id text;
alter table public.orders add column if not exists payhere_order_id text;

comment on column public.orders.payment_status is 'pending|receipt_submitted|under_review|paid|rejected|failed|refunded';
comment on column public.orders.payment_method is 'bank_transfer|payhere|pending|etc';

-- Backfill: existing rows with payment_method pending and no payment_status
update public.orders
set payment_status = coalesce(payment_status, 'pending')
where payment_status is null;

-- ---------------------------------------------------------------------------
-- contact_details: bank transfer instructions (admin-editable; no fake defaults)
-- ---------------------------------------------------------------------------
alter table public.contact_details add column if not exists bank_name text;
alter table public.contact_details add column if not exists bank_account_name text;
alter table public.contact_details add column if not exists bank_account_number text;
alter table public.contact_details add column if not exists bank_branch text;
alter table public.contact_details add column if not exists bank_instructions text;
alter table public.contact_details add column if not exists currency text default 'LKR';

-- PayHere public/sandbox flags (merchant secret stays in Edge Function env only)
alter table public.contact_details add column if not exists payhere_enabled boolean default false;
alter table public.contact_details add column if not exists payhere_merchant_id text;
alter table public.contact_details add column if not exists payhere_sandbox boolean default true;

-- ---------------------------------------------------------------------------
-- RLS: customer/guest payment submission (review in dashboard before production)
-- Adjust if your project already has stricter order policies.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'jpf_customer_payment_update'
  ) then
    create policy jpf_customer_payment_update on public.orders
      for update
      to authenticated, anon
      using (
        payment_status in ('pending', 'rejected', 'failed')
        or (payment_status = 'receipt_submitted' and payment_method = 'bank_transfer')
      )
      with check (
        payment_status in ('pending', 'receipt_submitted', 'under_review', 'failed')
        and status is not null
      );
  end if;
end $$;

-- Admin updates (authenticated users in admin_profiles) — relies on existing admin pattern
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'jpf_admin_orders_all'
  ) then
    create policy jpf_admin_orders_all on public.orders
      for all
      to authenticated
      using (
        exists (select 1 from public.admin_profiles ap where ap.id = auth.uid())
      )
      with check (
        exists (select 1 from public.admin_profiles ap where ap.id = auth.uid())
      );
  end if;
end $$;
