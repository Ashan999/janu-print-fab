/**
 * Janu Print | FAB — Customer Auth (Google + Phone/NIC)
 */
const JPFCustomerAuth = (() => {
    const SESSION_KEY = 'jpf_customer_profile';

    /**
     * One canonical phone format (E.164, e.g. +94771234567) so the same person always gets the same
     * login whether they type 0771234567, 077 123 4567 or +94 77 123 4567.
     *  +... / 00...   -> kept as typed (country code included)
     *  05xxxxxxxx      -> UAE  (+971)       9-digit 5xxxxxxxx -> UAE
     *  0xxxxxxxxx      -> Sri Lanka (+94)   9-digit 7xxxxxxxx -> Sri Lanka
     */
    function normalizePhone(value) {
        const s = String(value || '').trim().replace(/[\s().-]/g, '');
        if (!s) return '';
        if (s.startsWith('+')) return '+' + s.slice(1).replace(/\D/g, '');
        if (s.startsWith('00')) return '+' + s.slice(2).replace(/\D/g, '');
        const d = s.replace(/\D/g, '');
        if (/^0[1-9]\d{8}$/.test(d)) return (d[1] === '5' ? '+971' : '+94') + d.slice(1);
        if (/^5\d{8}$/.test(d)) return '+971' + d;
        if (/^[1-9]\d{8}$/.test(d)) return '+94' + d;
        return '+' + d;
    }

    function isValidPhone(value) {
        const n = normalizePhone(value);
        return /^\+[1-9]\d{9,14}$/.test(n);
    }

    function phoneEmail(phone) {
        const digits = normalizePhone(phone).replace(/\D/g, '');
        return `c_${digits}@januprintfab.customer`;
    }

    /* Accounts created before normalisation used whatever digits the customer typed. */
    function phoneEmailCandidates(phone) {
        const list = [phoneEmail(phone)];
        const typed = `c_${String(phone || '').replace(/\D/g, '')}@januprintfab.customer`;
        if (!list.includes(typed)) list.push(typed);
        return list;
    }

    function friendlyAuthError(err) {
        const m = String((err && err.message) || err || '');
        if (/invalid login credentials/i.test(m)) return 'Phone number or password is incorrect.';
        if (/already registered|already been registered|user already exists/i.test(m)) return 'This phone number already has an account. Please log in instead.';
        if (/email not confirmed/i.test(m)) return 'Your account needs confirmation before you can log in. Please contact us.';
        if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a minute and try again.';
        return m || 'Something went wrong. Please try again.';
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async function isAdminUser(userId) {
        const { data } = await window.db.from('admin_profiles').select('id').eq('id', userId).maybeSingle();
        return !!data;
    }

    async function syncCustomerRecord(user) {
        const meta = user.user_metadata || {};
        const seed = {
            id: user.id,
            name: meta.full_name || meta.name || user.email?.split('@')[0] || 'Customer',
            phone: meta.phone || '',
            email: user.email?.includes('@januprintfab.customer') ? (meta.contact_email || null) : user.email,
            country: meta.country || null
        };
        if (meta.nic) seed.nic = meta.nic;

        const { data: existing, error: readError } = await window.db
            .from('customers').select('*').eq('id', user.id).maybeSingle();
        if (readError) throw readError;
        let row = existing;
        if (!row) {
            let result = await window.db.from('customers').upsert(seed, { onConflict: 'id' }).select('*').single();
            if (result.error && /nic/i.test(result.error.message || '')) {
                delete seed.nic;
                result = await window.db.from('customers').upsert(seed, { onConflict: 'id' }).select('*').single();
            }
            if (result.error) throw result.error;
            row = result.data;
        }
        const profile = { ...row, userId: user.id };
        localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
        return profile;
    }

    async function saveProfile({ name, phone }) {
        const session = await getSession();
        if (!session?.user?.id) throw new Error('Please sign in again to update your profile.');
        const payload = { name: String(name || '').trim(), phone: String(phone || '').trim() };
        if (!payload.name) throw new Error('Enter your name.');
        if (payload.phone && !/^\+?[0-9 ()-]{7,20}$/.test(payload.phone)) throw new Error('Enter a valid phone number.');
        const { data, error } = await window.db.from('customers').update(payload)
            .eq('id', session.user.id).select('*').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Your profile could not be updated. Check the customers table update policy for authenticated users.');
        const profile = { ...data, userId: session.user.id };
        localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
        return profile;
    }

    async function getSession() {
        const { data: { session }, error } = await window.db.auth.getSession();
        if (error) throw error;
        return session;
    }

    async function getProfile() {
        const session = await getSession();
        if (!session) {
            // No active session means not logged in - never trust the cached copy.
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
        if (await isAdminUser(session.user.id)) return null;
        return syncCustomerRecord(session.user);
    }

    async function signInWithGoogle() {
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        const { error } = await window.db.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo }
        });
        if (error) throw error;
    }

    async function registerWithPhone({ name, phone, nic, password }) {
        const normalized = normalizePhone(phone);
        if (!isValidPhone(normalized)) throw new Error('Enter a valid phone number with the country code.');
        const email = phoneEmail(normalized);
        const { data, error } = await window.db.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name,
                    full_name: name,
                    phone: normalized,
                    nic,
                    account_type: 'customer',
                    contact_email: null
                }
            }
        });
        if (error) throw new Error(friendlyAuthError(error));

        // With "Confirm email" enabled Supabase hides duplicates by returning a user without identities.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            throw new Error('This phone number already has an account. Please log in instead.');
        }

        // No session after sign-up = e-mail confirmation is switched on. Phone accounts use a placeholder
        // address that can never receive mail, so try to sign in; if Supabase still refuses, explain why.
        let session = data.session;
        if (!session) {
            const login = await window.db.auth.signInWithPassword({ email, password });
            if (login.error) {
                throw new Error('Your account was created, but it cannot be used yet because e-mail confirmation is enabled. Ask the site owner to turn off "Confirm email" in Supabase (Authentication > Providers > Email).');
            }
            session = login.data.session;
        }

        const user = (session && session.user) || data.user;
        if (user) await syncCustomerRecord(user);
        return data;
    }

    async function loginWithPhone({ phone, password }) {
        let data = null, lastError = null;
        for (const email of phoneEmailCandidates(phone)) {
            const res = await window.db.auth.signInWithPassword({ email, password });
            if (!res.error) { data = res.data; lastError = null; break; }
            lastError = res.error;
            if (!/invalid login credentials/i.test(res.error.message || '')) break;
        }
        if (lastError || !data) throw new Error(friendlyAuthError(lastError));

        if (await isAdminUser(data.user.id)) {
            await window.db.auth.signOut();
            throw new Error('This account is for admin use. Please use the admin login page.');
        }

        await syncCustomerRecord(data.user);
        return data;
    }

    async function handleOAuthCallback() {
        const { data: { session } } = await window.db.auth.getSession();
        if (!session) return null;
        if (await isAdminUser(session.user.id)) {
            await window.db.auth.signOut();
            throw new Error('Admin accounts must use the admin login page.');
        }
        return syncCustomerRecord(session.user);
    }

    async function loadOrderHistory() {
        const profile = await getProfile();
        if (!profile) return [];

        const { data: byId } = await window.db
            .from('orders')
            .select('*, order_items(*)')
            .eq('customer_id', profile.userId || profile.id)
            .order('created_at', { ascending: false });

        return byId || [];
    }

    async function logout() {
        await window.db.auth.signOut();
        localStorage.removeItem(SESSION_KEY);
    }

    return {
        normalizePhone,
        isValidPhone,
        friendlyAuthError,
        phoneEmail,
        escapeHtml,
        getSession,
        getProfile,
        signInWithGoogle,
        registerWithPhone,
        loginWithPhone,
        handleOAuthCallback,
        syncCustomerRecord,
        saveProfile,
        loadOrderHistory,
        logout
    };
})();

window.JPFCustomerAuth = JPFCustomerAuth;
