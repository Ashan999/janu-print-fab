/* Janu Print | FAB — public policy page content (no invented legal claims). */
window.JPFPolicies = (() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function contactBlock(c) {
    c = c || {};
    const lines = [];
    if (c.business_name || c.name) lines.push(`<strong>${esc(c.business_name || c.name)}</strong>`);
    if (c.address) lines.push(esc(c.address));
    if (c.phone) lines.push(`Phone: ${esc(c.phone)}`);
    if (c.email) lines.push(`Email: ${esc(c.email)}`);
    if (c.whatsapp) lines.push(`WhatsApp: ${esc(c.whatsapp)}`);
    return lines.length
      ? `<div class="card"><h2>Contact</h2><p class="m">${lines.join('<br>')}</p></div>`
      : '<p class="m">Contact details are available on our home page and account area.</p>';
  }

  function wrap(title, sections, contact) {
    return `<h1>${esc(title)}</h1><p class="m">Last updated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
    ${sections.map(s => `<div class="card policy-block"><h2>${esc(s.h)}</h2>${s.p.map(x => `<p class="m">${x}</p>`).join('')}</div>`).join('')}
    ${contactBlock(contact)}
    <a class="btn full" href="#/home">Back to Home</a>`;
  }

  function refund(contact) {
    return wrap('Refund Policy', [
      { h: 'Overview', p: ['Janu Print | FAB provides custom printing services. Because many orders are made to your specifications, refunds are handled case by case after we review the order and payment records.'] },
      { h: 'Eligible situations', p: ['We may offer a refund or partial refund when we cannot fulfil the order as agreed, when there is a verified production error on our side, or when applicable consumer protection rules require it.'] },
      { h: 'Non-refundable situations', p: ['Approved custom artwork, completed production, or items that cannot be resold due to personalization are generally not refundable unless required by law.'] },
      { h: 'How to request a refund', p: ['Contact us with your order reference, payment method, and reason for the request. We will respond after reviewing order status and payment verification.'] },
      { h: 'Processing time', p: ['Approved refunds are processed using the original payment method where possible. Bank transfer refunds may require valid account details you provide.'] }
    ], contact);
  }

  function privacy(contact) {
    return wrap('Privacy Policy', [
      { h: 'Information we collect', p: ['We collect information you provide when ordering or creating an account, such as name, phone, email, delivery details, artwork files, and payment references you submit for bank transfers.'] },
      { h: 'How we use information', p: ['We use your information to process orders, communicate about production and delivery, verify payments, and improve our services. We do not store card numbers or CVV on our servers.'] },
      { h: 'Storage & security', p: ['Order and account data is stored in our secure database. Artwork and payment receipts are stored in protected cloud storage with access controlled by our security policies.'] },
      { h: 'Sharing', p: ['We do not sell your personal data. We may share data with payment processors (such as PayHere when enabled) and delivery partners only as needed to complete your order.'] },
      { h: 'Your choices', p: ['You may request correction of contact details associated with your account. You may contact us regarding questions about data we hold about your orders.'] }
    ], contact);
  }

  function terms(contact) {
    return wrap('Business Terms & Conditions', [
      { h: 'Orders & quotes', p: ['Prices shown during ordering are estimates based on your selections. Final confirmation may depend on artwork review and production requirements.'] },
      { h: 'Artwork & approval', p: ['You are responsible for supplying artwork suitable for printing. We may contact you if artwork quality or content needs adjustment before production.'] },
      { h: 'Payment', p: ['Payment must be completed using the methods offered on our website. Bank transfer payments are confirmed after we verify your receipt. Card payments through PayHere are confirmed by secure server notification when that service is enabled.'] },
      { h: 'Production & delivery', p: ['Production and delivery timelines depend on product type, options selected, and delivery method. Estimated dates are guides, not guaranteed unless explicitly agreed in writing.'] },
      { h: 'Liability', p: ['Our liability is limited to the amount paid for the relevant order except where applicable law requires otherwise.'] },
      { h: 'Changes', p: ['We may update these terms from time to time. Continued use of our ordering service after updates constitutes acceptance of the revised terms.'] }
    ], contact);
  }

  return { refund, privacy, terms };
})();
