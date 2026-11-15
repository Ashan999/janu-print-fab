/**
 * PayHere checkout starter.
 * The browser sends { order_id, payment_token }. Everything that matters
 * (amount, currency, who may pay) is read from the database here - the browser
 * can never choose the amount.
 *
 * Secrets / env (supabase secrets set ...):
 *   PAYHERE_MERCHANT_ID, PAYHERE_MERCHANT_SECRET
 *   PAYHERE_SANDBOX   "true" (default) or "false" for live
 *   SITE_URL          e.g. https://januprint.lk   (used for default return/cancel URLs)
 *   SUPPORT_EMAIL     optional fallback e-mail sent to PayHere when the customer has none
 * Provided automatically by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Deploy:  supabase functions deploy payhere-checkout
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import md5 from 'https://esm.sh/md5@2.3.0';

const CURRENCY = 'LKR';
const OPEN_STATES = ['pending', 'failed', 'rejected'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const md5Upper = (s: string) => md5(s).toUpperCase();
async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const merchantId = Deno.env.get('PAYHERE_MERCHANT_ID');
  const secret = Deno.env.get('PAYHERE_MERCHANT_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!merchantId || !secret || !supabaseUrl || !serviceKey) {
    console.error('payhere-checkout: missing environment configuration');
    return json({ error: 'Card payment is not configured yet. Please use bank transfer.' }, 503);
  }
  const sandbox = (Deno.env.get('PAYHERE_SANDBOX') ?? 'true').toLowerCase() !== 'false';
  const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://januprint.lk').replace(/\/+$/, '');
  const supportEmail = Deno.env.get('SUPPORT_EMAIL') ?? 'no-reply@januprint.lk';

  let body: { order_id?: string; payment_token?: string } = {};
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const orderId = String(body.order_id ?? '');
  if (!UUID.test(orderId)) return json({ error: 'Invalid order.' }, 400);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: order, error: orderErr } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (orderErr) { console.error('order lookup failed', orderErr.message); return json({ error: 'Could not load the order.' }, 500); }
  if (!order) return json({ error: 'Order not found.' }, 404);

  /* ---- who may pay for this order: payment-token holder or the logged-in owner ---- */
  let allowed = false;
  const token = String(body.payment_token ?? '');
  if (/^[a-f0-9]{64}$/.test(token)) {
    const { data: cap } = await db.from('order_payment_capabilities').select('token_hash').eq('order_id', orderId).maybeSingle();
    allowed = !!cap && cap.token_hash === (await sha256Hex(token));
  }
  if (!allowed) {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (jwt) {
      const { data } = await db.auth.getUser(jwt);
      if (data?.user && order.customer_id === data.user.id) allowed = true;
    }
  }
  if (!allowed) return json({ error: 'You are not allowed to pay for this order.' }, 403);

  /* ---- order validation ---- */
  if (order.payment_method !== 'payhere') return json({ error: 'This order was not placed with card payment.' }, 409);
  if (!OPEN_STATES.includes(order.payment_status ?? 'pending')) return json({ error: 'This order cannot be paid online any more.' }, 409);
  if (String(order.status ?? '').toLowerCase() === 'cancelled') return json({ error: 'This order was cancelled.' }, 409);
  const amount = Number(order.total_amount);
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'This order has no payable amount yet.' }, 409);
  const amountStr = amount.toFixed(2); // PayHere: 2 decimals, no thousands separator

  /* ---- customer + items for the PayHere form ---- */
  const [{ data: cust }, { data: items }] = await Promise.all([
    order.customer_id ? db.from('customers').select('*').eq('id', order.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('order_items').select('product_name, quantity').eq('order_id', orderId),
  ]);
  const fullName = String(cust?.name ?? 'Customer').trim() || 'Customer';
  const [first, ...rest] = fullName.split(/\s+/);
  const email = cust?.email && !String(cust.email).endsWith('@januprintfab.customer') ? String(cust.email) : supportEmail;
  const phone = String(order.customer_phone ?? cust?.phone ?? '').trim() || '0000000000';
  const address = String(order.delivery_address ?? cust?.address ?? '').trim() || 'N/A';
  const itemText = (items ?? []).map((i) => `${i.product_name} x${i.quantity}`).join(', ').slice(0, 120) || `Order ${orderId.slice(0, 8)}`;

  const hash = md5Upper(merchantId + orderId + amountStr + CURRENCY + md5Upper(secret));

  return json({
    checkout_url: sandbox ? 'https://sandbox.payhere.lk/pay/checkout' : 'https://www.payhere.lk/pay/checkout',
    fields: {
      merchant_id: merchantId,
      return_url: `${siteUrl}/index.html#/pay-return/${orderId}`,
      cancel_url: `${siteUrl}/index.html#/pay-cancel/${orderId}`,
      notify_url: `${supabaseUrl}/functions/v1/payhere-notify`,
      order_id: orderId,
      items: itemText,
      currency: CURRENCY,
      amount: amountStr,
      first_name: first || 'Customer',
      last_name: rest.join(' ') || '-',
      email,
      phone,
      address,
      city: 'N/A',
      country: 'Sri Lanka',
      hash,
    },
  });
});
