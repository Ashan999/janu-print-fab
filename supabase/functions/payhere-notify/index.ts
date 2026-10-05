/**
 * PayHere server-to-server notification handler.
 * Env: PAYHERE_MERCHANT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: PAYHERE_MERCHANT_ID, PAYHERE_SANDBOX
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import md5 from 'https://esm.sh/md5@2.3.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function md5Upper(input: string): string {
  return md5(input).toUpperCase();
}

function parseBody(req: Request, raw: string): Record<string, string> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const secret = Deno.env.get('PAYHERE_MERCHANT_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!secret || !supabaseUrl || !serviceKey) {
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

  const expected = md5Upper(
    merchantId + orderId + payhereAmount + payhereCurrency + statusCode + md5Upper(secret)
  );

  if (!md5sig || md5sig !== expected) {
    console.warn('PayHere checksum mismatch for order', orderId);
    return new Response('Invalid signature', { status: 400, headers: corsHeaders });
  }

  if (statusCode !== '2') {
    const db = createClient(supabaseUrl, serviceKey);
    if (orderId) {
      await db
        .from('orders')
        .update({ payment_status: 'failed', payment_notes: `PayHere status_code=${statusCode}` })
        .eq('id', orderId)
        .eq('payment_status', 'pending');
    }
    return new Response('Not paid', { status: 200, headers: corsHeaders });
  }

  const db = createClient(supabaseUrl, serviceKey);
  const payherePaymentId = p.payment_id ?? p.payhere_payment_id ?? null;

  const { data: existing } = await db
    .from('orders')
    .select('id, payment_status, payhere_payment_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!existing) {
    return new Response('Order not found', { status: 404, headers: corsHeaders });
  }

  if (existing.payment_status === 'paid' && existing.payhere_payment_id === payherePaymentId) {
    return new Response('Already processed', { status: 200, headers: corsHeaders });
  }

  const amount = payhereAmount ? Number(payhereAmount) : null;
  const { error } = await db
    .from('orders')
    .update({
      payment_status: 'paid',
      payment_method: 'payhere',
      payment_amount: amount,
      payhere_payment_id: payherePaymentId,
      payhere_order_id: orderId,
      payment_verified_at: new Date().toISOString(),
      payment_notes: 'Verified via PayHere notify',
    })
    .eq('id', orderId);

  if (error) {
    console.error('Order update failed', error.message);
    return new Response('Update failed', { status: 500, headers: corsHeaders });
  }

  return new Response('OK', { status: 200, headers: corsHeaders });
});
