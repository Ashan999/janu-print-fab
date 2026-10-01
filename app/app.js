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
const img = p => p.featured_image || (Array.isArray(p.images) && p.images[0]) || '';
const base = p => Number(p.price_per_unit || p.price || 0);

async function load() {
  const db = window.db;
  const [c, p, f, o, d, s, ct, pr] = await Promise.all([
    db.from('categories').select('*').eq('is_visible', true).order('display_order'),
    db.from('products').select('*, categories(id, name)').eq('is_visible', true).order('display_order'),
    db.from('product_fields').select('*').eq('is_enabled', true).order('display_order'),
    db.from('product_field_options').select('*').order('display_order'),
    db.from('delivery_settings').select('*'),
    db.from('delivery_slots').select('*').eq('is_active', true).order('display_order'),
    db.from('contact_details').select('*').eq('id', 'main').maybeSingle(),
    window.JPFCustomerAuth.getProfile().catch(() => null)
  ]);
  const bad = c.error || p.error || f.error || o.error;
  if (bad) throw bad;
  S.cats = c.data || []; S.prods = p.data || [];
  S.fields = grp(f.data || [], 'product_id'); S.opts = grp(o.data || [], 'product_field_id');
  S.dset = Object.fromEntries((d.data || []).map(x => [x.category_id, x]));
  S.slots = s.data || []; S.contact = ct.data || null; S.profile = pr; S.ready = true;
}

/* ---------- shell ---------- */
function shell(body, { flow = false, title = '', back = '' } = {}) {
  const on = h => (location.hash || '').startsWith('#/' + h) ? 'on' : '';
  $('#app').innerHTML = `<header class="top">${flow || back ? `<button class="ib" data-a="back" aria-label="Back">←</button><b>${esc(title)}</b>` :
    `<img src="${LOGO}" alt=""><b>Janu Print <span>| FAB</span></b>`}<span class="sp"></span>${flow ? '' : `<a class="ib" href="#/account" aria-label="Account">👤</a>`}</header>
  <main class="${flow ? 'flow' : ''}">${body}</main>
  ${flow ? '' : `<nav class="nav"><a href="#/home" class="${on('home')}"><i>🏠</i>Home</a><a href="#/shop" class="${on('shop')}"><i>🛍️</i>Shop</a><a href="#/orders" class="${on('orders')}"><i>📦</i>Orders</a><a href="#/account" class="${on('account')}"><i>👤</i>Account</a></nav>`}`;
  window.scrollTo(0, 0);
}
const prodCard = p => `<a class="pc" href="#/order/${p.id}"><div class="im" style="${img(p) ? `background-image:url('${esc(img(p))}')` : ''}">${img(p) ? '' : '🖨️'}</div><b>${esc(p.name)}</b><span>${base(p) ? 'From ' + money(base(p)) : 'Get a quote'}</span></a>`;
const catCard = c => `<a class="cat" href="#/shop/${c.id}" style="text-decoration:none;color:inherit"><div class="im" style="${c.image_url ? `background-image:url('${esc(c.image_url)}')` : ''}">${c.image_url ? '' : '🖨️'}</div>${esc(c.name)}</a>`;
const wa = txt => S.contact?.whatsapp ? `https://wa.me/${String(S.contact.whatsapp).replace(/\D/g, '')}${txt ? '?text=' + encodeURIComponent(txt) : ''}` : '';

