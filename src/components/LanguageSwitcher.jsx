import { useLang } from '../i18n/LanguageContext'

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useLang()
  const base = 'px-2.5 py-1.5 text-xs font-semibold rounded-full transition min-w-[44px]'
  return (
    <div role="group" aria-label={t('nav.language')} className="flex items-center bg-gray-100 rounded-full p-0.5">
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        className={`${base} focus-visible:ring-2 ring-indigo-500 ${lang === 'en' ? 'bg-black text-white' : 'text-gray-600'}`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('si')}
        aria-pressed={lang === 'si'}
        className={`${base} focus-visible:ring-2 ring-indigo-500 ${lang === 'si' ? 'bg-black text-white' : 'text-gray-600'}`}
      >
        සිං
      </button>
    </div>
  )
}
