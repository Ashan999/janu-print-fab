/**
 * PayHere server-to-server notification handler.
 *
 * An order is only marked PAID when ALL of these are true:
 *   - the md5 signature is valid (proves the call came from PayHere)
 *   - merchant_id matches PAYHERE_MERCHANT_ID
 *   - status_code is 2 (success)
 *   - the order exists, was placed with payhere and is still payable
 *   - currency is LKR and payhere_amount equals the order total stored in the database
 *
 * Env: PAYHERE_MERCHANT_ID, PAYHERE_MERCHANT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Deploy WITHOUT JWT verification (PayHere does not send a Supabase JWT):
 *   supabase functions deploy payhere-notify --no-verify-jwt
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import md5 from 'https://esm.sh/md5@2.3.0';

const CURRENCY = 'LKR';
const PAYABLE = ['pending', 'failed', 'rejected'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const md5Upper = (input: string): string => md5(input).toUpperCase();

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseBody(req: Request, raw: string): Record<string, string> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { return JSON.parse(raw) as Record<string, string>; } catch { return {}; }
  }
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const secret = Deno.env.get('PAYHERE_MERCHANT_SECRET');
  const expectedMerchant = Deno.env.get('PAYHERE_MERCHANT_ID');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !expectedMerchant || !supabaseUrl || !serviceKey) {
    console.error('Missing PayHere or Supabase env configuration');
    return new Response('Server not configured', { status: 503, headers: corsHeaders });
  }

  const raw = await req.text();
  const p = parseBody(req, raw);

  const merchantId = p.merchant_id ?? '';
  const orderId = p.order_id ?? '';
  const payhereAmount = p.payhere_amount ?? '';
  const payhereCurrency = p.payhere_currency ?? '';
  const statusCode = p.status_code ?? '';
  const md5sig = (p.md5sig ?? '').toUpperCase();

  /* 1. signature */
  const expected = md5Upper(merchantId + orderId + payhereAmount + payhereCurrency + statusCode + md5Upper(secret));
  if (!md5sig || !safeEqual(md5sig, expected)) {
    console.warn('PayHere checksum mismatch for order', orderId);
    return new Response('Invalid signature', { status: 400, headers: corsHeaders });
  }

  /* 2. merchant */
  if (merchantId !== expectedMerchant) {
    console.warn('PayHere merchant mismatch for order', orderId);
    return new Response('Invalid merchant', { status: 400, headers: corsHeaders });
  }
  if (!UUID.test(orderId)) return new Response('Invalid order', { status: 400, headers: corsHeaders });

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: order, error: loadErr } = await db
    .from('orders')
    .select('id, status, total_amount, payment_method, payment_status, payhere_payment_id')
    .eq('id', orderId)
    .maybeSingle();
  if (loadErr) {
    console.error('Order lookup failed', loadErr.message);
    return new Response('Lookup failed', { status: 500, headers: corsHeaders });
  }
  if (!order) return new Response('Order not found', { status: 404, headers: corsHeaders });

  const payherePaymentId = p.payment_id ?? p.payhere_payment_id ?? null;

  /* already settled: acknowledge so PayHere stops retrying */
  if (order.payment_status === 'paid') {
    return new Response('Already processed', { status: 200, headers: corsHeaders });
  }

  /* 3. not a success notification */
  if (statusCode !== '2') {
    // 0 = pending at PayHere: leave the order untouched
    if (statusCode !== '0' && PAYABLE.includes(order.payment_status ?? 'pending')) {
      await db.from('orders')
        .update({ payment_status: 'failed', payment_notes: `PayHere status_code=${statusCode}` })
        .eq('id', orderId)
        .in('payment_status', ['pending', 'failed']);
    }
    return new Response('Not paid', { status: 200, headers: corsHeaders });
  }

  /* 4. order validation: method, state, currency, amount */
  const problems: string[] = [];
  if (order.payment_method !== 'payhere') problems.push(`order payment_method is ${order.payment_method}`);
  if (!PAYABLE.includes(order.payment_status ?? 'pending')) problems.push(`order payment_status is ${order.payment_status}`);
  if (String(order.status ?? '').toLowerCase() === 'cancelled') problems.push('order is cancelled');
  if (payhereCurrency !== CURRENCY) problems.push(`currency ${payhereCurrency} (expected ${CURRENCY})`);
  const paid = Number(payhereAmount);
  const due = Number(order.total_amount);
  if (!Number.isFinite(paid) || !Number.isFinite(due) || Math.abs(paid - due) > 0.005) {
    problems.push(`amount ${payhereAmount} (order total ${order.total_amount})`);
  }

  if (problems.length) {
    console.warn('PayHere validation failed for order', orderId, problems.join('; '));
    // Never mark paid. Flag it so the admin can look at it in the dashboard.
    if (PAYABLE.includes(order.payment_status ?? 'pending')) {
      await db.from('orders')
        .update({ payment_status: 'failed', payment_notes: `PayHere validation failed: ${problems.join('; ')}`.slice(0, 500) })
        .eq('id', orderId)
        .in('payment_status', ['pending', 'failed', 'rejected']);
    }
    return new Response('Validation failed', { status: 200, headers: corsHeaders });
  }

  /* 5. mark paid (only if still payable - protects against races/replays) */
  const { data: updated, error } = await db
    .from('orders')
    .update({
      payment_status: 'paid',
      payment_method: 'payhere',
      payment_amount: paid,
      payhere_payment_id: payherePaymentId,
      payhere_order_id: orderId,
      payment_verified_at: new Date().toISOString(),
      payment_notes: 'Verified via PayHere notify',
    })
    .eq('id', orderId)
    .in('payment_status', PAYABLE)
    .select('id');

  if (error) {
    console.error('Order update failed', error.message);
    return new Response('Update failed', { status: 500, headers: corsHeaders });
  }
  if (!updated || !updated.length) {
    return new Response('Already processed', { status: 200, headers: corsHeaders });
  }
  return new Response('OK', { status: 200, headers: corsHeaders });
});
