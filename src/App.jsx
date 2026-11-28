import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { useCart } from './context/CartContext'
import Navbar from './components/Navbar'
import InfoPage from './pages/InfoPage'
import Footer from './components/Footer'
import { MessageCircle } from 'lucide-react'
import { useShopSettings } from './lib/useShopSettings'
import { useLang } from './i18n/LanguageContext'

const PrintGallery = lazy(() => import('./pages/PrintGallery'))
const CustomDesignUploader = lazy(() => import('./pages/CustomDesignUploader'))
const CustomerOrders = lazy(() => import('./pages/CustomerOrders'))
const CustomerAccount = lazy(() => import('./pages/CustomerAccount'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AuthModal = lazy(() => import('./components/AuthModal'))
const CartDrawer = lazy(() => import('./components/CartDrawer'))

export default function App() {
  const { t } = useLang()
  const shop = useShopSettings()
  const { isCartOpen, setIsCartOpen } = useCart()
  const [activeTab, setActiveTab] = useState('gallery')
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const authCheckId = useRef(0)
  const verifiedUserId = useRef(null)

  const updateCurrentUser = useCallback(async (currentUser) => {
    const requestId = ++authCheckId.current
    setUser(currentUser)
    if (!currentUser) {
      verifiedUserId.current = null
      setIsAdmin(false)
      setActiveTab((currentTab) => (currentTab === 'admin' ? 'gallery' : currentTab))
      return
    }
    if (verifiedUserId.current !== currentUser.id) {
      verifiedUserId.current = currentUser.id
      setIsAdmin(false)
    }

    try {
      const { data, error } = await supabase.rpc('is_admin')
      if (requestId !== authCheckId.current) return
      if (error) {
        console.error('Could not verify admin status:', error)
        setIsAdmin(false)
        setActiveTab((currentTab) => (currentTab === 'admin' ? 'gallery' : currentTab))
        return
      }

      const admin = data === true
      setIsAdmin(admin)
      if (admin) setActiveTab('admin')
      else setActiveTab((currentTab) => (currentTab === 'admin' ? 'gallery' : currentTab))
    } catch (error) {
      if (requestId !== authCheckId.current) return
      console.error('Could not verify admin status:', error)
      setIsAdmin(false)
      setActiveTab((currentTab) => (currentTab === 'admin' ? 'gallery' : currentTab))
    }
  }, [])

  const refreshCurrentSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.error('Could not load the current session:', error)
        return
      }
      await updateCurrentUser(data?.session?.user ?? null)
    } catch (error) {
      console.error('Could not load the current session:', error)
    }
  }, [updateCurrentUser])

  useEffect(() => {
    let active = true
    void refreshCurrentSession()

    const handleAuthStateChange = (_event, session) => {
      const currentUser = session?.user ?? null
      setTimeout(() => {
        if (active) void updateCurrentUser(currentUser)
      }, 0)
    }
    const handleTabFocus = () => {
      if (document.visibilityState === 'visible') void refreshCurrentSession()
    }

    const { data: listener } = supabase.auth.onAuthStateChange(handleAuthStateChange)
    document.addEventListener('visibilitychange', handleTabFocus)
    window.addEventListener('focus', handleTabFocus)
    window.addEventListener('pageshow', handleTabFocus)
    return () => {
      active = false
      listener.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleTabFocus)
      window.removeEventListener('focus', handleTabFocus)
      window.removeEventListener('pageshow', handleTabFocus)
    }
  }, [refreshCurrentSession, updateCurrentUser])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setActiveTab('gallery')
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-20 md:pb-8">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        isAdmin={isAdmin}
        onOpenAuth={() => setAuthOpen(true)}
        onLogout={handleLogout}
        onOpenCart={() => setIsCartOpen(true)}
      />

      <main>
        <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-12"><div className="h-64 animate-pulse rounded-2xl bg-gray-100" /></div>}>
          {activeTab === 'gallery' && (
            <PrintGallery
              onGoToCustom={() => setActiveTab('custom')}
              onOpenAuth={() => setAuthOpen(true)}
              user={user}
              isAdmin={isAdmin}
            />
          )}
          {activeTab === 'custom' && (
            <CustomDesignUploader
              user={user}
              onOpenAuth={() => setAuthOpen(true)}
              onOpenCart={() => setIsCartOpen(true)}
            />
          )}
          {activeTab === 'orders' && (
            <CustomerOrders
              user={user}
              onOpenAuth={() => setAuthOpen(true)}
              onGoToGallery={() => setActiveTab('gallery')}
            />
          )}
          {activeTab === 'account' && user && <CustomerAccount user={user} />}
          {activeTab === 'admin' && (
            <AdminDashboard isAdmin={isAdmin} />
          )}
        </Suspense>
        {['privacy', 'returns', 'payment-policy', 'about', 'contact'].includes(activeTab) && (
          <InfoPage page={activeTab} shop={shop} onGoHome={() => setActiveTab('gallery')} />
        )}
      </main>

      <Footer activeTab={activeTab} setActiveTab={setActiveTab} />
      {authOpen && <Suspense fallback={null}><AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} /></Suspense>}
      {isCartOpen && <Suspense fallback={null}><CartDrawer
        onClose={() => setIsCartOpen(false)}
        user={user}
        onOpenAuth={() => setAuthOpen(true)}
        onOrderSuccess={() => setActiveTab('orders')}
      /></Suspense>}
      {!isCartOpen && (
        <a
          href={`https://wa.me/${shop.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('contact.whatsapp')}
          className="fixed bottom-24 right-4 z-30 flex min-h-12 items-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg hover:bg-emerald-700 focus-visible:ring-2 ring-indigo-500 md:bottom-5"
        >
          <MessageCircle className="h-5 w-5" />
          <span className="hidden sm:inline">{t('contact.whatsapp')}</span>
        </a>
      )}
    </div>
  )
}
