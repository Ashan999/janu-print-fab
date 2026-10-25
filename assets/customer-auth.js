/**
 * Janu Print | FAB — Customer Auth (Google + Phone/NIC)
 */
const JPFCustomerAuth = (() => {
    const SESSION_KEY = 'jpf_customer_profile';

    function phoneEmail(phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        return `c_${digits}@januprintfab.customer`;
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
            const cached = localStorage.getItem(SESSION_KEY);
            return cached ? JSON.parse(cached) : null;
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
        const email = phoneEmail(phone);
        const { data, error } = await window.db.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name,
                    full_name: name,
                    phone,
                    nic,
                    account_type: 'customer',
                    contact_email: null
                }
            }
        });
        if (error) throw error;

        if (data.user) {
            await syncCustomerRecord(data.user);
        }
        return data;
    }

    async function loginWithPhone({ phone, password }) {
        const email = phoneEmail(phone);
        const { data, error } = await window.db.auth.signInWithPassword({ email, password });
        if (error) throw error;

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
