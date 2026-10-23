/* Janu Print | FAB — customer app. All data from Supabase (window.db). */
const CUR = 'LKR';
const LOGO = 'https://i.ibb.co/h1TnrT8Y/LOGO.png';
const STATUSES = ['pending', 'accepted', 'printing', 'ready', 'completed'];
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => `${CUR} ${Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const fdate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + Number(n || 0)); return d.toISOString().slice(0, 10); };
const ref = o => o.order_number || ('JP-' + String(o.id).slice(0, 8).toUpperCase());
const S = { cats: [], prods: [], fields: {}, opts: {}, dset: {}, slots: [], contact: null, profile: null, orders: null, q: '', cat: 'all', tab: 'active', done: null, ready: false };
let F = null;

const grp = (a, k) => a.reduce((g, x) => ((g[x[k]] = g[x[k]] || []).push(x), g), {});
const img = p => p.featured_image || (Array.isArray(p.images) && p.images[0]) || p.categories?.image_url || '';
const categoryName = p => p.categories?.name || '';
const homeProducts = () => S.prods.filter(p => { const n = String(p.name || '').trim().toLowerCase(); const c = String(categoryName(p) || '').trim().toLowerCase(); return n && (!c || n !== c); });
const hasPublishedPrice = p => p?.price_is_published === true && Number(p.price_per_unit ?? p.price ?? 0) > 0;
const base = p => hasPublishedPrice(p) ? Number(p.price_per_unit ?? p.price) : 0;

async function load() {
  const db = window.db;
  const sessionResult = await window.JPFCustomerAuth?.getSession?.().catch(() => ({ data: { session: null } }));
  const activeSession = sessionResult?.data?.session || null;
  const [c, p, f, o, d, s, ct, pr] = await Promise.all([
    db.from('categories').select('*').eq('is_visible', true).order('display_order'),
    db.from('products').select('*, categories(id, name, image_url)').eq('is_visible', true).order('display_order'),
    db.from('product_fields').select('*').eq('is_enabled', true).order('display_order'),
    db.from('product_field_options').select('*').order('display_order'),
    db.from('delivery_settings').select('*'),
    db.from('delivery_slots').select('*').eq('is_active', true).order('display_order'),
    db.from('contact_details').select('*').eq('id', 'main').maybeSingle(),
    activeSession ? window.JPFCustomerAuth.getProfile().catch(() => null) : null
  ]);
  const bad = c.error || p.error || f.error || o.error;
  if (bad) throw bad;
  S.cats = c.data || []; S.prods = p.data || [];
  S.fields = grp(f.data || [], 'product_id'); S.opts = grp(o.data || [], 'product_field_id');
  S.dset = Object.fromEntries((d.data || []).map(x => [x.category_id, x]));
  S.slots = s.data || []; S.contact = ct.data || null; S.profile = pr || null;
  if (window.JPFPayment && S.contact) window.JPFPayment.syncPayHereConfig(S.contact);
  S.ready = true;
}

/* ---------- shell ---------- */
function footerHtml() {
  const contact = S.contact || {};
  const links = [
    `<a href="#/refund-policy">Refund policy</a>`,
    `<a href="#/privacy-policy">Privacy policy</a>`,
    `<a href="#/terms">Terms</a>`
  ];
  return `<footer class="site-footer"><div class="site-footer__inner"><div class="site-footer__links">${links.join('')}</div><div class="m">${esc(contact.business_name || 'Janu Print | FAB')} ${contact.phone ? `· ${esc(contact.phone)}` : ''}</div></div></footer>`;
}
function shell(body, { flow = false, title = '', back = '' } = {}) {
  const on = h => (location.hash || '').startsWith('#/' + h) ? 'on' : '';
  $('#app').innerHTML = `<header class="top">${flow || back ? `<button class="ib" data-a="back" aria-label="Back">←</button><b>${esc(title)}</b>` :
    `<img src="${LOGO}" alt=""><b>Janu Print <span>| FAB</span></b>`}<span class="sp"></span>${flow ? '' : `<a class="ib" href="#/account" aria-label="Account">👤</a>`}</header>
  <main class="${flow ? 'flow' : ''}">${body}</main>
  ${flow ? '' : `<nav class="nav"><a href="#/home" class="${on('home')}"><i>🏠</i>Home</a><a href="#/shop" class="${on('shop')}"><i>🛍️</i>Shop</a><a href="#/orders" class="${on('orders')}"><i>📦</i>Orders</a><a href="#/account" class="${on('account')}"><i>👤</i>Account</a></nav>`}
  ${flow ? '' : footerHtml()}`;
  window.scrollTo(0, 0);
}
const prodCard = p => `<a class="pc" href="#/order/${encodeURIComponent(p.id)}"><div class="im" style="${img(p) ? `background-image:url('${esc(img(p))}')` : ''}">${img(p) ? '' : '🖨️'}</div><div class="pc-body"><small>${esc(categoryName(p) || 'Print product')}</small><b>${esc(p.name)}</b><span>${hasPublishedPrice(p) ? 'From ' + money(base(p)) : 'Get a quote'}</span><em>Order →</em></div></a>`;
const catCard = c => `<a class="cat" href="#/shop/${encodeURIComponent(c.id)}" style="text-decoration:none;color:inherit"><div class="im" style="${c.image_url ? `background-image:url('${esc(c.image_url)}')` : ''}">${c.image_url ? '' : '🖨️'}</div><b>${esc(c.name)}</b><small>Browse products →</small></a>`;
const wa = txt => S.contact?.whatsapp ? `https://wa.me/${String(S.contact.whatsapp).replace(/\D/g, '')}${txt ? '?text=' + encodeURIComponent(txt) : ''}` : '';

