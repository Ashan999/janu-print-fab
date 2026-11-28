import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { translations } from './translations'

const LanguageContext = createContext(null)
const STORAGE_KEY = 'tee_lang'

function getInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'si') return saved
  } catch {
    // Storage can be disabled by the browser.
  }
  return navigator.language?.toLowerCase().startsWith('si') ? 'si' : 'en'
}

const ERROR_MAP = [
  ['Please log in first', 'err.login'],
  ['Too many pending orders', 'err.tooManyPending'],
  ['Invalid payment slip', 'err.slip'],
  ['Invalid design file', 'err.design'],
  ['Invalid phone number', 'err.phone'],
  ['Invalid name', 'err.name'],
  ['Invalid address', 'err.address'],
  ['is not available', 'err.sizeUnavailable'],
  ['Invalid login credentials', 'err.badLogin'],
  ['Email not confirmed', 'err.emailNotConfirmed'],
  ['User already registered', 'err.alreadyRegistered'],
  ['File is too large', 'err.fileTooLarge'],
  ['files are allowed', 'err.fileType'],
  ['images are allowed', 'err.fileType'],
]

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(getInitialLang)

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = translations[lang]['meta.title']
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // Storage can be disabled by the browser.
    }
  }, [lang])

  const t = useCallback((key, params) => {
    let text = translations[lang]?.[key] ?? translations.en[key] ?? key
    if (params) {
      Object.entries(params).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, String(value))
      })
    }
    return text
  }, [lang])

  const tl = useCallback(
    (group, value) => translations[lang]?.[`${group}.${value}`] ?? value,
    [lang]
  )

  const tError = useCallback((err) => {
    const message = typeof err === 'string' ? err : err?.message || ''
    const match = ERROR_MAP.find(([needle]) => message.includes(needle))
    return match ? t(match[1]) : t('err.generic')
  }, [t])

  const value = useMemo(() => ({ lang, setLang, t, tl, tError }), [lang, t, tl, tError])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLang() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLang must be used inside <LanguageProvider>')
  return context
}
