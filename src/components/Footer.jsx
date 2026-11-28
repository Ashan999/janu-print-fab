import { useLang } from '../i18n/LanguageContext'

const links = [
  ['privacy', 'footer.privacy'],
  ['returns', 'footer.returns'],
  ['payment-policy', 'footer.payment'],
  ['about', 'footer.about'],
  ['contact', 'footer.contact'],
]

export default function Footer({ activeTab, setActiveTab }) {
  const { t } = useLang()

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          &copy; Janu Print | Fab
        </p>
        <nav aria-label={t('footer.navigation')} className="flex flex-wrap gap-x-5 gap-y-2">
          {links.map(([page, label]) => (
            <button
              key={page}
              type="button"
              onClick={() => {
                setActiveTab(page)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              aria-current={activeTab === page ? 'page' : undefined}
              className="min-h-8 text-left text-sm text-gray-600 underline-offset-4 hover:text-gray-950 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {t(label)}
            </button>
          ))}
        </nav>
      </div>
    </footer>
  )
}
