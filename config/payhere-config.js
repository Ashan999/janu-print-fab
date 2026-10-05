/**
 * PayHere client configuration — NO secrets here.
 * Merchant Secret belongs only in Supabase Edge Function env (PAYHERE_MERCHANT_SECRET).
 * Enable checkout only after merchant approval and DB/contact_details flags are set.
 */
window.JPF_PAYHERE = {
  /** When false, UI shows card payment as unavailable / coming soon */
  enabled: false,
  sandbox: true,
  /** Public merchant ID from PayHere (not secret) */
  merchantId: '',
  /** Supabase Edge Function URL — deploy payhere-notify first */
  notifyPath: '/functions/v1/payhere-notify',
  checkoutBase: {
    sandbox: 'https://sandbox.payhere.lk/pay/checkout',
    live: 'https://www.payhere.lk/pay/checkout'
  },
  getNotifyUrl() {
    const base = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '';
    return base ? `${base}${this.notifyPath}` : '';
  },
  checkoutUrl() {
    return this.sandbox ? this.checkoutBase.sandbox : this.checkoutBase.live;
  }
};
