-- Janu Print | FAB — payment receipt bucket must remain private
-- Create bucket "payment-slips" in Supabase Storage and keep it PRIVATE.
-- Never grant public read access to this bucket.
-- Receipt path pattern should be relative to the order or customer context, for example:
--   orders/{order_id}/{timestamp}-{safe-filename}
--   or private/customer/{customer_id}/{order_id}/{timestamp}-{safe-filename}

-- IMPORTANT:
-- - Do not expose the bucket with a public URL or public storage policy.
-- - Uploads may be allowed for authenticated customers only on their own order folders.
-- - Admins must read via signed URLs or a secure server-side bridge.
-- - The browser should only store the relative object path, not a public URL.

-- Example policy structure (adjust to your real folder convention):
-- create policy "payment slips are private by default"
-- on storage.objects for select
-- using (bucket_id = 'payment-slips' and auth.role() = 'authenticated' and exists (
--   select 1 from public.admin_profiles ap where ap.id = auth.uid()
-- ));
--
-- create policy "customers upload only to their own order folders"
-- on storage.objects for insert
-- with check (
--   bucket_id = 'payment-slips'
--   and auth.role() = 'authenticated'
--   and (storage.foldername(name) = auth.uid()::text or storage.foldername(name) like 'orders/%')
-- );
--
-- create policy "admins can read all private receipt files"
-- on storage.objects for select
-- using (
--   bucket_id = 'payment-slips'
--   and auth.uid() is not null
--   and exists (select 1 from public.admin_profiles ap where ap.id = auth.uid())
-- );

-- The app must call createSignedUrl('payment-slips', path, 3600) for admin/customer viewing.
-- It must not call getPublicUrl() for payment receipts.

