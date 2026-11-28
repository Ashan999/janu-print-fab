import { useEffect, useRef, useState } from 'react'
import {
  ShoppingBag, LogOut, User, UserRound, ShieldCheck, Palette, Shirt, ClipboardList, ChevronDown,
} from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useLang } from '../i18n/LanguageContext'
import LanguageSwitcher from './LanguageSwitcher'

export default function Navbar({
  activeTab,
  setActiveTab,
  user,
  isAdmin = false,
  onOpenAuth,
  onLogout,
  onOpenCart,
}) {
  const { totalItems } = useCart()
  const { t } = useLang()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setUserMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  const changeTab = (tab) => {
    setActiveTab(tab)
    setUserMenuOpen(false)
  }

  const tabClass = (tab) =>
    `px-3.5 py-2 rounded-lg text-sm font-medium transition focus-visible:ring-2 ring-indigo-500 ${
      activeTab === tab ? 'bg-gray-100 text-black' : 'text-gray-600 hover:text-black'
    }`

  const mobileClass = (tab) =>
    `relative flex min-h-12 flex-col items-center justify-center gap-0.5 px-2 text-xs font-medium focus-visible:ring-2 ring-indigo-500 ${
      activeTab === tab ? 'text-black' : 'text-gray-600'
    }`

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 min-h-16 flex items-center justify-between gap-2">
        <button
          onClick={() => changeTab('gallery')}
          className="flex min-w-0 shrink items-center gap-2 font-bold text-lg tracking-tight text-gray-900 focus-visible:ring-2 ring-indigo-500 sm:text-xl"
        >
          <span>Janu Print | Fab</span>
        </button>

        <nav className="hidden md:flex items-center gap-1">
          <button onClick={() => changeTab('gallery')} className={tabClass('gallery')}>
            {t('nav.gallery')}
          </button>
          {!isAdmin && (
            <>
              <button onClick={() => changeTab('custom')} className={tabClass('custom')}>
                {t('nav.custom')}
              </button>
              <button onClick={() => changeTab('orders')} className={tabClass('orders')}>
                {t('nav.orders')}
              </button>
              {user && <button onClick={() => changeTab('account')} className={tabClass('account')}>Account</button>}
            </>
          )}
          {isAdmin && (
            <button
              onClick={() => changeTab('admin')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition focus-visible:ring-2 ring-indigo-500 ${
                activeTab === 'admin'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              <ShieldCheck className="w-4 h-4" /> Admin Panel
            </button>
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <LanguageSwitcher />
          {!isAdmin && (
            <button
              onClick={onOpenCart}
              className="relative min-h-11 min-w-11 p-2.5 rounded-xl hover:bg-gray-100 text-gray-800 transition focus-visible:ring-2 ring-indigo-500"
              aria-label={t('nav.openCart')}
            >
              <ShoppingBag className="w-5 h-5" />
              {totalItems > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-black text-white text-xs font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </button>
          )}

          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((open) => !open)}
                aria-label={t('nav.account')}
                aria-expanded={userMenuOpen}
                className="min-h-11 flex items-center gap-1 rounded-full p-1 hover:bg-gray-100 focus-visible:ring-2 ring-indigo-500"
              >
                <span className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold">
                  {(user.email?.[0] || 'U').toUpperCase()}
                </span>
                <ChevronDown className="hidden sm:block w-4 h-4 text-gray-500" />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                  <p className="truncate px-3 py-2 text-sm text-gray-600">{user.email}</p>
                  {!isAdmin && (
                    <button
                      type="button"
                      onClick={() => changeTab('account')}
                      className="w-full min-h-11 rounded-lg px-3 text-left text-sm hover:bg-gray-100 focus-visible:ring-2 ring-indigo-500"
                    >
                      Account details
                    </button>
                  )}
                  {!isAdmin && (
                    <button
                      type="button"
                      onClick={() => changeTab('orders')}
                      className="w-full min-h-11 rounded-lg px-3 text-left text-sm hover:bg-gray-100 focus-visible:ring-2 ring-indigo-500"
                    >
                      {t('nav.orders')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false)
                      onLogout()
                    }}
                    className="w-full min-h-11 flex items-center gap-2 rounded-lg px-3 text-left text-sm text-gray-700 hover:bg-gray-100 focus-visible:ring-2 ring-indigo-500"
                  >
                    <LogOut className="w-4 h-4" /> {t('nav.logout')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              aria-label={t('nav.login')}
              className="min-h-11 min-w-11 flex items-center justify-center gap-1.5 bg-black text-white text-sm font-medium px-2 sm:px-4 rounded-xl hover:bg-gray-800 transition focus-visible:ring-2 ring-indigo-500"
            >
              <User className="w-4 h-4" /> <span className="hidden sm:inline">{t('nav.login')}</span>
            </button>
          )}
        </div>
      </div>
      </header>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex justify-around px-1 pb-[env(safe-area-inset-bottom)]">
        <button onClick={() => changeTab('gallery')} className={mobileClass('gallery')}>
          {activeTab === 'gallery' && <span className="absolute top-0 h-0.5 w-8 rounded bg-indigo-600" />}
          <Shirt className="w-6 h-6" />
          {t('nav.gallery')}
        </button>
        {!isAdmin && (
          <>
            <button onClick={() => changeTab('custom')} className={mobileClass('custom')}>
              {activeTab === 'custom' && <span className="absolute top-0 h-0.5 w-8 rounded bg-indigo-600" />}
              <Palette className="w-6 h-6" />
              {t('nav.custom')}
            </button>
            <button onClick={() => changeTab('orders')} className={mobileClass('orders')}>
              {activeTab === 'orders' && <span className="absolute top-0 h-0.5 w-8 rounded bg-indigo-600" />}
              <ClipboardList className="w-6 h-6" />
              {t('nav.orders')}
            </button>
            {user && <button onClick={() => changeTab('account')} className={mobileClass('account')}>
              {activeTab === 'account' && <span className="absolute top-0 h-0.5 w-8 rounded bg-indigo-600" />}
              <UserRound className="w-6 h-6" />
              Account
            </button>}
          </>
        )}
        {isAdmin && (
          <button onClick={() => changeTab('admin')} className={mobileClass('admin')}>
            {activeTab === 'admin' && <span className="absolute top-0 h-0.5 w-8 rounded bg-indigo-600" />}
            <ShieldCheck className="w-6 h-6" />
            Admin
          </button>
        )}
      </nav>
    </>
  )
}
