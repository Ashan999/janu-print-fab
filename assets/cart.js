/**
 * Janu Print | FAB — Simple Shopping Cart (localStorage)
 */
const JPFCart = (() => {
    const CART_KEY = 'jpf_shopping_cart';

    function read() {
        try {
            return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
        } catch {
            return [];
        }
    }

    function write(items) {
        localStorage.setItem(CART_KEY, JSON.stringify(items));
        window.dispatchEvent(new CustomEvent('jpf-cart-updated', { detail: { count: items.length } }));
    }

    function addItem(product, quantity = 1) {
        const items = read();
        const price = Number(product.price_per_unit || product.price || 0);
        const existing = items.find(i => i.productId === product.id);

        if (existing) {
            existing.quantity += quantity;
        } else {
            items.push({
                cartId: crypto.randomUUID(),
                productId: product.id,
                name: product.name,
                price,
                quantity: Math.max(quantity, Number(product.min_quantity || 1)),
                minQuantity: Number(product.min_quantity || 1),
                image: product.featured_image || (Array.isArray(product.images) ? product.images[0] : '') || '',
                description: product.description || '',
                category: product.categories?.name || 'Printing'
            });
        }

        write(items);
        return items;
    }

    function updateQuantity(cartId, quantity) {
        const items = read();
        const item = items.find(i => i.cartId === cartId);
        if (!item) return items;
        item.quantity = Math.max(quantity, item.minQuantity || 1);
        write(items);
        return items;
    }

    function removeItem(cartId) {
        const items = read().filter(i => i.cartId !== cartId);
        write(items);
        return items;
    }

    function clear() {
        write([]);
    }

    function getItems() {
        return read();
    }

    function getCount() {
        return read().reduce((sum, i) => sum + i.quantity, 0);
    }

    function getSubtotal() {
        return read().reduce((sum, i) => sum + i.price * i.quantity, 0);
    }

    function money(value) {
        return `AED ${Number(value || 0).toFixed(2)}`;
    }

    return { addItem, updateQuantity, removeItem, clear, getItems, getCount, getSubtotal, money };
})();

window.JPFCart = JPFCart;
