-- The admin orders screen updates shipment and order status fields directly.
-- PostgreSQL table privileges are required in addition to the RLS policies.
-- The migration 202611280001 installs restrictive admin-only update policies.
begin;

grant update on table public.orders to authenticated;

commit;
