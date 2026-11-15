/* Janu Print | FAB - logo from Supabase (never hard-coded).
   Looks for, in this order:
     1. a column containing "logo" in contact_details, then in homepage_settings
     2. a file called logo.* in the public Storage bucket "branding"
   Result is cached for the browser session. Returns '' when nothing is found. */
window.JPFBranding = (() => {
  const KEY = 'jpf_logo_url';
  const BUCKET = 'branding';

  const pickLogo = row => {
    if (!row) return '';
    for (const k of Object.keys(row)) {
      if (/logo/i.test(k) && typeof row[k] === 'string' && row[k].trim()) return row[k].trim();
    }
    return '';
  };
  const toUrl = (db, v) => /^https?:\/\//i.test(v) ? v : db.storage.from(BUCKET).getPublicUrl(v.replace(/^\/+/, '')).data.publicUrl;
  const cached = () => { try { return sessionStorage.getItem(KEY) || ''; } catch (_) { return ''; } };
  const remember = u => { try { if (u) sessionStorage.setItem(KEY, u); } catch (_) {} };

  async function resolve(db, contact, settings) {
    let v = pickLogo(contact) || pickLogo(settings);
    if (!v && settings === undefined) {
      try { const r = await db.from('homepage_settings').select('*').limit(1).maybeSingle(); v = pickLogo(r.data); } catch (_) {}
    }
    if (v) { const u = toUrl(db, v); remember(u); return u; }
    try {
      const { data } = await db.storage.from(BUCKET).list('', { limit: 50, search: 'logo' });
      const f = (data || []).find(x => /^logo\./i.test(x.name));
      if (f) { const u = db.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl; remember(u); return u; }
    } catch (_) {}
    return cached();
  }

  return { resolve, cached };
})();