/* ---------- screens ---------- */
function home() {
  const c = S.contact || {};
  shell(`<h1>Print something great.</h1><p class="m">Pick a product, choose options, see the price, and order.</p>
  <a class="btn full" href="#/shop">Start an Order</a>
  <h2>What do you need?</h2><div class="row">${S.cats.map(catCard).join('') || '<p class="m">No categories yet.</p>'}</div>
  <h2>Products</h2><div class="row">${S.prods.slice(0, 8).map(prodCard).join('') || '<p class="m">No products yet.</p>'}</div>
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

/* ---------- order flow ---------- */
const STEP = ['Options', 'Artwork', 'Delivery', 'Details', 'Review'];
function startFlow(id) {
  const p = S.prods.find(x => x.id === id);
  if (!p) return (location.hash = '#/shop');
  const pf = S.profile || {};
  F = { p, id: crypto.randomUUID(), step: 0, qty: Math.max(Number(p.min_quantity || 1), 1), sel: {}, files: [], mode: 'upload', notes: '', dlv: 'pickup', urgent: false, slot: '', date: '', err: '', placing: false, busy: 0,
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
    if (t === 'select' || t === 'radio') { const o = os.find(x => x.id === v); if (o) out.push({ label: f.field_label, value: o.label, price: Number(o.price_modifier || 0) }); }
    else if (t === 'toggle' || t === 'checkbox') out.push({ label: f.field_label, value: 'Yes', price: Number(f.price_modifier || 0) });
    else if (t === 'dimension') { if (v.w && v.h) { const a = sqm(v.w, v.h, v.u); out.push({ label: f.field_label, value: `${v.w} x ${v.h} ${v.u}`, price: a * Number(f.price_modifier || 0), meta: a.toFixed(3) + ' sqm' }); } }
    else if (t === 'number') out.push({ label: f.field_label, value: v, price: Number(v) * Number(f.price_modifier || 0) });
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
  const c = calc(), last = F.step === 4;
  shell(`<div class="steps">${STEP.map((_, i) => `<i class="${i <= F.step ? 'on' : ''}"></i>`).join('')}</div><p class="m">Step ${F.step + 1} of 5 · ${STEP[F.step]}</p>
  ${F.err ? `<div class="err">${esc(F.err)}</div>` : ''}<div id="stepbody">${[stOptions, stArt, stDelivery, stDetails, stReview][F.step](c)}</div>
  <div class="bar"><div><small>${last ? 'Total' : 'Estimated total'}</small><strong id="tot">${money(c.total)}</strong></div><span class="sp"></span>
  <button class="btn" id="next" data-a="next" ${F.placing || F.busy ? 'disabled' : ''}>${last ? (F.placing ? 'Processing Order…' : 'Place Order') : 'Continue'}</button></div>`, { flow: true, title: F.p.name });
}
const bar = () => { const c = calc(); const t = $('#tot'); if (t) t.textContent = money(c.total); };
const opt = (on, a, id, label, sub = '') => `<button class="opt ${on ? 'on' : ''}" data-a="${a}" data-id="${id}">${esc(label)}${sub ? ` <small>${sub}</small>` : ''}</button>`;

function stOptions() {
  const p = F.p, min = Number(p.min_quantity || 1);
  const fl = flds().map(f => {
    const os = S.opts[f.id] || [], v = F.sel[f.id], t = f.field_type, req = f.is_required ? ' *' : '';
    let h = '';
    if (t === 'select' || t === 'radio') h = `<div class="opts">${os.map(o => opt(v === o.id, 'pick', f.id + '|' + o.id, o.label, Number(o.price_modifier) ? '+' + money(o.price_modifier) : '')).join('')}</div>`;
    else if (t === 'toggle' || t === 'checkbox') h = `<div class="opts">${opt(!!v, 'tog', f.id, 'Yes', Number(f.price_modifier) ? '+' + money(f.price_modifier) : '')}</div>`;
    else if (t === 'dimension') { const d = v || { w: '', h: '', u: 'cm' };
      h = `${os.length ? `<div class="opts" style="margin-bottom:8px">${os.map(o => opt(d.preset === o.id, 'preset', f.id + '|' + o.id, o.label, o.preset_width ? `${o.preset_width}×${o.preset_height} ${o.preset_unit || 'cm'}` : '')).join('')}</div>` : ''}
      <div class="dim"><input type="number" min="0" step="0.01" placeholder="Width" data-in="${f.id}" data-k="w" value="${esc(d.w)}"><input type="number" min="0" step="0.01" placeholder="Height" data-in="${f.id}" data-k="h" value="${esc(d.h)}">
      <select data-in="${f.id}" data-k="u">${['cm', 'mm', 'inch', 'ft'].map(u => `<option ${d.u === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>`; }
    else if (t === 'text') h = `<textarea data-in="${f.id}" data-k="">${esc(v || '')}</textarea>`;
    else h = `<input type="${t === 'date' ? 'date' : 'number'}" data-in="${f.id}" data-k="" value="${esc(v || '')}">`;
    return `<label class="l">${esc(f.field_label)}${req}</label>${h}`;
  }).join('');
  return `<div class="card">${p.description ? `<p class="m" style="margin-bottom:8px">${esc(p.description)}</p>` : ''}${fl}
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
function stReview(c) {
  const p = F.p, ok = '<span style="color:var(--ok)">✓</span>';
  return `<div class="card"><b>${esc(p.name)}</b>${c.sel.map(s => `<div class="ln"><span>${esc(s.label)}</span><span>${esc(s.value)}</span></div>`).join('')}<div class="ln"><span>Quantity</span><span>${F.qty}</span></div></div>
  <div class="card"><div class="ln"><span>Artwork</span><span>${F.mode === 'upload' ? (F.files.length ? ok + ' ' + F.files.length + ' file(s)' : 'None') : 'Via WhatsApp'}</span></div>
  <div class="ln"><span>${F.dlv === 'delivery' ? 'Delivery' : 'Pickup'}</span><span>${fdate(F.date)}${c.slot ? ' · ' + esc(c.slot.slot_name) : ''}</span></div><div class="ln"><span>Customer</span><span>${esc(F.cust.name)} · ${esc(F.cust.phone)}</span></div></div>
  <div class="card"><div class="ln"><span>Subtotal</span><span>${money(c.items)}</span></div>${c.fee ? `<div class="ln"><span>Delivery</span><span>${money(c.fee)}</span></div>` : ''}${c.urg ? `<div class="ln"><span>Urgent charge</span><span>${money(c.urg)}</span></div>` : ''}${c.slotFee ? `<div class="ln"><span>Time slot</span><span>${money(c.slotFee)}</span></div>` : ''}<div class="ln t"><span>Total</span><span>${money(c.total)}</span></div>
  <p class="m">Payment details are shared after your order is received.</p></div>`;
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
  const c = calc(), p = F.p, cu = F.cust, oid = F.id, itemId = crypto.randomUUID();
  try {
    const cid = S.profile ? (S.profile.userId || S.profile.id) : (F.cid = F.cid || crypto.randomUUID());
    const cust = { id: cid, name: cu.name.trim(), phone: cu.phone.trim(), whatsapp: cu.whatsapp.trim() || null, email: cu.email.trim() || null, address: cu.address.trim() || null };
    const r1 = S.profile ? await window.db.from('customers').upsert(cust, { onConflict: 'id' }) : await window.db.from('customers').insert(cust);
    if (r1.error && r1.error.code !== '23505') throw r1.error;
    const note = F.notes.trim();
    const r2 = await window.db.from('orders').insert({ id: oid, customer_id: cid, status: 'pending', total_amount: c.total, payment_method: 'pending', delivery_option: F.dlv, delivery_date: F.date || null, notes: note || null, special_instructions: note || null,
      delivery_slot_id: c.slot ? c.slot.id : null, delivery_fee: c.fee, urgent_order: !!(F.urgent && dset()?.urgent_available), production_days: days() || null, estimated_ready_date: F.date || addDays(days() || 0),
      delivery_address: F.dlv === 'delivery' ? (cu.address.trim() || null) : null, customer_phone: cu.phone.trim() });
    if (r2.error && r2.error.code !== '23505') throw r2.error;
    const deliv = { method: F.dlv, urgent: F.urgent, date: F.date, slot: c.slot ? c.slot.slot_name : null, slot_time: c.slot ? `${c.slot.start_time || ''}-${c.slot.end_time || ''}` : null, delivery_fee: c.fee, urgent_fee: c.urg, slot_fee: c.slotFee };
    const r3 = await window.db.from('order_items').insert({ id: itemId, order_id: oid, product_id: p.id, category_id: p.category_id || null, product_name: p.name, quantity: F.qty, unit_price: base(p), line_total: c.items, production_days: days() || null,
      artwork_urls: F.files.filter(f => f.status === 'ok').map(f => f.url), artwork_notes: (F.mode === 'whatsapp' ? 'Artwork will be sent via WhatsApp. ' : '') + note || null,
      selected_options: { product_category: p.categories?.name || null, selections: c.sel, delivery: deliv, artwork_method: F.mode } });
    if (r3.error && r3.error.code !== '23505') throw r3.error;
    /* Initial 'pending' history row is created by the database trigger (see database/order-initial-status.sql). */
    let row = null; try { row = (await window.db.from('orders').select('*').eq('id', oid).maybeSingle()).data; } catch (_) {}
    S.done = { id: oid, order_number: row?.order_number || null, created_at: row?.created_at || new Date().toISOString(), total_amount: c.total, status: 'pending', delivery_option: F.dlv, delivery_date: F.date, payment_method: 'pending', delivery_fee: c.fee, estimated_ready_date: F.date || addDays(days() || 0), delivery_address: cust.address, customer_phone: cust.phone,
      customer: cust, order_items: [{ product_name: p.name, quantity: F.qty, unit_price: base(p), line_total: c.items, production_days: days(), artwork_urls: F.files.map(f => f.url), selected_options: { selections: c.sel, delivery: deliv } }] };
    S.orders = null; F = null; location.hash = '#/done';
  } catch (e) { F.placing = false; F.err = 'Order could not be placed: ' + (e.message || e); flow(); window.scrollTo(0, 0); }
}

/* ---------- orders / account / invoice ---------- */
const mainName = o => { const it = o.order_items || []; return it.length ? it[0].product_name + (it.length > 1 ? ` +${it.length - 1} more` : '') : 'Order'; };
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
  ${h.length ? `<h2>History</h2><div class="card">${h.map(x => `<div class="ln"><span>${esc(x.status)}</span><span>${fdate(x.created_at)}</span></div>`).join('')}</div>` : ''}
  <button class="btn full" data-a="inv" data-id="${o.id}">Download Invoice</button>${wa() ? `<a class="btn alt full" target="_blank" rel="noopener" href="${wa('Hi, about order ' + ref(o))}">WhatsApp</a>` : ''}`, { back: 1, title: 'Order' });
  S.cur = o;
}
function account() {
  const p = S.profile;
  if (!p) return loginPrompt('Log in to see your profile and orders.');
  shell(`<h1>Account</h1><div class="card"><div class="ln"><span>Name</span><b>${esc(p.name)}</b></div><div class="ln"><span>Phone</span><b>${esc(p.phone || '—')}</b></div><div class="ln"><span>Email</span><b>${esc(p.email || '—')}</b></div></div>
  <a class="btn full" href="#/orders">My Orders</a><button class="btn alt full" data-a="logout">Log out</button>`);
}
function done() {
  const o = S.done; if (!o) return (location.hash = '#/home');
  const d = o.order_items[0].selected_options.delivery;
  shell(`<div class="ok"><div class="tick">✓</div><h1>Order Received</h1><p class="m">${esc(ref(o))}</p></div><div class="card">
  <div class="ln"><span>Status</span><span class="badge pending">pending</span></div><div class="ln"><span>Estimated ready</span><span>${fdate(o.estimated_ready_date)}</span></div><div class="ln"><span>${o.delivery_option === 'delivery' ? 'Delivery' : 'Pickup'}</span><span>${fdate(o.delivery_date)}${d.slot ? ' · ' + esc(d.slot) : ''}</span></div><div class="ln t"><span>Total</span><span>${money(o.total_amount)}</span></div></div>
  <button class="btn full" data-a="inv" data-id="done">Download Invoice</button>${S.profile ? `<a class="btn alt full" href="#/orders/${o.id}">View Order</a>` : ''}
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
  else if (a === 'next') { F.err = validate(); if (!F.err) { if (F.step === 4) return place(); F.step++; } }
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
  else home();
}
async function boot() {
  shell('<div class="sk"></div><div class="sk"></div><div class="sk"></div>');
  if (!location.hash) location.hash = '#/' + (window.JP_START || 'home');
  try { await load(); } catch (e) { return shell(`<div class="err">Could not load data: ${esc(e.message)}</div><button class="btn full" onclick="location.reload()">Retry</button>`); }
  route();
}
boot();
