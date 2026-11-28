import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLang } from '../i18n/LanguageContext'

export default function AuthModal({ isOpen, onClose }) {
  const { t, tError } = useLang()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [confirmationSent, setConfirmationSent] = useState(false)
  const emailRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined
    emailRef.current?.focus()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setErrorMsg('')
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim() } },
        })
        if (error) throw error
        setConfirmationSent(true)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onClose()
      }
    } catch (error) {
      setErrorMsg(tError(error))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) throw error
    } catch (error) {
      setErrorMsg(tError(error))
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="relative flex h-full w-full flex-col overflow-y-auto bg-white p-6 shadow-xl sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute right-4 top-4 min-h-11 min-w-11 rounded-full p-2 text-gray-600 hover:bg-gray-100 focus-visible:ring-2 ring-indigo-500"
        >
          <X className="mx-auto h-5 w-5" />
        </button>

        <div className="m-auto w-full max-w-sm py-12 sm:py-4">
          <h2 id="auth-title" className="mb-1 pr-10 text-2xl font-bold text-gray-900">
            {confirmationSent ? t('auth.checkEmailTitle') : isSignUp ? t('auth.signup') : t('auth.welcome')}
          </h2>
          <p className="mb-6 text-sm text-gray-700">
            {confirmationSent
              ? t('auth.checkEmail')
              : isSignUp
                ? t('auth.signupSubtitle')
                : t('auth.loginSubtitle')}
          </p>

          {errorMsg && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{errorMsg}</p>}

          {!confirmationSent && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div>
                  <label htmlFor="auth-name" className="mb-1.5 block text-sm font-semibold text-gray-800">{t('auth.fullName')}</label>
                  <input
                    id="auth-name"
                    type="text"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-base focus-visible:ring-2 ring-indigo-500"
                  />
                </div>
              )}
              <div>
                <label htmlFor="auth-email" className="mb-1.5 block text-sm font-semibold text-gray-800">{t('auth.email')}</label>
                <input
                  ref={emailRef}
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="min-h-12 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-base focus-visible:ring-2 ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="auth-password" className="mb-1.5 block text-sm font-semibold text-gray-800">{t('auth.password')}</label>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 pr-14 text-base focus-visible:ring-2 ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? t('auth.hide') : t('auth.show')}
                    className="absolute inset-y-0 right-1 min-h-11 min-w-11 rounded-lg text-gray-700 focus-visible:ring-2 ring-indigo-500"
                  >
                    {showPassword ? <EyeOff className="mx-auto h-5 w-5" /> : <Eye className="mx-auto h-5 w-5" />}
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-700">{t('auth.passwordHint')}</p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="min-h-12 w-full rounded-xl bg-gray-900 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50 focus-visible:ring-2 ring-indigo-500"
              >
                {loading ? t('auth.pleaseWait') : isSignUp ? t('auth.signup') : t('auth.login')}
              </button>
            </form>
          )}

          {!isSignUp && !confirmationSent && (
            <div className="mt-5">
              <div className="mb-4 flex items-center gap-3 text-xs text-gray-500">
                <span className="h-px flex-1 bg-gray-200" />
                <span>{t('auth.or')}</span>
                <span className="h-px flex-1 bg-gray-200" />
              </div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3 font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 focus-visible:ring-2 ring-indigo-500"
              >
                <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.66 5.95c4.47-4.13 7.11-10.2 7.11-17.6Z" />
                  <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.75-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.66-5.95c-2.13 1.43-4.85 2.27-8.24 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
                </svg>
                {loading ? t('auth.pleaseWait') : t('auth.continueGoogle')}
              </button>
            </div>
          )}

          <div className="mt-5 text-center text-sm text-gray-700">
            {isSignUp ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp((current) => !current)
                setConfirmationSent(false)
                setErrorMsg('')
              }}
              className="min-h-11 font-semibold text-gray-900 underline underline-offset-2 focus-visible:ring-2 ring-indigo-500"
            >
              {isSignUp ? t('auth.login') : t('auth.signup')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