/* ---------- screens ---------- */
function home() {
  const c = S.contact || {};
  const featured = homeProducts().slice(0, 8);
  shell(`<div class="home-hero"><div><span class="eyebrow">Janu Print | FAB</span><h1>Print something great.</h1><p class="m">Choose a service, pick a product, and get your order started in minutes.</p></div><a class="btn hero-btn" href="#/shop">Start an Order →</a></div>
  <h2>What do you need?</h2><p class="section-note">Choose a printing service</p><div class="row category-row">${S.cats.map(catCard).join('') || '<p class="m">No services yet.</p>'}</div>
  ${featured.length ? `<div class="section-head"><div><h2>Popular products</h2><p class="section-note">Products ready to order</p></div><a href="#/shop">View all →</a></div><div class="row product-row">${featured.map(prodCard).join('')}</div>` : ''}
  <h2>Quick actions</h2><div class="acts"><a href="#/shop">🛒 Start Order</a><a href="#/orders">📦 View Orders</a>
  ${wa() ? `<a href="${wa('Hello Janu Print | FAB')}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}${c.phone ? `<a href="tel:${esc(c.phone)}">📞 Call us</a>` : ''}</div>`);
}

function shop(catId) {
  if (catId) S.cat = catId;
  shell(`<input id="q" type="search" placeholder="Search products" value="${esc(S.q)}">
  <div class="chips"><button class="chip ${S.cat === 'all' ? 'on' : ''}" data-a="cat" data-id="all">All</button>${S.cats.map(c => `<button class="chip ${S.cat === c.id ? 'on' : ''}" data-a="cat" data-id="${c.id}">${esc(c.name)}</button>`).join('')}</div>
  <div class="grid" id="pg"></div>`);
  $('#q').oninput = e => { S.q = e.target.value; grid(); };
  grid();
}
function grid() {
  const q = S.q.trim().toLowerCase();
  const l = S.prods.filter(p => (S.cat === 'all' || p.category_id === S.cat) && (!q || (p.name + ' ' + (p.description || '')).toLowerCase().includes(q)));
  $('#pg').innerHTML = l.map(prodCard).join('') || '<div class="empty" style="grid-column:1/-1">No products found.</div>';
}

/* ---------- secure payment capability ---------- */
const PAYMENT_TOKEN_PREFIX = 'jpf_payment_token_';
function paymentTokenKey(orderId) { return PAYMENT_TOKEN_PREFIX + String(orderId); }
function randomPaymentToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
function getPaymentToken(orderId) {
  try { return sessionStorage.getItem(paymentTokenKey(orderId)) || ''; } catch (_) { return ''; }
}
function setPaymentToken(orderId, token) {
  try { sessionStorage.setItem(paymentTokenKey(orderId), token); } catch (_) {}
}

/* ---------- order flow ---------- */
const STEP = ['Options', 'Artwork', 'Delivery', 'Details', 'Review', 'Payment'];
function startFlow(id) {
  const p = S.prods.find(x => x.id === id);
  if (!p) return (location.hash = '#/shop');
  const pf = S.profile || {};
  const orderId = crypto.randomUUID();
  setPaymentToken(orderId, randomPaymentToken());
  F = { p, id: orderId, step: 0, qty: Math.max(Number(p.min_quantity || 1), 1), sel: {}, files: [], mode: 'upload', notes: '', dlv: 'pickup', urgent: false, slot: '', date: '', err: '', placing: false, busy: 0, pm: '',
    cust: { name: pf.name || '', phone: pf.phone || '', whatsapp: '', email: pf.email || '', address: '' } };
  flow();
}
const flds = () => (S.fields[F.p.id] || []).filter(f => f.field_type !== 'file');
const dset = () => S.dset[F.p.category_id] || null;
const days = () => { const d = dset(); return F.urgent && d?.urgent_available ? d.urgent_delivery_days : d?.normal_production_days; };
const sqm = (w, h, u) => (Number(w) || 0) * (Number(h) || 0) * ({ mm: 1e-6, cm: 1e-4, inch: 6.4516e-4, ft: 0.092903 }[u] || 1e-4);

function selections() {
  const out = [];
  flds().forEach(f => {
    const v = F.sel[f.id], os = S.opts[f.id] || [], t = f.field_type;
    if (v == null || v === '' || v === false) return;
    if (t === 'select' || t === 'radio') { const o = os.find(x => x.id === v); if (o) out.push({ label: f.field_label, value: o.label, price: hasPublishedPrice(F.p) ? Number(o.price_modifier || 0) : 0 }); }
    else if (t === 'toggle' || t === 'checkbox') out.push({ label: f.field_label, value: 'Yes', price: hasPublishedPrice(F.p) ? Number(f.price_modifier || 0) : 0 });
    else if (t === 'dimension') { if (v.w && v.h) { const a = sqm(v.w, v.h, v.u); out.push({ label: f.field_label, value: `${v.w} x ${v.h} ${v.u}`, price: hasPublishedPrice(F.p) ? a * Number(f.price_modifier || 0) : 0, meta: a.toFixed(3) + ' sqm' }); } }
    else if (t === 'number') out.push({ label: f.field_label, value: v, price: hasPublishedPrice(F.p) ? Number(v) * Number(f.price_modifier || 0) : 0 });
    else out.push({ label: f.field_label, value: v, price: 0 });
  });
  return out;
}
function calc() {
  const d = dset(), sel = selections(), extras = sel.reduce((s, x) => s + x.price, 0), unit = base(F.p) + extras, items = unit * F.qty;
  const fee = F.dlv === 'delivery' ? Number(d?.normal_delivery_fee || 0) : 0;
  const urg = F.urgent && d?.urgent_available ? Number(d.urgent_extra_fee || 0) : 0;
  const slot = S.slots.find(s => s.id === F.slot), slotFee = Number(slot?.additional_fee || 0);
  return { sel, unit, items, fee, urg, slot, slotFee, total: items + fee + urg + slotFee };
}
function flow() {
  const c = calc(), last = F.step === STEP.length - 1;
  shell(`<div class="steps">${STEP.map((_, i) => `<i class="${i <= F.step ? 'on' : ''}"></i>`).join('')}</div><p class="m">Step ${F.step + 1} of ${STEP.length} · ${STEP[F.step]}</p>
  ${F.err ? `<div class="err">${esc(F.err)}</div>` : ''}<div id="stepbody">${[stOptions, stArt, stDelivery, stDetails, stReview, stPayment][F.step](c)}</div>
  <div class="bar"><div><small>${F.step >= 4 ? 'Total' : 'Estimated total'}</small><strong id="tot">${money(c.total)}</strong></div><span class="sp"></span>
  <button class="btn" id="next" data-a="next" ${F.placing || F.busy ? 'disabled' : ''}>${last ? (F.placing ? 'Processing Order…' : 'Place Order') : (F.step === 4 ? 'Continue to Payment' : 'Continue')}</button></div>`, { flow: true, title: F.p.name });
}
const bar = () => { const c = calc(); const t = $('#tot'); if (t) t.textContent = money(c.total); };
const opt = (on, a, id, label, sub = '') => `<button class="opt ${on ? 'on' : ''}" data-a="${a}" data-id="${id}">${esc(label)}${sub ? ` <small>${sub}</small>` : ''}</button>`;

function stOptions() {
  const p = F.p, min = Number(p.min_quantity || 1);
  const fl = flds().map(f => {
    const os = S.opts[f.id] || [], v = F.sel[f.id], t = f.field_type, req = f.is_required ? ' *' : '';
    let h = '';
    if (t === 'select' || t === 'radio') h = `<div class="opts">${os.map(o => opt(v === o.id, 'pick', f.id + '|' + o.id, o.label, hasPublishedPrice(F.p) && Number(o.price_modifier) ? '+' + money(o.price_modifier) : '')).join('')}</div>`;
    else if (t === 'toggle' || t === 'checkbox') h = `<div class="opts">${opt(!!v, 'tog', f.id, 'Yes', hasPublishedPrice(F.p) && Number(f.price_modifier) ? '+' + money(f.price_modifier) : '')}</div>`;
    else if (t === 'dimension') { const d = v || { w: '', h: '', u: 'cm' };
      h = `${os.length ? `<div class="opts" style="margin-bottom:8px">${os.map(o => opt(d.preset === o.id, 'preset', f.id + '|' + o.id, o.label, o.preset_width ? `${o.preset_width}×${o.preset_height} ${o.preset_unit || 'cm'}` : '')).join('')}</div>` : ''}
      <div class="dim"><input type="number" min="0" step="0.01" placeholder="Width" data-in="${f.id}" data-k="w" value="${esc(d.w)}"><input type="number" min="0" step="0.01" placeholder="Height" data-in="${f.id}" data-k="h" value="${esc(d.h)}">
      <select data-in="${f.id}" data-k="u">${['cm', 'mm', 'inch', 'ft'].map(u => `<option ${d.u === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>`; }
    else if (t === 'text') h = `<textarea data-in="${f.id}" data-k="">${esc(v || '')}</textarea>`;
    else h = `<input type="${t === 'date' ? 'date' : 'number'}" data-in="${f.id}" data-k="" value="${esc(v || '')}">`;
    return `<label class="l">${esc(f.field_label)}${req}</label>${h}`;
  }).join('');
  return `<div class="card">${img(p) ? `<img class="order-product-image" src="${esc(img(p))}" alt="${esc(p.name)}">` : ''}${p.description ? `<p class="m" style="margin-bottom:8px">${esc(p.description)}</p>` : ''}${fl}
  <label class="l">Quantity${min > 1 ? ` (min ${min})` : ''}</label><div class="qty"><button data-a="qm">−</button><input type="number" id="qty" min="${min}" value="${F.qty}"><button data-a="qp">+</button></div></div>`;
}
function stArt() {
  return `<div class="card"><div class="opts">${opt(F.mode === 'upload', 'mode', 'upload', 'Upload artwork')}${S.contact?.whatsapp ? opt(F.mode === 'whatsapp', 'mode', 'whatsapp', 'Send via WhatsApp') : ''}</div>
  ${F.mode === 'upload' ? `<label class="l">Your design</label><input type="file" id="file" multiple>${F.files.map((f, i) => `<div class="file">${f.preview ? `<img src="${f.preview}" alt="">` : '📄'}<span>${esc(f.name)}</span><small>${f.status === 'up' ? 'Uploading…' : f.status === 'err' ? 'Failed' : '✓'}</small><button data-a="rm" data-id="${i}">✕</button></div>`).join('')}`
    : `<p class="m" style="margin-top:10px">We'll ask you to send your artwork on WhatsApp after you place the order.</p>`}
  <label class="l">Notes for our designer (optional)</label><textarea id="notes">${esc(F.notes)}</textarea></div>`;
}
function stDelivery() {
  const d = dset(), est = addDays(days() || 0);
  if (!F.date) F.date = est;
  return `<div class="card"><label class="l">Method</label><div class="opts">${opt(F.dlv === 'pickup', 'dlv', 'pickup', 'Pickup', 'Free')}${opt(F.dlv === 'delivery', 'dlv', 'delivery', 'Delivery', Number(d?.normal_delivery_fee) ? '+' + money(d.normal_delivery_fee) : '')}</div>
  ${d?.urgent_available ? `<label class="l">Speed</label><div class="opts">${opt(!F.urgent, 'urg', '0', 'Normal', (d.normal_production_days || 0) + ' days')}${opt(F.urgent, 'urg', '1', 'Urgent', `${d.urgent_delivery_days || 0} days · +${money(d.urgent_extra_fee)}`)}</div>` : (d ? `<p class="m" style="margin-top:8px">Production time: ${d.normal_production_days || 0} days</p>` : '')}
  <label class="l">Date</label><input type="date" id="date" min="${est}" value="${F.date}">
  ${S.slots.length ? `<label class="l">Time slot</label><div class="opts">${S.slots.map(s => opt(F.slot === s.id, 'slot', s.id, s.slot_name, (s.start_time ? String(s.start_time).slice(0, 5) + '–' + String(s.end_time || '').slice(0, 5) : '') + (Number(s.additional_fee) ? ' +' + money(s.additional_fee) : ''))).join('')}</div>` : ''}</div>`;
}
function stDetails() {
  const c = F.cust, i = (k, l, t = 'text', r = '') => `<label class="l">${l}${r}</label><input type="${t}" data-c="${k}" value="${esc(c[k])}">`;
  return `<div class="card">${S.profile ? '' : `<p class="m">Ordering as guest. <a href="customer-login.html">Log in</a> to track your orders.</p>`}
  ${i('name', 'Name', 'text', ' *')}${i('phone', 'Phone', 'tel', ' *')}${i('whatsapp', 'WhatsApp (if different)', 'tel')}${i('email', 'Email', 'email')}
  <label class="l">Address${F.dlv === 'delivery' ? ' *' : ''}</label><textarea data-c="address">${esc(c.address)}</textarea></div>`;
}
function stPayment(c) {
  return `<div class="card"><h1>Payment</h1><p class="m">No payment methods are configured for this website.</p>
  <div class="ln"><span>Payment method</span><span>Arrange with the business</span></div>
  <div class="ln"><span>Payment status</span><span class="badge pending">Pending</span></div>
  <p class="m">Online payment is unavailable. Do not send payment details here. The business will confirm an available method after receiving your order.</p>
  </div><div class="card"><b>Order total</b><div class="ln"><span>Items</span><span>${money(c.items)}</span></div>${c.fee ? `<div class="ln"><span>Delivery</span><span>${money(c.fee)}</span></div>` : ''}${c.urg ? `<div class="ln"><span>Urgent charge</span><span>${money(c.urg)}</span></div>` : ''}${c.slotFee ? `<div class="ln"><span>Time slot</span><span>${money(c.slotFee)}</span></div>` : ''}<div class="ln t"><span>Total due</span><span>${money(c.total)}</span></div></div>`;
}
function stReview(c) {
  const p = F.p, ok = '<span style="color:var(--ok)">✓</span>';
  return `<div class="card"><b>${esc(p.name)}</b>${c.sel.map(s => `<div class="ln"><span>${esc(s.label)}</span><span>${esc(s.value)}</span></div>`).join('')}<div class="ln"><span>Quantity</span><span>${F.qty}</span></div></div>
  <div class="card"><div class="ln"><span>Artwork</span><span>${F.mode === 'upload' ? (F.files.length ? ok + ' ' + F.files.length + ' file(s)' : 'None') : 'Via WhatsApp'}</span></div>
  <div class="ln"><span>${F.dlv === 'delivery' ? 'Delivery' : 'Pickup'}</span><span>${fdate(F.date)}${c.slot ? ' · ' + esc(c.slot.slot_name) : ''}</span></div><div class="ln"><span>Customer</span><span>${esc(F.cust.name)} · ${esc(F.cust.phone)}</span></div></div>
  <div class="card"><div class="ln"><span>Subtotal</span><span>${money(c.items)}</span></div>${c.fee ? `<div class="ln"><span>Delivery</span><span>${money(c.fee)}</span></div>` : ''}${c.urg ? `<div class="ln"><span>Urgent charge</span><span>${money(c.urg)}</span></div>` : ''}${c.slotFee ? `<div class="ln"><span>Time slot</span><span>${money(c.slotFee)}</span></div>` : ''}<div class="ln t"><span>Total</span><span>${money(c.total)}</span></div>
  <p class="m">Next, you will choose how to pay.</p></div>`;
}

/* ---------- payment: method selection, bank transfer, PayHere ---------- */
const PAY_OPEN = ['pending', 'rejected', 'failed'];
const payhereReady = () => !!(window.JPF_PAYHERE && window.JPF_PAYHERE.enabled && window.JPF_PAYHERE.merchantId);
const errMsg = e => (e && (e.message || e.error_description)) || String(e || 'Unknown error');
const payErr = m => { const el = $('#payerr'); if (el) { el.textContent = m; el.hidden = false; } else alert(m); };
const afterPay = id => (S.done && S.done.id === id ? '#/done' : '#/orders/' + id);
async function payStatus(id) {
  try { const { data, error } = await window.db.rpc('jpf_get_payment_status', { p_order_id: id }); if (error) return null; return Array.isArray(data) ? data[0] : data; } catch (_) { return null; }
}
function stPayment(c) {
  const ph = payhereReady();
  const pm = (id, title, sub, off) => `<button type="button" class="opt pm ${F.pm === id ? 'on' : ''}" data-a="pm" data-id="${id}" ${off ? 'disabled' : ''}><b>${title}</b><br><small>${sub}</small></button>`;
  return `<div class="card"><label class="l" style="margin-top:0">Payment method</label>
  ${pm('bank_transfer', 'Bank Transfer', 'Pay from your bank, then send us your reference and receipt. We verify it before confirming.')}
  ${pm('payhere', 'PayHere / Online Card Payment', ph ? 'Pay securely by card. Confirmed automatically by PayHere.' : 'Not available yet', !ph)}
  <div class="ln t"><span>Total to pay</span><span>${money(c.total)}</span></div>
  <p class="m">Your order is created when you tap Place Order. You complete payment on the next screen.</p></div>`;
}
function bankForm(o) {
  return `<div style="margin-top:12px">${window.JPFPayment.bankDetailsHtml(S.contact, esc)}<div class="ln t"><span>Amount to transfer</span><span>${money(o.total_amount)}</span></div>
  <label class="l">Transaction / reference number</label><input type="text" id="payment-reference" value="${esc((o.payment_reference || '').trim())}" autocomplete="off">
  <label class="l">Receipt (JPG, PNG, WebP or PDF, max 8 MB)</label><input type="file" id="payment-receipt" accept=".png,.jpg,.jpeg,.webp,.pdf">
  <label class="l">Note for our team (optional)</label><textarea id="payment-note"></textarea>
  <div class="err" id="payerr" hidden></div>
  <button class="btn full" data-a="payment-submit" data-id="${esc(o.id)}" type="button">Submit payment receipt</button></div>`;
}
function payhereBtn(o) {
  if (!payhereReady()) return `<p class="m">Card payment is not available yet.</p>${bankForm(o)}`;
  return `<div style="margin-top:12px"><div class="err" id="payerr" hidden></div><button class="btn full" data-a="payhere-go" data-id="${esc(o.id)}" type="button">Pay ${money(o.total_amount)} with card (PayHere)</button><button class="btn alt full" data-a="use-bank" data-id="${esc(o.id)}" type="button">Use bank transfer instead</button><p class="m">You will be taken to PayHere. Your order is only marked paid after PayHere confirms the payment to our server.</p></div>`;
}
async function submitBankPayment(orderId) {
  const P = window.JPFPayment; if (!P) return 'Payment helper is not available.';
  const refVal = ($('#payment-reference')?.value || '').trim(), note = ($('#payment-note')?.value || '').trim();
  const file = $('#payment-receipt')?.files?.[0] || null;
  if (!refVal && !file) return 'Add a reference number or upload a receipt.';
  if (file) { const fe = P.validateReceiptFile(file); if (fe) return fe; }
  let path = null;
  if (file) { try { path = (await P.uploadReceipt(window.db, orderId, file)).path; } catch (e) { return 'Receipt upload failed: ' + errMsg(e); } }
  const paymentToken = getPaymentToken(orderId);
  if (!paymentToken) return 'Secure payment session is missing. Please reopen this order in the same browser.';
  const { error } = await window.db.rpc('jpf_submit_bank_payment', { p_order_id: orderId, p_payment_token: paymentToken, p_reference: refVal || null, p_receipt_path: path, p_notes: note || null });
  return error ? 'Payment details could not be saved: ' + errMsg(error) : '';
}
async function startPayHere(orderId) {
  if (!payhereReady()) throw new Error('Card payment is not available yet. Please choose bank transfer.');
  let res;
  try { res = await window.db.functions.invoke('payhere-checkout', { body: { order_id: orderId } }); } catch (e) { throw new Error('Could not reach the payment service. ' + errMsg(e)); }
  let d = res.data;
  if (res.error && res.error.context && res.error.context.json) { try { d = await res.error.context.json(); } catch (_) {} }
  if (!d || d.error || !d.fields || !/^https:\/\/(sandbox|www)\.payhere\.lk\//.test(d.checkout_url || '')) throw new Error((d && d.error) || 'Could not start PayHere checkout. Please try again or use bank transfer.');
  const here = location.href.split('#')[0];
  const fields = { ...d.fields, return_url: here + '#/pay-return/' + orderId, cancel_url: here + '#/pay-cancel/' + orderId };
  const f = document.createElement('form'); f.method = 'POST'; f.action = d.checkout_url;
  Object.entries(fields).forEach(([k, v]) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = String(v ?? ''); f.appendChild(i); });
  document.body.appendChild(f); f.submit();
}
async function payView(id) {
  shell('<div class="sk"></div><div class="sk"></div>');
  const P = window.JPFPayment; if (!P) return shell('<div class="err">Payment module failed to load.</div>');
  let o = S.done && S.done.id === id ? S.done : null;
  if (!o && S.profile) { try { S.orders = S.orders || await window.JPFCustomerAuth.loadOrderHistory(); o = S.orders.find(x => x.id === id) || null; } catch (_) {} }
  if (!o) return shell('<div class="empty">Order not found.</div>');
  const st = await payStatus(id);
  if (st) { o.payment_status = st.payment_status || o.payment_status; o.payment_method = st.payment_method || o.payment_method; }
  const s = o.payment_status || 'pending', m = o.payment_method, open = PAY_OPEN.includes(s), msg = S.payMsg || ''; S.payMsg = '';
  let act = '';
  if (s === 'paid') act = '<p class="m">Payment confirmed. Thank you!</p>';
  else if (s === 'receipt_submitted' || s === 'under_review') act = '<p class="m">We received your payment details. Our team will verify them and update your order.</p>';
  else if (open) act = (m === 'payhere' && S.bankFor !== id) ? payhereBtn(o) : bankForm(o);
  shell(`<h1>Payment</h1><p class="m">${esc(ref(o))}</p>${msg ? `<div class="err">${esc(msg)}</div>` : ''}
  <div class="card"><div class="ln"><span>Method</span><span>${esc(P.labelMethod(m))}</span></div><div class="ln"><span>Status</span><span class="badge ${P.badgeClass(s)}">${esc(P.labelStatus(s))}</span></div><div class="ln t"><span>Total</span><span>${money(o.total_amount)}</span></div>${act}</div>
  <a class="btn alt full" href="${afterPay(id)}">${open ? 'Pay later' : 'Continue to order confirmation'}</a>`);
}
async function payReturn(id) {
  shell('<div class="ok"><div class="tick">…</div><h1>Confirming your payment</h1><p class="m">Waiting for PayHere to confirm. Please do not close this page.</p></div>');
  let st = null;
  for (let i = 0; i < 8; i++) {
    st = await payStatus(id);
    if (st && st.payment_status !== 'pending') break;
    await new Promise(r => setTimeout(r, 3000));
    if (!location.hash.includes(id)) return;
  }
  const s = st && st.payment_status, link = `<a class="btn full" href="${afterPay(id)}">Continue</a>`;
  if (s === 'paid') { if (S.done && S.done.id === id) S.done.payment_status = 'paid'; shell(`<div class="ok"><div class="tick">✓</div><h1>Payment received</h1></div>${link}`); }
  else if (s === 'failed' || s === 'rejected') shell(`<div class="err">PayHere reported that the payment did not go through. No payment was taken.</div><a class="btn full" href="#/pay/${esc(id)}">Try again</a>`);
  else shell(`<div class="card"><b>Waiting for confirmation</b><p class="m">We have not received PayHere's confirmation yet. This can take a few minutes. Your order is saved and its payment status will update once PayHere confirms it.</p></div>${link}`);
}

function validate() {
  const s = F.step;
  if (s === 0) {
    for (const f of flds()) { const v = F.sel[f.id]; if (f.is_required && (!v || (f.field_type === 'dimension' && !(v.w && v.h)))) return `Please choose: ${f.field_label}`; }
    if (F.qty < Number(F.p.min_quantity || 1)) return `Minimum quantity is ${F.p.min_quantity}`;
  }
  if (s === 1) { if (F.busy) return 'Please wait for the upload to finish.'; if ((S.fields[F.p.id] || []).some(f => f.field_type === 'file' && f.is_required) && F.mode === 'upload' && !F.files.some(f => f.status === 'ok')) return 'Please upload your artwork or choose WhatsApp.'; }
  if (s === 2 && !F.date) return 'Please choose a date.';
  if (s === 3) { const c = F.cust; if (!c.name.trim() || !c.phone.trim()) return 'Name and phone are required.'; if (F.dlv === 'delivery' && !c.address.trim()) return 'Address is required for delivery.'; }
  if (s === 5) { if (!F.pm) return 'Please choose a payment method.'; if (F.pm === 'payhere' && !payhereReady()) return 'Card payment is not available yet. Please choose Bank Transfer.'; }
  return '';
}

async function upload(files) {
  for (const file of files) {
    const e = { name: file.name, status: 'up', preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '' };
    F.files.push(e); F.busy++; flow();
    const path = `${F.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    const { error } = await window.db.storage.from('artwork').upload(path, file);
    if (error) { e.status = 'err'; F.err = 'Upload failed: ' + error.message; }
    else { e.url = window.db.storage.from('artwork').getPublicUrl(path).data.publicUrl; e.path = path; e.status = 'ok'; }
    F.busy--; if (F && F.step === 1) flow();
  }
}

async function place() {
  if (F.placing) return;
  F.placing = true; F.err = ''; flow();
  const c = calc(), p = F.p, cu = F.cust, oid = F.id, itemId = F.itemId;
  try {
    const cid = S.profile ? (S.profile.userId || S.profile.id) : (F.cid = F.cid || crypto.randomUUID());
    const cust = { id: cid, name: cu.name.trim(), phone: cu.phone.trim(), whatsapp: cu.whatsapp.trim() || null, email: cu.email.trim() || null, address: cu.address.trim() || null };
    const r1 = S.profile ? await window.db.from('customers').upsert(cust, { onConflict: 'id' }) : await window.db.from('customers').insert(cust);
    if (r1.error && r1.error.code !== '23505') throw r1.error;
    const note = F.notes.trim();
    const paymentToken = getPaymentToken(oid);
    if (!paymentToken) throw new Error('Secure payment session is missing. Please start the order again.');
    const paymentCapabilityHash = await sha256Hex(paymentToken);
    const r2 = await window.db.from('orders').insert({ id: oid, customer_id: cid, status: 'pending', total_amount: c.total, payment_method: F.pm, payment_capability_hash: paymentCapabilityHash, delivery_option: F.dlv, delivery_date: F.date || null, notes: note || null, special_instructions: note || null,
      delivery_slot_id: c.slot ? c.slot.id : null, delivery_fee: c.fee, urgent_order: !!(F.urgent && dset()?.urgent_available), production_days: days() || null, estimated_ready_date: F.date || addDays(days() || 0),
      delivery_address: F.dlv === 'delivery' ? (cu.address.trim() || null) : null, customer_phone: cu.phone.trim() });
    if (r2.error) {
      if (r2.error.code !== '23505') throw r2.error;
      const existing = await window.db.from('orders').select('id').eq('id', oid).maybeSingle();
      if (existing.error || !existing.data) throw r2.error;
    }
    const deliv = { method: F.dlv, urgent: F.urgent, date: F.date, slot: c.slot ? c.slot.slot_name : null, slot_time: c.slot ? `${c.slot.start_time || ''}-${c.slot.end_time || ''}` : null, delivery_fee: c.fee, urgent_fee: c.urg, slot_fee: c.slotFee };
    const r3 = await window.db.from('order_items').insert({ id: itemId, order_id: oid, product_id: p.id, category_id: p.category_id || null, product_name: p.name, quantity: F.qty, unit_price: base(p), line_total: c.items, production_days: days() || null,
      artwork_urls: F.files.filter(f => f.status === 'ok').map(f => f.url), artwork_notes: (F.mode === 'whatsapp' ? 'Artwork will be sent via WhatsApp. ' : '') + note || null,
      selected_options: { product_category: p.categories?.name || null, selections: c.sel, delivery: deliv, artwork_method: F.mode } });
    if (r3.error) {
      if (r3.error.code !== '23505') throw r3.error;
      const existingItem = await window.db.from('order_items').select('id').eq('id', itemId).eq('order_id', oid).maybeSingle();
      if (existingItem.error || !existingItem.data) throw r3.error;
    }
    /* Initial 'pending' history row is created by the database trigger (see database/order-initial-status.sql). */
    let row = null; try { row = (await window.db.from('orders').select('*').eq('id', oid).maybeSingle()).data; } catch (_) {}
    S.done = { id: oid, order_number: row?.order_number || null, created_at: row?.created_at || new Date().toISOString(), total_amount: c.total, status: 'pending', delivery_option: F.dlv, delivery_date: F.date, payment_method: F.pm, payment_status: 'pending', delivery_fee: c.fee, estimated_ready_date: F.date || addDays(days() || 0), delivery_address: cust.address, customer_phone: cust.phone,
      customer: cust, order_items: [{ product_name: p.name, quantity: F.qty, unit_price: base(p), line_total: c.items, production_days: days(), artwork_urls: F.files.map(f => f.url), selected_options: { selections: c.sel, delivery: deliv } }] };
    S.orders = null; F = null; location.hash = '#/pay/' + oid;
  } catch (e) { F.placing = false; F.err = /orders_payment_method_check/.test(e.message || '') ? `The payment method "${F.pm}" is not allowed by the database. Run the payment_method diagnostic in database/payment-flow-hardening.sql and align the constraint.` : 'Order could not be placed: ' + (e.message || e); flow(); window.scrollTo(0, 0); }
}

/* ---------- orders / account / invoice ---------- */
const mainName = o => { const it = o.order_items || []; return it.length ? it[0].product_name + (it.length > 1 ? ` +${it.length - 1} more` : '') : 'Order'; };
function paymentWidget(o) {
  const P = window.JPFPayment; if (!P) return '';
  const method = o.payment_method || 'pending', status = o.payment_status || 'pending', refValue = (o.payment_reference || '').trim();
  const receiptLink = o.payment_receipt_url ? `<button type="button" class="btn small" data-a="receipt-view" data-id="${esc(o.id)}">View receipt</button>` : '';
  const open = PAY_OPEN.includes(status);
  let act = '';
  if (open) act = (method === 'payhere' && S.bankFor !== o.id) ? payhereBtn(o) : bankForm(o);
  else if (status === 'receipt_submitted' || status === 'under_review') act = '<p class="m">We received your payment details. Our team will verify them and update your order.</p>';
  return `<h2>Payment</h2><div class="card"><div class="ln"><span>Method</span><span>${esc(P.labelMethod(method))}</span></div><div class="ln"><span>Status</span><span class="badge ${P.badgeClass(status)}">${esc(P.labelStatus(status))}</span></div>${refValue ? `<div class="ln"><span>Reference</span><span>${esc(refValue)}</span></div>` : ''}${receiptLink ? `<div class="ln"><span>Receipt</span><span>${receiptLink}</span></div>` : ''}${status === 'rejected' ? '<p class="m">Your payment could not be verified. Please check the details and submit again, or contact us.</p>' : ''}${act}</div>`;
}
function loginPrompt(t) { shell(`<div class="empty"><p>${t}</p><a class="btn full" href="customer-login.html">Log in / Register</a></div>`); }
async function orders() {
  if (!S.profile) return loginPrompt('Log in to see your orders.');
  shell('<div class="sk"></div><div class="sk"></div>');
  if (!S.orders) try { S.orders = await window.JPFCustomerAuth.loadOrderHistory(); } catch (e) { return shell(`<div class="err">${esc(e.message)}</div>`); }
  const dn = o => ['completed', 'cancelled', 'delivered'].includes(o.status), l = S.orders.filter(o => (S.tab === 'active') === !dn(o));
  shell(`<h1>Orders</h1><div class="chips"><button class="chip ${S.tab === 'active' ? 'on' : ''}" data-a="tab" data-id="active">Active</button><button class="chip ${S.tab === 'past' ? 'on' : ''}" data-a="tab" data-id="past">Past</button></div>
  ${l.map(o => `<a class="card" style="display:block;text-decoration:none;color:inherit" href="#/orders/${o.id}"><div class="ln"><b>${esc(ref(o))}</b><span class="badge ${esc(o.status)}">${esc(o.status)}</span></div><div>${esc(mainName(o))}</div><div class="ln"><span>${fdate(o.created_at)}</span><b>${money(o.total_amount)}</b></div></a>`).join('') || '<div class="empty">No orders here.</div>'}`);
}
async function orderDetail(id, o) {
  o = o || (S.orders || []).find(x => x.id === id);
  if (!o && S.profile) { S.orders = await window.JPFCustomerAuth.loadOrderHistory(); o = S.orders.find(x => x.id === id); }
  if (!o) return shell('<div class="empty">Order not found.</div>', { back: 1, title: 'Order' });
  const h = await window.db.from('order_status_history').select('*').eq('order_id', o.id).then(r => r.data || [], () => []);
  const idx = STATUSES.indexOf(o.status), sel = i => i.selected_options || {}, dl = { ...(sel((o.order_items || [])[0] || {}).delivery || {}) }, sl = S.slots.find(x => x.id === o.delivery_slot_id); if (sl) dl.slot = sl.slot_name;
  shell(`<div class="ln"><h1>${esc(ref(o))}</h1><span class="badge ${esc(o.status)}">${esc(o.status)}</span></div><p class="m">${fdate(o.created_at)}</p>
  ${o.status === 'cancelled' ? '' : `<h2>Status</h2><div class="card"><ul class="tl">${STATUSES.map((s, i) => `<li class="${i <= idx ? 'd' : ''}">${s[0].toUpperCase() + s.slice(1)}</li>`).join('')}</ul></div>`}
  <h2>Items</h2>${(o.order_items || []).map(i => `<div class="card"><div class="ln"><b>${esc(i.product_name)}</b><b>${money(i.line_total)}</b></div><p class="m">Qty ${i.quantity} × ${money(i.unit_price)}</p>${(sel(i).selections || []).map(s => `<div class="ln"><span>${esc(s.label)}</span><span>${esc(s.value)}</span></div>`).join('')}${(i.artwork_urls || []).map((u, n) => `<a href="${esc(u)}" target="_blank" rel="noopener">Artwork ${n + 1}</a> `).join('')}${i.artwork_notes ? `<p class="m">${esc(i.artwork_notes)}</p>` : ''}</div>`).join('')}
  <h2>Delivery & payment</h2><div class="card"><div class="ln"><span>${o.delivery_option === 'delivery' ? 'Delivery' : 'Pickup'}</span><span>${fdate(o.delivery_date)}${dl.slot ? ' · ' + esc(dl.slot) : ''}</span></div>${o.estimated_ready_date ? `<div class="ln"><span>Estimated ready</span><span>${fdate(o.estimated_ready_date)}</span></div>` : ''}${o.delivery_address ? `<div class="ln"><span>Address</span><span>${esc(o.delivery_address)}</span></div>` : ''}<div class="ln"><span>Payment</span><span>${esc(o.payment_status || o.payment_method || '—')}</span></div><div class="ln t"><span>Total</span><span>${money(o.total_amount)}</span></div></div>
  ${paymentWidget(o)}
  ${h.length ? `<h2>History</h2><div class="card">${h.map(x => `<div class="ln"><span>${esc(x.status)}</span><span>${fdate(x.created_at)}</span></div>`).join('')}</div>` : ''}
  <button class="btn full" data-a="inv" data-id="${o.id}">Download Invoice</button>${wa() ? `<a class="btn alt full" target="_blank" rel="noopener" href="${wa('Hi, about order ' + ref(o))}">WhatsApp</a>` : ''}`, { back: 1, title: 'Order' });
  S.cur = o;
}
function account() {
  const p = S.profile;
  if (!p) return loginPrompt('Log in to see your profile and orders.');
  const orderCount = Array.isArray(S.orders) ? S.orders.length : 0;
  shell(`<h1>My Account</h1>
  <div class="card">
    <div class="ln"><span>Name</span><b>${esc(p.name || 'Customer')}</b></div>
    <div class="ln"><span>Phone</span><b>${esc(p.phone || '—')}</b></div>
    <div class="ln"><span>Email</span><b>${esc(p.email || '—')}</b></div>
    <div class="ln"><span>NIC</span><b>${esc(p.nic || '—')}</b></div>
  </div>
  <div class="card">
    <div class="ln"><span>Orders</span><b>${orderCount}</b></div>
    <div class="ln"><span>Account status</span><b>${orderCount ? 'Active customer' : 'New customer'}</b></div>
  </div>
  <a class="btn full" href="#/orders">View Orders</a>
  <a class="btn alt full" href="#/shop">Continue Shopping</a>
  <button class="btn alt full" data-a="logout">Log out</button>`);
}
function done() {
  const o = S.done; if (!o) return (location.hash = '#/home');
  const d = o.order_items[0].selected_options.delivery;
  shell(`<div class="ok"><div class="tick">✓</div><h1>Order Received</h1><p class="m">${esc(ref(o))}</p></div><div class="card">
  <div class="ln"><span>Status</span><span class="badge pending">pending</span></div>${window.JPFPayment ? `<div class="ln"><span>Payment</span><span class="badge ${window.JPFPayment.badgeClass(o.payment_status || 'pending')}">${esc(window.JPFPayment.labelStatus(o.payment_status || 'pending'))}</span></div>` : ''}<div class="ln"><span>Estimated ready</span><span>${fdate(o.estimated_ready_date)}</span></div><div class="ln"><span>${o.delivery_option === 'delivery' ? 'Delivery' : 'Pickup'}</span><span>${fdate(o.delivery_date)}${d.slot ? ' · ' + esc(d.slot) : ''}</span></div><div class="ln t"><span>Total</span><span>${money(o.total_amount)}</span></div></div>
  ${PAY_OPEN.includes(o.payment_status || 'pending') ? `<a class="btn full" href="#/pay/${o.id}">Complete Payment</a>` : ''}<button class="btn alt full" data-a="inv" data-id="done">Download Invoice</button>${S.profile ? `<a class="btn alt full" href="#/orders/${o.id}">View Order</a>` : ''}
  ${wa() ? `<a class="btn alt full" target="_blank" rel="noopener" href="${wa(`New order ${ref(o)}: ${o.order_items[0].product_name} ×${o.order_items[0].quantity}, total ${money(o.total_amount)}`)}">WhatsApp Order</a>` : ''}<a class="btn alt full" href="#/home">Back Home</a>`);
}
function invoice(o) {
  const c = S.contact || {}, cu = o.customer || {}, it = o.order_items || [], dl = { ...((it[0]?.selected_options || {}).delivery || {}) }, sub = it.reduce((s, i) => s + Number(i.line_total || 0), 0);
  if (o.delivery_fee != null) dl.delivery_fee = o.delivery_fee;
  const sl = S.slots.find(x => x.id === o.delivery_slot_id); if (sl) dl.slot = sl.slot_name;
  const w = window.open('', '_blank'); if (!w) return alert('Please allow pop-ups to download the invoice.');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Invoice ${esc(ref(o))}</title><style>body{font:14px system-ui;max-width:720px;margin:24px auto;padding:0 16px;color:#222}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}h1{margin:0}small{color:#666}</style>
  <h1>Janu Print | FAB</h1><small>${esc(c.address || '')} ${esc(c.phone || '')} ${esc(c.email || '')}</small><h2>Invoice</h2>
  <p>Invoice no: <b>INV-${esc(ref(o))}</b><br>Order: ${esc(ref(o))}<br>Date: ${fdate(o.created_at)}<br>Status: ${esc(o.status)}<br>Payment: ${esc(o.payment_status || o.payment_method || '—')}</p>
  <p><b>Bill to</b><br>${esc(cu.name || '')}<br>${esc(cu.phone || '')} ${esc(cu.email || '')}<br>${esc(cu.address || '')}</p>
  <table><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Total</th></tr>${it.map(i => `<tr><td>${esc(i.product_name)}<br><small>${((i.selected_options || {}).selections || []).map(s => esc(s.label + ': ' + s.value)).join(', ')}</small></td><td class="r">${i.quantity}</td><td class="r">${money(i.unit_price)}</td><td class="r">${money(i.line_total)}</td></tr>`).join('')}
  <tr><td colspan="3" class="r">Subtotal</td><td class="r">${money(sub)}</td></tr>${dl.delivery_fee ? `<tr><td colspan="3" class="r">Delivery</td><td class="r">${money(dl.delivery_fee)}</td></tr>` : ''}${dl.urgent_fee ? `<tr><td colspan="3" class="r">Urgent</td><td class="r">${money(dl.urgent_fee)}</td></tr>` : ''}${dl.slot_fee ? `<tr><td colspan="3" class="r">Time slot</td><td class="r">${money(dl.slot_fee)}</td></tr>` : ''}
  <tr><th colspan="3" class="r">Grand total</th><th class="r">${money(o.total_amount)}</th></tr></table><p>${o.delivery_option === 'delivery' ? 'Delivery' : 'Pickup'}: ${fdate(o.delivery_date)} ${esc(dl.slot || '')}<br>Estimated ready: ${fdate(o.estimated_ready_date)}${o.delivery_address ? '<br>Address: ' + esc(o.delivery_address) : ''}</p><script>onload=()=>print()<\/script>`);
  w.document.close();
}

/* ---------- events & router ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = b.dataset.id;
  if (a === 'back') return history.length > 1 ? history.back() : (location.hash = '#/home');
  if (a === 'cat') { S.cat = id; return shop(); }
  if (a === 'tab') { S.tab = id; return orders(); }
  if (a === 'logout') { await window.JPFCustomerAuth.logout(); S.profile = null; S.orders = null; return route(); }
  if (a === 'payment-submit') {
    b.disabled = true;
    const msg = await submitBankPayment(id);
    if (msg) { payErr(msg); b.disabled = false; return; }
    S.orders = null; if (S.done && S.done.id === id) { S.done.payment_method = 'bank_transfer'; S.done.payment_status = 'receipt_submitted'; }
    return route();
  }
  if (a === 'payhere-go') {
    b.disabled = true;
    try { await startPayHere(id); } catch (err) { payErr(errMsg(err)); b.disabled = false; }
    return;
  }
  if (a === 'use-bank') { S.bankFor = id; return route(); }
  if (a === 'receipt-view') {
    try {
      const order = (S.orders || []).find(x => x.id === id) || S.cur;
      if (!order || !order.payment_receipt_url) throw new Error('No receipt is available for this order.');
      await window.JPFPayment.openReceipt(window.db, order.payment_receipt_url);
    } catch (err) {
      alert(err.message || 'The receipt could not be opened securely.');
    }
    return;
  }
  if (a === 'inv') return invoice(id === 'done' ? S.done : S.cur);
  if (!F) return;
  const [fid, oid] = (id || '').split('|');
  if (a === 'pick') F.sel[fid] = F.sel[fid] === oid ? '' : oid;
  else if (a === 'tog') F.sel[fid] = !F.sel[fid];
  else if (a === 'preset') { const o = (S.opts[fid] || []).find(x => x.id === oid); F.sel[fid] = { w: o.preset_width || '', h: o.preset_height || '', u: o.preset_unit || 'cm', preset: oid }; }
  else if (a === 'qm' || a === 'qp') F.qty = Math.max(Number(F.p.min_quantity || 1), F.qty + (a === 'qp' ? 1 : -1));
  else if (a === 'mode') F.mode = id;
  else if (a === 'rm') { const f = F.files.splice(+id, 1)[0]; if (f?.path) window.db.storage.from('artwork').remove([f.path]); }
  else if (a === 'dlv') F.dlv = id;
  else if (a === 'urg') { F.urgent = id === '1'; F.date = ''; }
  else if (a === 'slot') F.slot = F.slot === id ? '' : id;
  else if (a === 'pm') F.pm = id;
  else if (a === 'next') { F.err = validate(); if (!F.err) { if (F.step === STEP.length - 1) return place(); F.step++; } }
  else return;
  if (a !== 'next' || true) flow();
  if (a === 'next') window.scrollTo(0, 0);
});
document.addEventListener('input', e => {
  const t = e.target; if (!F) return;
  if (t.id === 'qty') F.qty = Math.max(1, Number(t.value) || 1);
  else if (t.id === 'notes') F.notes = t.value;
  else if (t.id === 'date') F.date = t.value;
  else if (t.dataset.c) F.cust[t.dataset.c] = t.value;
  else if (t.dataset.in) { const f = flds().find(x => x.id === t.dataset.in); if (f.field_type === 'dimension') { const d = F.sel[f.id] = F.sel[f.id] || { w: '', h: '', u: 'cm' }; d[t.dataset.k] = t.value; d.preset = ''; } else F.sel[f.id] = t.value; }
  else return;
  bar();
});
document.addEventListener('change', e => { if (e.target.id === 'file' && F) upload([...e.target.files]); });
window.addEventListener('hashchange', route);

async function route() {
  if (!S.ready) return;
  const [, r, id] = (location.hash || '#/home').split('/');
  if (r !== 'order') F = r === 'done' ? null : F;
  if (r === 'shop') shop(id);
  else if (r === 'order') (F && F.p.id === id) ? flow() : startFlow(id);
  else if (r === 'orders') id ? orderDetail(id) : orders();
  else if (r === 'account') account();
  else if (r === 'done') done();
  else if (r === 'pay') payView(id);
  else if (r === 'pay-return') payReturn(id);
  else if (r === 'pay-cancel') { S.payMsg = 'Card payment was cancelled. No payment was taken. You can try again or use bank transfer.'; payView(id); }
  else if (r === 'refund-policy') shell(window.JPFPolicies ? window.JPFPolicies.refund(S.contact) : '<div class="empty">Refund policy not available.</div>', { back: 1, title: 'Refund Policy' });
  else if (r === 'privacy-policy') shell(window.JPFPolicies ? window.JPFPolicies.privacy(S.contact) : '<div class="empty">Privacy policy not available.</div>', { back: 1, title: 'Privacy Policy' });
  else if (r === 'terms') shell(window.JPFPolicies ? window.JPFPolicies.terms(S.contact) : '<div class="empty">Terms not available.</div>', { back: 1, title: 'Terms' });
  else home();
}
async function boot() {
  shell('<div class="sk"></div><div class="sk"></div><div class="sk"></div>');
  if (!location.hash) location.hash = '#/' + (window.JP_START || 'home');
  try { await load(); } catch (e) { return shell(`<div class="err">Could not load data: ${esc(e.message)}</div><button class="btn full" onclick="location.reload()">Retry</button>`); }
  route();
}
boot();
