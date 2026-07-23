/**
 * Updates nav cart badge and user menu on public pages
 */
async function JPFUpdateNav() {
    const cartBadge = document.getElementById('cartCount');
    const navGuest = document.getElementById('navAuthGuest');
    const navUser = document.getElementById('navAuthUser');
    const navUserName = document.getElementById('navUserName');
    const navHistory = document.getElementById('navHistory');
    const navLogoutWrap = document.getElementById('navLogoutWrap');
    const logoutBtn = document.getElementById('navLogoutBtn');

    function refreshCartBadge() {
        if (cartBadge && window.JPFCart) {
            const count = JPFCart.getCount();
            cartBadge.textContent = count;
            cartBadge.style.display = count > 0 ? 'inline-flex' : 'none';
        }
    }

    refreshCartBadge();
    window.addEventListener('jpf-cart-updated', refreshCartBadge);

    if (!window.JPFCustomerAuth || !window.db) return;

    try {
        const profile = await JPFCustomerAuth.getProfile();
        if (profile && navGuest && navUser) {
            navGuest.style.display = 'none';
            navUser.style.display = 'list-item';
            if (navHistory) navHistory.style.display = 'list-item';
            if (navLogoutWrap) navLogoutWrap.style.display = 'list-item';
            if (navUserName) navUserName.textContent = profile.name?.split(' ')[0] || 'Account';
        }
    } catch (err) {
        console.warn('Nav auth check:', err.message);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await JPFCustomerAuth.logout();
            window.location.href = 'index.html';
        });
    }
}

document.addEventListener('DOMContentLoaded', JPFUpdateNav);
