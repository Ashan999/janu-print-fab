import { useEffect, useRef, useState } from 'react'
import { Upload, CheckCircle2, Image as ImageIcon, Minus, Plus, Trash2 } from 'lucide-react'
import { safeFileName, supabase, validateUpload } from '../lib/supabase'
import { useCart } from '../context/CartContext'
import { useLang } from '../i18n/LanguageContext'
import { useToast } from '../components/ToastContext'
import ColorSwatches, { COLOR_HEX } from '../components/ColorSwatches'
import { formatPrice } from '../config'
import { getPricingRules, calculateProductPrice, createPricingSnapshot } from '../lib/pricing'

const SIZES = ['S', 'M', 'L', 'XL', 'XXL']
const COLORS = ['Black', 'White', 'Navy', 'Charcoal', 'Red', 'Olive']
const LOCATIONS = ['Front', 'Back', 'Left Chest', 'Right Chest', 'Sleeve']
const PRINT_SIZES = ['A5', 'A4', 'A3', 'Custom']

export default function CustomDesignUploader({ user, onOpenAuth, onOpenCart }) {
  const { addToCart, setIsCartOpen } = useCart()
  const { t, tl, tError } = useLang()
  const toast = useToast()
  const [designFile, setDesignFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [designPath, setDesignPath] = useState('')
  const [color, setColor] = useState('Black')
  const [size, setSize] = useState('L')
  const [printLocations, setPrintLocations] = useState([{ location: 'Front', method: 'DTF', size: 'A4' }])
  const [pricingRules, setPricingRules] = useState([])
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [step, setStep] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [added, setAdded] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)
  const previewUrlRef = useRef('')

  useEffect(() => {
    void getPricingRules().then(({ rules, error }) => {
      if (error) setErrorMsg('Current printing prices could not be loaded. Please try again shortly.')
      else setPricingRules(rules || [])
    })
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const printMethods = [...new Set(pricingRules.filter((rule) => ['print', 'print_method', 'print_size', 'print_location'].includes(rule.rule_type) && rule.print_method).map((rule) => rule.print_method))]
  const priceResult = calculateProductPrice({ itemType: 'custom', rules: pricingRules, printLocations })
  const unitPrice = priceResult.price
  const printPosition = printLocations.map((item) => item.location).join(' & ')
  const clearPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = ''
    setPreviewUrl('')
  }

  const handleFile = (file) => {
    if (!file) return
    const validationError = validateUpload(file)
    if (validationError) {
      clearPreview()
      setDesignFile(null)
      setErrorMsg(t(validationError))
      return
    }
    setErrorMsg('')
    setDesignFile(file)
    clearPreview()
    if (file.type.startsWith('image/')) {
      previewUrlRef.current = URL.createObjectURL(file)
      setPreviewUrl(previewUrlRef.current)
    }
    setDesignPath('')
    setAdded(false)
  }

  const uploadDesign = async () => {
    const validationError = validateUpload(designFile)
    if (validationError) {
      setErrorMsg(t(validationError))
      return false
    }
    if (!user) {
      setErrorMsg(t('custom.loginRequired'))
      return false
    }
    setUploading(true)
    setErrorMsg('')
    try {
      const path = `${user.id}/${safeFileName(designFile)}`
      const { error } = await supabase.storage.from('customer-designs').upload(path, designFile)
      if (error) throw error
      setDesignPath(path)
      return true
    } catch (error) {
      setErrorMsg(tError(error))
      return false
    } finally {
      setUploading(false)
    }
  }

  const continueFromUpload = async () => {
    if (!designFile) {
      setErrorMsg(t('err.fileMissing'))
      return
    }
    if (!designPath && !(await uploadDesign())) return
    setStep(2)
  }

  const addDesignToCart = () => {
    if (!designPath) {
      setErrorMsg(t('err.design'))
      return
    }
    const printRequirements = printLocations
      .map((item) => `${item.location} / ${item.method} / ${item.size}`)
      .join('; ')
    addToCart({
      type: 'custom',
      title: `${t('custom.title')} [Print: ${printRequirements}]`,
      design_url: designPath,
      image_url: null,
      color,
      size,
      print_position: printPosition,
      print_locations: priceResult.locations.map((location) => ({ ...location, artwork_path: designPath })),
      price_snapshot: createPricingSnapshot(priceResult),
      notes: notes.trim(),
      quantity,
      unit_price: unitPrice,
    })
    setAdded(true)
    setErrorMsg('')
    toast({
      message: t('toast.added'),
      type: 'success',
      actionLabel: t('toast.viewCart'),
      onAction: () => {
        setIsCartOpen(true)
        onOpenCart?.()
      },
    })
  }

  const continueToCart = () => {
    setIsCartOpen(true)
    onOpenCart?.()
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('custom.title')}</h1>
        <p className="text-sm text-gray-700 mt-1">{t('custom.subtitle')}</p>
      </header>

      <ol className="mb-6 grid grid-cols-3 gap-2" aria-label={`${t('custom.step1')} - ${t('custom.step3')}`}>
        {[t('custom.step1'), t('custom.step2'), t('custom.step3')].map((label, index) => {
          const current = step === index + 1
          const complete = step > index + 1
          return (
            <li
              key={label}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-2 text-center text-xs sm:text-sm font-semibold ${
                current || complete ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-gray-200 bg-white text-gray-600'
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs">{complete ? '✓' : index + 1}</span>
              {label}
            </li>
          )
        })}
      </ol>

      {!user && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-gray-900">
          <p>{t('custom.loginRequired')}</p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="min-h-11 rounded-lg bg-black px-4 py-2 font-semibold text-white focus-visible:ring-2 ring-indigo-500"
          >
            {t('custom.login')}
          </button>
        </div>
      )}

      {step === 1 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">{t('custom.step1')}</h2>
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              handleFile(event.dataTransfer.files?.[0])
            }}
            className={`rounded-2xl border-2 border-dashed p-6 text-center transition sm:p-10 ${
              dragging ? 'border-indigo-600 bg-indigo-50' : 'border-gray-300 bg-gray-50'
            }`}
          >
            {previewUrl ? (
              <img src={previewUrl} alt={t('custom.designPreview')} className="mx-auto mb-4 max-h-56 max-w-full rounded-xl object-contain" />
            ) : (
              <ImageIcon className="mx-auto mb-3 h-12 w-12 text-gray-500" />
            )}
            {designFile ? (
              <p className="mb-3 break-all text-sm font-semibold text-gray-900">{designFile.name}</p>
            ) : (
              <p className="mb-2 text-sm font-semibold text-gray-900">{t('custom.uploadHint')}</p>
            )}
            <p className="mb-4 text-sm text-gray-700">{t('custom.uploadFormats')}</p>
            <p className="mx-auto mb-4 max-w-xl text-xs text-gray-600">{t('custom.tip')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) => handleFile(event.target.files?.[0])}
              className="sr-only"
              aria-label={t('custom.chooseFile')}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white focus-visible:ring-2 ring-indigo-500"
            >
              <Upload className="h-4 w-4" />
              {designFile ? t('custom.change') : t('custom.chooseFile')}
            </button>
          </div>
          {errorMsg && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{errorMsg}</p>}
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={continueFromUpload}
              disabled={uploading || !user}
              className="min-h-12 rounded-xl bg-black px-6 py-3 font-semibold text-white disabled:opacity-50 focus-visible:ring-2 ring-indigo-500"
            >
              {uploading ? t('custom.uploading') : t('custom.continue')}
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold text-gray-900">{t('custom.step2')}</h2>
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <span>{t('custom.shirtColor')}</span><span>{tl('color', color)}</span>
            </div>
            <ColorSwatches colors={COLORS} value={color} onChange={setColor} />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-800">{t('product.size')}</p>
            <div className="flex gap-2">
              {SIZES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={size === value}
                  onClick={() => setSize(value)}
                  className={`h-11 min-w-11 flex-1 rounded-xl border text-sm font-semibold focus-visible:ring-2 ring-indigo-500 ${
                    size === value ? 'border-black bg-black text-white' : 'border-gray-300 bg-white text-gray-800'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-gray-800">{t('custom.position')}</p><button type="button" disabled={printLocations.length >= LOCATIONS.length} onClick={() => setPrintLocations((current) => [...current, { location: LOCATIONS.find((location) => !current.some((item) => item.location === location)) || 'Back', method: printMethods[0] || 'DTF', size: 'A4' }])} className="min-h-10 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50">{t('custom.addPrintArea')}</button></div>
            {printLocations.map((item, index) => <div key={item.location} className="grid gap-2 rounded-xl border border-gray-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <label className="text-xs font-medium text-gray-600">{t('custom.printArea')}<select value={item.location} onChange={(event) => setPrintLocations((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, location: event.target.value } : entry))} className="mt-1 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900">{LOCATIONS.filter((location) => location === item.location || !printLocations.some((entry) => entry.location === location)).map((location) => <option key={location} value={location}>{location}</option>)}</select></label>
              <label className="text-xs font-medium text-gray-600">Print method<select value={item.method} onChange={(event) => setPrintLocations((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, method: event.target.value } : entry))} className="mt-1 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900">{(printMethods.length ? printMethods : ['DTF']).map((method) => <option key={method} value={method}>{method}</option>)}</select></label>
              <label className="text-xs font-medium text-gray-600">Print size<select value={item.size} onChange={(event) => setPrintLocations((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, size: event.target.value } : entry))} className="mt-1 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900">{PRINT_SIZES.map((printSize) => <option key={printSize} value={printSize}>{printSize}</option>)}</select></label>
              <button type="button" disabled={printLocations.length <= 1} onClick={() => setPrintLocations((current) => current.filter((_, entryIndex) => entryIndex !== index))} aria-label={`Remove ${item.location}`} className="min-h-10 rounded-lg border border-red-200 px-3 text-red-700 disabled:opacity-40"><Trash2 className="mx-auto h-4 w-4" /></button>
            </div>)}
            <p className="text-xs text-gray-600">{t('custom.printAreaHint')}</p>
          </section>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <p className="font-semibold text-gray-900">{t('custom.price')}: {formatPrice(unitPrice)} / {t('custom.each')}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(1)} className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 font-semibold text-gray-800 focus-visible:ring-2 ring-indigo-500">
                {t('custom.back')}
              </button>
              <button type="button" onClick={() => setStep(3)} className="min-h-11 rounded-xl bg-black px-5 py-2 font-semibold text-white focus-visible:ring-2 ring-indigo-500">
                {t('custom.continue')}
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold text-gray-900">{t('custom.step3')}</h2>
          <div className="flex flex-col items-center gap-5 rounded-2xl bg-gray-50 p-5 sm:flex-row">
            <div
              className="relative flex h-56 w-48 shrink-0 items-center justify-center rounded-[2.5rem] border border-gray-300 shadow-sm"
              style={{ backgroundColor: COLOR_HEX[color] }}
              aria-label={`${t('custom.previewFor')} ${tl('color', color)}`}
            >
                {!printLocations.some((location) => location.location === 'Front') ? (
                <span className={color === 'White' || color === 'Heather Gray' ? 'text-gray-700' : 'text-white'}>
                  {t('custom.backView')}
                </span>
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt={t('custom.designPreview')}
                  className="max-h-[40%] max-w-[40%] object-contain"
                />
              ) : (
                <span className={color === 'White' || color === 'Heather Gray' ? 'text-gray-700' : 'text-white'}>
                  {designFile?.name}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="break-all font-semibold text-gray-900">{designFile?.name}</p>
              <p className="mt-1 text-sm text-gray-700">{tl('color', color)} · {size} · {printPosition}</p>
            </div>
          </div>
          <div>
            <label htmlFor="custom-notes" className="mb-1.5 block text-sm font-semibold text-gray-800">{t('custom.notes')}</label>
            <textarea
              id="custom-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t('custom.notesPlaceholder')}
              className="w-full rounded-xl border border-gray-300 px-3.5 py-3 text-base focus-visible:ring-2 ring-indigo-500"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-800">{t('custom.quantity')}</p>
              <div className="flex items-center gap-2">
                <button type="button" aria-label={t('custom.quantity') + ' -'} onClick={() => setQuantity((current) => Math.max(1, current - 1))} className="min-h-11 min-w-11 rounded-xl border border-gray-300 focus-visible:ring-2 ring-indigo-500">
                  <Minus className="mx-auto h-4 w-4" />
                </button>
                <span className="min-w-10 text-center font-bold">{quantity}</span>
                <button type="button" aria-label={t('custom.quantity') + ' +'} onClick={() => setQuantity((current) => Math.min(99, current + 1))} className="min-h-11 min-w-11 rounded-xl border border-gray-300 focus-visible:ring-2 ring-indigo-500">
                  <Plus className="mx-auto h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-700">{formatPrice(unitPrice)} × {quantity}</p>
              <p className="text-xl font-bold text-gray-900">{formatPrice(unitPrice * quantity)}</p>
            </div>
          </div>
          {errorMsg && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{errorMsg}</p>}
          <div className="flex flex-wrap justify-between gap-3 border-t border-gray-100 pt-4">
            <button type="button" onClick={() => setStep(2)} className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 font-semibold text-gray-800 focus-visible:ring-2 ring-indigo-500">
              {t('custom.back')}
            </button>
            {added ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setAdded(false); setStep(1); setDesignFile(null); clearPreview(); setDesignPath(''); setNotes('') }} className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 font-semibold text-gray-900 focus-visible:ring-2 ring-indigo-500">
                  {t('custom.addAnother')}
                </button>
                <button type="button" onClick={continueToCart} className="min-h-11 rounded-xl bg-black px-4 py-2 font-semibold text-white focus-visible:ring-2 ring-indigo-500">
                  {t('custom.viewCart')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={addDesignToCart}
                className="min-h-12 rounded-xl bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800 focus-visible:ring-2 ring-indigo-500"
              >
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-5 w-5" />{t('custom.add')}</span>
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
