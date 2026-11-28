# Janu Print FAB

Customer storefront and order-management app for a Sri Lankan custom apparel printer. The frontend uses React, Vite, Tailwind CSS, and Supabase. It is a client-side app hosted on GitHub Pages.

## Local setup

Requirements: Node.js 22 or later and npm.

```powershell
npm install
npm run dev
```

The production Supabase URL and public publishable key are set as public client configuration in `src/lib/supabase.js`. To use a different Supabase project locally, create `.env.local`:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
```

These values are exposed in the browser by design. Never put a Supabase service-role key, payment secret, or other server credential in this project.

## Supabase setup

The storefront expects the existing Janu Print Supabase project and its core tables and RPCs, including `products`, `category_settings`, `product_print_configs`, `pricing_rules`, `orders`, `order_items`, `is_admin()`, and the `place_order(...)` RPC. Apply the existing base schema and payment hardening migration first. Then run the single consolidated app migration:

```text
supabase/migrations/202611280006_complete_janu_print_setup.sql
```

It includes migrations 001–005 in dependency order. It creates customer profile, address, artwork, favorites, and product-image tables; adds order snapshot, payment and shipping fields; installs database-side pricing and total protections; configures RLS and storage policies; enables COD; creates shop contact settings; and adds configurable delivery charges. These app migrations are also available separately below, but run either the consolidated file or all five individual files, not both:

```text
supabase/migrations/202611280001_janu_print_customer_and_pricing_hardening.sql
supabase/migrations/202611280002_grant_admin_order_updates.sql
supabase/migrations/202611280003_cash_on_delivery.sql
supabase/migrations/202611280004_shop_contact_settings.sql
supabase/migrations/202611280005_delivery_charges_and_cod_orders.sql
```

These additive migrations preserve existing order/catalog rows. They assume the listed core tables and current `place_order(...)` function exist. Confirm the production project's actual schema and policies before applying, since this repository has no live database schema export.

The migration creates or configures these buckets:

- `gallery-images`: public reads, administrator-only uploads and changes.
- `customer-designs`: private files, owner-folder access, administrator access.
- `payment-slips`: private files, owner-folder access, administrator access. Legacy capability-based receipt access remains supported when the earlier payment helpers are present.

The admin dashboard and this migration both use the existing `is_admin()` RPC. Keep its current trusted-staff allowlist and setup process; this migration does not assume a specific table name for it. Do not give admin access through frontend flags.

## Features

- Product gallery with audience, age, shirt style, search, size, color, extra image views, and favorites.
- Admin product add/edit, stock sizes, active visibility, categories, detail images, and front/back print reference images.
- Customer-specific and shirt-type base prices, individual print-location/method/size prices, custom-design base prices, and exact-match print packages.
- Custom artwork upload, saved private artwork, account profile and delivery addresses.
- Authenticated checkout with bank transfer and Cash on Delivery, receipt/reference submission, and a configurable delivery fee.
- Order history, payment and delivery progress, courier tracking, invoice printing, eligible cancellation, and reorder using current prices.
- Administrator order management, receipt review, production status, and shipment tracking.
- English/Sinhala content, responsive layout, and installable PWA shell.

Prices shown before checkout are estimates. The SQL pricing trigger recalculates unit prices from active database rules when order items are inserted, stores the applied rules and locations as a snapshot, and recalculates the order total. Existing orders retain their stored price snapshots when future rules change.

Custom uploaded designs retain the existing LKR 2,200 base price until an active Custom Design Base rule is configured. The first custom print location is included; each additional location keeps the former LKR 500 surcharge until an active print rule overrides it. Gallery print selections require a matching print rule or exact package before checkout.

Bank transfer is the implemented payment path. Do not advertise PayHere as enabled unless its server-side notification function, secret configuration, and complete payment verification flow have been separately deployed and checked.

## Authentication and domain

The app uses the current site's origin as the sign-in return URL. In Supabase Authentication URL Configuration, set the production Site URL to `https://januprint.lk` and allow the production callback. If Google sign-in is enabled, enable its provider in Supabase and register the provider callback URI there with Google Cloud Console. For local sign-in, allow the Vite local origin too.

The repository includes `public/CNAME` for `januprint.lk` and a Pages workflow. In GitHub repository settings, choose **GitHub Actions** as the Pages source, configure the custom domain, and point the domain's DNS records to GitHub Pages. The app uses Vite base `/`, which matches the custom domain.

## Build and release

```powershell
npm run build
```

GitHub Actions installs with `npm ci`, builds `dist`, checks the CNAME, and publishes it to Pages on pushes to `main` or manual workflow dispatch. Verify Supabase Authentication, RLS, storage, and order RPC behavior in a staging project before using the live shop.

## Customer smoke-check

1. Sign in with a test account; save a profile and one default delivery address.
2. Browse a product, view its images, add/remove a favorite, choose a size, and configure available front/back print locations.
3. Upload artwork, add a configured shirt and a custom design to the cart, and confirm displayed prices.
4. Complete a bank-transfer test order with a test receipt. Confirm it appears in My Orders and its receipt/artwork opens only for the owner or staff.
5. Check payment status, shipment tracking, invoice printing, reorder, and cancellation before production.

## Administrator smoke-check

1. Sign in with a trusted staff account and verify the app recognizes it through `is_admin()`.
2. Add and edit a product, toggle its visibility, upload main/detail/front/back images, and set single- or double-side print configuration.
3. Create base, custom-design, per-print, and exact package prices. Confirm a package applies only to its complete location/method/size set.
4. Review a test receipt, reject it with a note, then verify a valid test receipt. Update order status and save courier/tracking details.
5. Confirm a normal customer account cannot edit catalog, prices, payments, shipping, another customer's order, or another customer's private artwork.
