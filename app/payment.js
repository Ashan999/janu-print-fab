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

  /* First non-empty value among candidate column names, looking in contact_details first,
     then homepage_settings. Nothing is hard-coded: the admin controls every value. */
  function pickField(sources, keys) {
    for (const src of sources) {
      if (!src) continue;
      for (const k of keys) {
        const v = src[k];
        if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
      }
    }
    return '';
  }

  function bankDetailsHtml(contact, esc, settings) {
    const src = [contact, settings];
    const bank = pickField(src, ['bank_name', 'payment_bank_name']);
    const branch = pickField(src, ['bank_branch', 'payment_bank_branch', 'branch']);
    const name = pickField(src, ['bank_account_name', 'payment_account_name', 'account_name', 'account_holder']);
    const number = pickField(src, ['bank_account_number', 'payment_account_number', 'account_number']);
    const note = pickField(src, ['bank_instructions', 'payment_instructions']);
    if (!bank && !number) {
      return `<section class="card payment-bank-details" aria-label="Bank transfer details">
      <b>Bank transfer details</b>
      <p class="m">Our bank details are not available online right now. Please contact us to get them before you transfer.</p>
    </section>`;
    }
    const item = (label, value, cls = '') => value ? `<div class="payment-bank-item ${cls}"><span>${label}</span><strong>${esc(value)}</strong></div>` : '';
    return `<section class="card payment-bank-details" aria-label="Bank transfer details">
      <b>Bank transfer details</b>
      <div class="payment-bank-grid">
        ${item('Bank', bank)}${item('Branch', branch)}${item('Account name', name)}${item('Account number', number, 'payment-account-number')}
      </div>
      ${note ? `<p class="m">${esc(note)}</p>` : ''}
    </section>`;
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

  /* Remove a receipt that was uploaded but not attached to the order (RPC failed). Best effort. */
  async function removeReceipt(db, path) {
    if (!path) return;
    try { await db.storage.from('payment-slips').remove([path]); } catch (_) { /* nothing more we can do */ }
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
    return ['bank_transfer', 'bank_deposit', 'online_transfer'].includes(method) ? 'Bank Transfer' :
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

  /* PayHere switches (public values only) come from contact_details. The merchant secret never
     leaves the Edge Functions. */
  function syncPayHereConfig(contact) {
    const cfg = window.JPF_PAYHERE;
    if (!cfg || !contact) return;
    cfg.enabled = contact.payhere_enabled === true;
    cfg.merchantId = String(contact.payhere_merchant_id || '').trim();
    if (typeof contact.payhere_sandbox === 'boolean') cfg.sandbox = contact.payhere_sandbox;
  }

  window.JPFPayment = {
    bankDetailsHtml,
    validateReceiptFile,
    uploadReceipt,
    removeReceipt,
    getSignedUrl,
    openReceipt,
    labelMethod,
    labelStatus,
    badgeClass,
    syncPayHereConfig
  };
})();
