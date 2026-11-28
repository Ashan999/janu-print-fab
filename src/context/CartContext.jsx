import { createContext, useContext, useState, useEffect } from 'react'

const CartContext = createContext()

function readSavedCart() {
  try {
    const saved = JSON.parse(localStorage.getItem('tshirt_cart') || '[]')
    if (!Array.isArray(saved)) return []
    return saved
      .filter((item) => item && typeof item === 'object')
      .map((item, index) => ({
        ...item,
        cartItemId: item.cartItemId || `restored-${index}-${item.product_id || 'custom'}`,
        quantity: Math.max(1, Math.min(99, Math.floor(Number(item.quantity) || 1))),
      }))
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState(readSavedCart)
  const [isCartOpen, setIsCartOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem('tshirt_cart', JSON.stringify(cart))
  }, [cart])

  const addToCart = (item) => {
    setCart((prev) => [...prev, {
      ...item,
      quantity: Math.max(1, Math.min(99, Math.floor(Number(item.quantity) || 1))),
      cartItemId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    }])
  }

  const removeFromCart = (cartItemId) => {
    setCart((prev) => prev.filter((item) => item.cartItemId !== cartItemId))
  }

  const updateQuantity = (cartItemId, newQty) => {
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(newQty) || 1)))
    setCart((prev) =>
      prev.map((item) =>
        item.cartItemId === cartItemId ? { ...item, quantity } : item
      )
    )
  }

  const clearCart = () => setCart([])

  const totalAmount = cart.reduce(
    (sum, item) => sum + (Math.max(0, Number(item.unit_price ?? item.price) || 0) * item.quantity),
    0
  )
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalAmount,
        totalItems,
        isCartOpen,
        setIsCartOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
