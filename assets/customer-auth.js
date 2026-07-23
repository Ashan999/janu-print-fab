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
        const profile = {
            id: user.id,
            name: meta.full_name || meta.name || user.email?.split('@')[0] || 'Customer',
            phone: meta.phone || '',
            email: user.email?.includes('@januprintfab.customer') ? (meta.contact_email || null) : user.email,
            country: meta.country || null
        };

        const payload = { ...profile };
        if (meta.nic) payload.nic = meta.nic;

        const { error } = await window.db.from('customers').upsert(payload, { onConflict: 'id' });
        if (error && error.message.includes('nic')) {
            delete payload.nic;
            await window.db.from('customers').upsert(payload, { onConflict: 'id' });
        }

        localStorage.setItem(SESSION_KEY, JSON.stringify({ ...profile, nic: meta.nic || '', userId: user.id }));
        return profile;
    }

    async function getSession() {
        const { data: { session } } = await window.db.auth.getSession();
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

        if (byId && byId.length) return byId;

        if (!profile.phone) return [];

        const { data: customers } = await window.db
            .from('customers')
            .select('id')
            .eq('phone', profile.phone);

        if (!customers?.length) return [];

        const ids = customers.map(c => c.id);
        const { data: byPhone } = await window.db
            .from('orders')
            .select('*, order_items(*)')
            .in('customer_id', ids)
            .order('created_at', { ascending: false });

        return byPhone || [];
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
        loadOrderHistory,
        logout
    };
})();

window.JPFCustomerAuth = JPFCustomerAuth;
