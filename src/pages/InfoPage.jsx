import { ArrowLeft, Mail, MessageCircle, Phone } from 'lucide-react'
import { useLang } from '../i18n/LanguageContext'
import { infoContent } from './infoContent'

const pageKeys = {
  privacy: 'privacy',
  returns: 'returns',
  'payment-policy': 'payment',
  about: 'about',
  contact: 'contact',
}

export default function InfoPage({ page, shop, onGoHome }) {
  const { t, lang } = useLang()
  const contentKey = pageKeys[page]
  const sections = infoContent[contentKey]?.[lang] || infoContent[contentKey]?.en || []

  return (
    <section className="mx-auto min-h-[55vh] max-w-4xl px-4 py-10 sm:py-14">
      <button
        type="button"
        onClick={onGoHome}
        className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('info.back')}
      </button>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-9">
        <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
          {t(`info.${contentKey}.title`)}
        </h1>
        <div className="mt-6 space-y-7 rounded-xl bg-gray-50 p-5 text-sm leading-7 text-gray-700 sm:p-7">
          {sections.map((section, index) => (
            <section key={`${section.heading || 'intro'}-${index}`}>
              {section.heading && (
                <h2 className="mb-2 text-base font-semibold leading-6 text-gray-950">
                  {section.heading}
                </h2>
              )}
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mb-3 last:mb-0">{paragraph}</p>
              ))}
              {section.items && (
                <ul className="my-3 list-disc space-y-1 pl-5">
                  {section.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
              {section.closing && <p className="mt-3">{section.closing}</p>}
              {section.contact && (
                <div className="mt-4 flex flex-col items-start gap-2">
                  {shop.whatsapp && (
                    <a
                      href={`https://wa.me/${shop.whatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 font-medium text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {t('info.whatsapp')}
                    </a>
                  )}
                  {shop.contactPhone && (
                    <p className="inline-flex min-h-10 items-center gap-2">
                      <Phone className="h-4 w-4" />
                      <span>{t('info.contact.phone')}: <a className="underline" href={`tel:${shop.contactPhone}`}>{shop.contactPhone}</a></span>
                    </p>
                  )}
                  <p className="inline-flex min-h-10 items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <span>
                      {t('info.contact.email')}:{' '}
                      {shop.contactEmail
                        ? <a className="underline" href={`mailto:${shop.contactEmail}`}>{shop.contactEmail}</a>
                        : '[Email Address]'}
                    </span>
                  </p>
                  <p>{t('info.contact.address')}: {shop.businessAddress || '[Business Address]'}</p>
                  <p>{t('info.contact.hours')}: {shop.businessHours || '[Business Hours]'}</p>
                </div>
              )}
            </section>
          ))}
          <p className="border-t border-gray-200 pt-4 text-xs text-gray-500">
            {t('info.lastUpdated')}: 28 November 2026
          </p>
        </div>
      </div>
    </section>
  )
}
