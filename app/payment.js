/* Janu Print | FAB — secure bank-transfer payment helper */
(() => {
  const TOKEN_PREFIX = 'jpf_payment_token_';
  const tokenKey = id => TOKEN_PREFIX + String(id);

  function getToken(orderId) {
    try { return sessionStorage.getItem(tokenKey(orderId)) || ''; } catch (_) { return ''; }
  }

  function hex(bytes) {
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  }

  async function sha256(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
    return hex(digest);
  }

  function safeName(name) {
    return String(name || 'receipt').replace(/[^\w.-]+/g, '_').slice(0, 120);
  }

  function ext(file) {
    const n = String(file?.name || '').toLowerCase();
    const m = n.match(/\.([a-z0-9]{2,5})$/);
    if (m) return m[1];
    if (file?.type === 'application/pdf') return 'pdf';
    if (file?.type === 'image/png') return 'png';
    if (file?.type === 'image/webp') return 'webp';
    return 'jpg';
  }

  function validateReceiptFile(file) {
    if (!file) return 'Select a receipt file.';
    if (file.size > 8 * 1024 * 1024) return 'Receipt is too large. Maximum size is 8 MB.';
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) return 'Receipt must be JPG, PNG, WebP or PDF.';
    return '';
  }

  function bankDetailsHtml(contact, esc) {
    const c = contact || {};
    const bank = c.bank_name || c.payment_bank_name || 'NSB Bank';
    const branch = c.bank_branch || c.payment_bank_branch || 'Hambantota';
    const name = c.bank_account_name || c.payment_account_name || 'M.K. Ashan Virantha';
    const number = c.bank_account_number || c.payment_account_number || '107810154261';
    return `<div class="card">
      <b>Bank Transfer</b>
      <div class="ln"><span>Bank</span><span>${esc(bank)}</span></div>
      <div class="ln"><span>Branch</span><span>${esc(branch)}</span></div>
      <div class="ln"><span>Account Name</span><span>${esc(name)}</span></div>
      <div class="ln"><span>Account Number</span><span>${esc(number)}</span></div>
    </div>`;
  }

  async function uploadReceipt(db, orderId, file) {
    const problem = validateReceiptFile(file);
    if (problem) throw new Error(problem);

    const rawToken = getToken(orderId);
    if (!rawToken) {
      throw new Error('Secure payment access is unavailable. Reopen the order in the same browser.');
    }

    const capabilityHash = await sha256(rawToken);
    const path = `${orderId}/${capabilityHash}/${Date.now()}-${safeName(file.name)}`;

    const { error } = await db.storage.from('payment-slips').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type
    });
    if (error) throw error;

    return { path, capabilityHash };
  }

  function receiptPath(value) {
    const raw = String(value || '');
    if (!raw) return '';
    const marker = '/payment-slips/';
    const i = raw.indexOf(marker);
    return i >= 0 ? raw.slice(i + marker.length).split('?')[0] : raw.replace(/^\/+/, '');
  }

  async function getSignedUrl(db, value, expiresIn = 3600) {
    const path = receiptPath(value);
    if (!path) throw new Error('Receipt path is missing.');
    const { data, error } = await db.storage.from('payment-slips').createSignedUrl(path, expiresIn);
    if (error) throw error;
    return data?.signedUrl || '';
  }

  async function openReceipt(db, value) {
    const url = await getSignedUrl(db, value, 3600);
    if (!url) throw new Error('Signed receipt URL could not be generated.');
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function labelMethod(method) {
    return method === 'bank_transfer' ? 'Bank Transfer' :
           method === 'payhere' ? 'PayHere / Online Card' : '—';
  }

  function labelStatus(status) {
    const s = String(status || 'pending');
    return s.replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase());
  }

  function badgeClass(status) {
    const s = String(status || 'pending').toLowerCase();
    if (s === 'paid') return 'ok';
    if (['rejected', 'failed'].includes(s)) return 'bad';
    if (['receipt_submitted', 'under_review'].includes(s)) return 'warn';
    return 'muted';
  }

  function syncPayHereConfig() {}

  window.JPFPayment = {
    bankDetailsHtml,
    validateReceiptFile,
    uploadReceipt,
    getSignedUrl,
    openReceipt,
    labelMethod,
    labelStatus,
    badgeClass,
    syncPayHereConfig
  };
})();
