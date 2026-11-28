import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X, Trash2, Copy, Check, Upload, ShoppingBag, Minus, Plus, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useCart } from '../context/CartContext'
import { safeFileName, supabase, validateUpload, openPrivateFile } from '../lib/supabase'
import { useToast } from './ToastContext'
import { useLang } from '../i18n/LanguageContext'
import { SHOP, formatPrice } from '../config'
import { useShopSettings } from '../lib/useShopSettings'

const initialFieldErrors = { customerName: '', phone: '', address: '' }

export default function CartDrawer({ isOpen = false, onClose, user, onOpenAuth, onOrderSuccess }) {
  const toast = useToast()
  const { t, tl, tError } = useLang()
  const shopSettings = useShopSettings()
  const {
    cart, removeFromCart, updateQuantity, clearCart, totalAmount,
    isCartOpen: contextCartOpen, setIsCartOpen,
  } = useCart()

  const drawerIsOpen = isOpen || contextCartOpen
  const deliveryFee = Math.max(0, Number(shopSettings.deliveryFee) || 0)
  const orderTotal = totalAmount + deliveryFee

  const [step, setStep] = useState('cart')
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [savedAddresses, setSavedAddresses] = useState([])
  const [selectedAddressId, setSelectedAddressId] = useState('manual')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [completedPaymentMethod, setCompletedPaymentMethod] = useState('bank_transfer')
  const [slipFile, setSlipFile] = useState(null)
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentWarning, setPaymentWarning] = useState('')
  const [slipPreview, setSlipPreview] = useState('')
  const slipPreviewRef = useRef('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [fieldErrors, setFieldErrors] = useState(initialFieldErrors)
  const [orderNumber, setOrderNumber] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(false)

  // Business settings loaded from Supabase
  const [businessSettings, setBusinessSettings] = useState({
    whatsapp: SHOP.whatsapp,
    bank: {
      bankName: SHOP.bank.bankName,
      accountName: SHOP.bank.accountName,
      accountNumber: SHOP.bank.accountNumber,
      branch: SHOP.bank.branch,
    },
  })

  const getItemTitle = (item) => item.type === 'custom'
    ? `${t('custom.title')} (${tl('pos', item.print_position)})`
    : item.title

  const closeDrawer = useCallback(() => {
    setIsCartOpen(false)
    setStep('cart')
    onClose?.()
  }, [setIsCartOpen, onClose])

  // Load latest business settings from Supabase
  useEffect(() => {
    const loadBusinessSettings = async () => {
      const { data, error } = await supabase
        .from('business_settings')
        .select('whatsapp, bank_name, account_name, account_number, branch')
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Failed to load business settings:', error)
        return
      }

      if (data) {
        setBusinessSettings({
          whatsapp: data.whatsapp || SHOP.whatsapp,
          bank: {
            bankName: data.bank_name || SHOP.bank.bankName,
            accountName: data.account_name || SHOP.bank.accountName,
            accountNumber: data.account_number || SHOP.bank.accountNumber,
            branch: data.branch || SHOP.bank.branch,
          },
        })
      }
    }

    loadBusinessSettings()
  }, [])

  useEffect(() => {
    let active = true
    const loadAddresses = async () => {
      if (!user?.id) {
        setSavedAddresses([])
        setSelectedAddressId('manual')
        return
      }
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })
      if (!active) return
      if (error) {
        console.error('Saved delivery addresses load error:', error)
        return
      }
      setSavedAddresses(data || [])
      const defaultAddress = (data || []).find((item) => item.is_default)
      if (defaultAddress) {
        setSelectedAddressId(defaultAddress.id)
        setCustomerName((current) => current || defaultAddress.recipient_name)
        setPhone((current) => current || defaultAddress.phone)
        setAddress((current) => current || [defaultAddress.address, defaultAddress.city, defaultAddress.district, defaultAddress.postal_code].filter(Boolean).join(', '))
      }
    }
    void loadAddresses()
    return () => { active = false }
  }, [user?.id])

  useEffect(() => () => {
    if (slipPreviewRef.current) URL.revokeObjectURL(slipPreviewRef.current)
  }, [])

  useEffect(() => {
    if (!drawerIsOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeDrawer()
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [drawerIsOpen, closeDrawer])

  const handleCopy = async (value) => {
    try {
      await navigator.clipboard.writeText(value)
      toast({ message: t('checkout.copied'), type: 'success' })
    } catch {
      toast({ message: t('err.clipboard'), type: 'error' })
    }
  }

  const handleSlipFile = (file) => {
    if (slipPreviewRef.current) URL.revokeObjectURL(slipPreviewRef.current)

    slipPreviewRef.current = ''
    setSlipPreview('')

    if (!file) {
      setSlipFile(null)
      setErrorMsg('')
      return
    }

    const validationError = validateUpload(file)

    setSlipFile(validationError ? null : file)
    setErrorMsg(validationError ? t(validationError) : '')

    if (!validationError && file?.type.startsWith('image/')) {
      slipPreviewRef.current = URL.createObjectURL(file)
      setSlipPreview(slipPreviewRef.current)
    }
  }

  const handleProceedToCheckout = () => {
    if (!user) {
      closeDrawer()
      onOpenAuth?.()
      return
    }

    const metadata = user.user_metadata || {}

    setCustomerName(
      (current) => current || metadata.full_name || metadata.name || ''
    )

    setPhone(
      (current) => current || metadata.phone || ''
    )

    setAddress(
      (current) => current || metadata.address || ''
    )

    setErrorMsg('')
    setStep('details')
  }

  const validateDetails = () => {
    const errors = {
      customerName:
        customerName.trim().length >= 2
          ? ''
          : t('err.nameShort'),

      phone:
        /^(?=.*\d)[+\d\s-]{7,20}$/.test(phone.trim())
          ? ''
          : t('err.phoneFormat'),

      address:
        address.trim().length >= 5
          ? ''
          : t('err.addressShort'),
    }

    setFieldErrors(errors)

    return !Object.values(errors).some(Boolean)
  }

  const handlePlaceOrder = async (event) => {
    event.preventDefault()
    setErrorMsg('')
    setPaymentWarning('')

    const uploadError = paymentMethod === 'bank_transfer'
      ? validateUpload(slipFile, { maxBytes: 8 * 1024 * 1024 })
      : null

    if (uploadError) {
      setErrorMsg(t(uploadError))
      return
    }

    if (!user) {
      setErrorMsg(t('err.login'))
      return
    }

    setSubmitting(true)
    let slipPath = null
    let orderCreated = false

    try {
      if (paymentMethod === 'bank_transfer') {
        slipPath = `${user.id}/${safeFileName(slipFile)}`

        const { error: slipError } = await supabase.storage
          .from('payment-slips')
          .upload(slipPath, slipFile)

        if (slipError) throw slipError
      }

      const items = cart.map((item) => ({
        item_type: item.type,
        product_id: item.product_id || null,
        title: item.title || null,
        image_url: item.image_url || null,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        print_position: item.print_position || null,
        print_locations: Array.isArray(item.print_locations)
          ? item.print_locations.map(({ location, method, size, artwork_path }) => ({ location, method, size, artwork_path }))
          : [],
        design_path: item.design_url || null,
        notes: item.notes || null,
      }))

      const { error: profileError } = await supabase.from('customer_profiles').upsert({
        id: user.id,
        full_name: customerName.trim(),
        phone: phone.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      if (profileError) throw profileError

      const orderPayload = {
        p_customer_name: customerName.trim(),
        p_phone: phone.trim(),
        p_address: address.trim(),
        p_notes: notes.trim(),
        p_slip_path: slipPath,
        p_items: items,
      }
      const { data, error } = paymentMethod === 'cash_on_delivery'
        ? await supabase.rpc('jpf_customer_place_cod_order', {
            p_customer_name: orderPayload.p_customer_name,
            p_phone: orderPayload.p_phone,
            p_address: orderPayload.p_address,
            p_notes: orderPayload.p_notes,
            p_items: orderPayload.p_items,
          })
        : await supabase.rpc('place_order', orderPayload)

      if (error) throw error
      orderCreated = true

      const result = Array.isArray(data) ? data[0] : data

      const idCandidates = []
      const collectIdCandidates = (value) => {
        if (typeof value === 'string') {
          idCandidates.push(value)
        } else if (Array.isArray(value)) {
          value.forEach(collectIdCandidates)
        } else if (value && typeof value === 'object') {
          Object.values(value).forEach(collectIdCandidates)
        }
      }
      collectIdCandidates(result)
      const id = idCandidates.find((candidate) =>
        typeof candidate === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(candidate)
      ) || null

      let checkoutWarnings = []
      if (id) {
        const { error: deliveryFeeError } = await supabase.rpc('jpf_customer_apply_delivery_fee', {
          p_order_id: id,
        })
        if (deliveryFeeError) {
          console.error('Delivery charge save error:', deliveryFeeError)
          checkoutWarnings.push(t('checkout.deliverySaveWarning'))
        }

        const { error: paymentMethodError } = await supabase.rpc('jpf_customer_set_payment_method', {
          p_order_id: id,
          p_payment_method: paymentMethod,
        })
        if (paymentMethodError) {
          console.error('Payment method save error:', paymentMethodError)
          checkoutWarnings.push(t('checkout.methodSaveWarning'))
        } else if (paymentMethod === 'bank_transfer') {
          const { error: paymentDetailsError } = await supabase.rpc('jpf_submit_payment_reference', {
            p_order_id: id,
            p_reference: paymentReference.trim() || null,
          })
          if (paymentDetailsError) {
            console.error('Payment reference submission error:', paymentDetailsError)
            checkoutWarnings.push(t('checkout.receiptReferenceWarning'))
          } else {
            checkoutWarnings.push(t('checkout.receiptSubmitted'))
          }
        } else {
        }
      } else {
        checkoutWarnings.push(t('checkout.methodSaveWarning'))
      }
      setPaymentWarning(checkoutWarnings.join(' '))

      setOrderNumber(
        id ? String(id).slice(0, 8).toUpperCase() : ''
      )
      setCompletedPaymentMethod(paymentMethod)
      setPaymentReference('')
      setPaymentMethod('bank_transfer')

      clearCart()
      handleSlipFile(null)
      setStep('success')

      toast({
        message: t('success.title'),
        type: 'success',
      })
    } catch (error) {
      if (slipPath && !orderCreated) {
        const { error: cleanupError } = await supabase.storage.from('payment-slips').remove([slipPath])
        if (cleanupError) console.error('Could not remove an unlinked payment receipt:', cleanupError)
      }
      setErrorMsg(tError(error))
    } finally {
      setSubmitting(false)
    }
  }

  if (!drawerIsOpen) return null

  const stepIndex = {
    cart: 0,
    details: 1,
    payment: 2,
  }[step] ?? 2

  const checkoutSteps = [
    'step.cart',
    'step.details',
    'step.payment',
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDrawer()
      }}
    >
      <div className="flex h-[100dvh] w-full max-w-md flex-col bg-white shadow-2xl">

        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />

            <h2 className="font-bold text-lg text-gray-900">
              {step === 'success'
                ? t('success.title')
                : step === 'cart'
                  ? t('cart.title')
                  : t('checkout.paymentTitle')}
            </h2>
          </div>

          <button
            type="button"
            onClick={closeDrawer}
            aria-label={t('common.close')}
            className="min-h-11 min-w-11 rounded-full p-2 text-gray-600 hover:bg-gray-100 focus-visible:ring-2 ring-indigo-500"
          >
            <X className="mx-auto h-5 w-5" />
          </button>
        </div>

        {step !== 'success' && (
          <ol className="grid grid-cols-3 gap-2 border-b border-gray-100 px-4 py-3">
            {checkoutSteps.map((key, index) => (
              <li
                key={key}
                className={`rounded-lg py-2 text-center text-xs font-semibold ${
                  stepIndex === index
                    ? 'bg-indigo-50 text-indigo-900'
                    : 'text-gray-600'
                }`}
              >
                {index + 1}. {t(key)}
              </li>
            ))}
          </ol>
        )}

        <div className="flex-1 overflow-y-auto p-4">

          {step === 'success' ? (

            <div className="flex min-h-full flex-col items-center justify-center py-8 text-center">

              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check className="h-9 w-9" />
              </div>

              <h3 className="text-2xl font-bold text-gray-900">
                {t('success.title')}
              </h3>

              <p className="mt-3 text-sm text-gray-700">
                {completedPaymentMethod === 'cash_on_delivery' ? t('checkout.codSuccess') : t('success.body')}
              </p>

              {orderNumber && (
                <p className="mt-3 text-sm font-semibold text-gray-700">
                  #{orderNumber}
                </p>
              )}
              {paymentWarning && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{paymentWarning}</p>}

              <div className="mt-6 flex w-full flex-col gap-3">

                <button
                  type="button"
                  onClick={() => {
                    closeDrawer()
                    onOrderSuccess?.()
                  }}
                  className="min-h-12 rounded-xl bg-black px-4 py-3 font-semibold text-white focus-visible:ring-2 ring-indigo-500"
                >
                  {t('success.cta')}
                </button>

                <a
                  href={`https://wa.me/${businessSettings.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-12 rounded-xl border border-gray-300 px-4 py-3 font-semibold text-gray-900 focus-visible:ring-2 ring-indigo-500"
                >
                  {t('success.whatsapp')}
                </a>

              </div>
            </div>

          ) : cart.length === 0 ? (

            <div className="flex h-full flex-col items-center justify-center py-12 text-center text-gray-700">

              <ShoppingBag className="mb-3 h-12 w-12 text-gray-400" />

              <p className="font-semibold">
                {t('cart.empty')}
              </p>

              <p className="mt-1 text-sm">
                {t('cart.emptyHint')}
              </p>

              <button
                type="button"
                onClick={closeDrawer}
                className="mt-5 min-h-11 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white focus-visible:ring-2 ring-indigo-500"
              >
                {t('cart.continue')}
              </button>

            </div>

          ) : step === 'cart' ? (

            <div className="space-y-3">

              {cart.map((item) => (

                <article
                  key={item.cartItemId}
                  className="flex gap-3 rounded-2xl border border-gray-200 p-3"
                >

                  <div className="min-w-0 flex-1">

                    <h3 className="font-semibold text-gray-900">
                      {getItemTitle(item)}
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      {item.color} / {item.size}
                    </p>

                    {item.notes && (
                      <p className="mt-1 text-xs text-gray-500">
                        {item.notes}
                      </p>
                    )}

                    {item.print_locations?.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs text-gray-600">
                        {item.print_locations.map((location, index) => (
                          <div key={`${location.location}-${index}`} className="flex flex-wrap items-center gap-x-1">
                            <span className="font-semibold text-gray-800">{location.location}:</span>
                            <span>{location.method} · {location.size}</span>
                            {location.artwork_path && <button type="button" onClick={() => void openPrivateFile('customer-designs', location.artwork_path, () => toast({ message: t('err.generic'), type: 'error' }))} className="font-semibold text-indigo-700 underline">View artwork</button>}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between gap-3">

                      <div className="flex items-center rounded-lg border border-gray-200">

                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              item.cartItemId,
                              Math.max(1, item.quantity - 1)
                            )
                          }
                          className="min-h-10 min-w-10 p-2"
                        >
                          <Minus className="mx-auto h-4 w-4" />
                        </button>

                        <span className="min-w-8 text-center text-sm font-semibold">
                          {item.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              item.cartItemId,
                              item.quantity + 1
                            )
                          }
                          className="min-h-10 min-w-10 p-2"
                        >
                          <Plus className="mx-auto h-4 w-4" />
                        </button>

                      </div>

                      <div className="text-right">

                        <p className="font-bold text-gray-900">
                          {formatPrice(
                            (Number(item.unit_price) ||
                              Number(item.price) ||
                              0) *
                              item.quantity
                          )}
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            removeFromCart(item.cartItemId)
                          }
                          className="mt-1 text-xs font-medium text-red-600"
                        >
                          <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                          Remove
                        </button>

                      </div>

                    </div>
                  </div>

                </article>

              ))}

            </div>

          ) : step === 'details' ? (

            <form
              id="checkout-details"
              onSubmit={(event) => {
                event.preventDefault()

                if (validateDetails()) {
                  setStep('payment')
                }
              }}
              className="space-y-4"
            >

              <h3 className="text-lg font-bold text-gray-900">
                {t('checkout.detailsTitle')}
              </h3>

              <div>
                {savedAddresses.length > 0 && (
                  <label htmlFor="checkout-saved-address" className="mb-1.5 block text-sm font-semibold text-gray-800">Saved delivery address</label>
                )}
                {savedAddresses.length > 0 && (
                  <select id="checkout-saved-address" value={selectedAddressId} onChange={(event) => {
                    const nextId = event.target.value
                    setSelectedAddressId(nextId)
                    const selectedAddress = savedAddresses.find((item) => item.id === nextId)
                    if (selectedAddress) {
                      setCustomerName(selectedAddress.recipient_name)
                      setPhone(selectedAddress.phone)
                      setAddress([selectedAddress.address, selectedAddress.city, selectedAddress.district, selectedAddress.postal_code].filter(Boolean).join(', '))
                    }
                  }} className="mb-3 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-base focus-visible:ring-2 ring-indigo-500">
                    <option value="manual">Enter a different address</option>
                    {savedAddresses.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.address}, {item.city}</option>)}
                  </select>
                )}
                <label
                  htmlFor="checkout-name"
                  className="mb-1.5 block text-sm font-semibold text-gray-800"
                >
                  {t('checkout.name')}
                </label>

                <input
                  id="checkout-name"
                  type="text"
                  autoComplete="name"
                  required
                  value={customerName}
                  onChange={(event) =>
                    setCustomerName(event.target.value)
                  }
                  aria-invalid={Boolean(fieldErrors.customerName)}
                  className="min-h-12 w-full rounded-xl border border-gray-300 px-3 py-2 text-base focus-visible:ring-2 ring-indigo-500"
                />

                {fieldErrors.customerName && (
                  <p className="mt-1 text-sm text-red-700">
                    {fieldErrors.customerName}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="checkout-phone"
                  className="mb-1.5 block text-sm font-semibold text-gray-800"
                >
                  {t('checkout.phone')}
                </label>

                <input
                  id="checkout-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value)
                  }
                  aria-invalid={Boolean(fieldErrors.phone)}
                  className="min-h-12 w-full rounded-xl border border-gray-300 px-3 py-2 text-base focus-visible:ring-2 ring-indigo-500"
                />

                {fieldErrors.phone && (
                  <p className="mt-1 text-sm text-red-700">
                    {fieldErrors.phone}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="checkout-address"
                  className="mb-1.5 block text-sm font-semibold text-gray-800"
                >
                  {t('checkout.address')}
                </label>

                <textarea
                  id="checkout-address"
                  rows={3}
                  autoComplete="street-address"
                  required
                  value={address}
                  onChange={(event) =>
                    (setSelectedAddressId('manual'), setAddress(event.target.value))
                  }
                  aria-invalid={Boolean(fieldErrors.address)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base focus-visible:ring-2 ring-indigo-500"
                />

                {fieldErrors.address && (
                  <p className="mt-1 text-sm text-red-700">
                    {fieldErrors.address}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="checkout-notes"
                  className="mb-1.5 block text-sm font-semibold text-gray-800"
                >
                  {t('checkout.notes')}
                </label>

                <textarea
                  id="checkout-notes"
                  rows={2}
                  value={notes}
                  onChange={(event) =>
                    setNotes(event.target.value)
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base focus-visible:ring-2 ring-indigo-500"
                />
              </div>

            </form>

          ) : (

            <form
              id="checkout-payment"
              onSubmit={handlePlaceOrder}
              className="space-y-4"
            >

              <h3 className="text-lg font-bold text-gray-900">
                {t('checkout.paymentTitle')}
              </h3>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-semibold text-gray-800">{t('checkout.choosePayment')}</legend>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${paymentMethod === 'bank_transfer' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
                  <input type="radio" name="payment-method" value="bank_transfer" checked={paymentMethod === 'bank_transfer'} onChange={() => { setPaymentMethod('bank_transfer'); setErrorMsg(''); setPaymentWarning('') }} className="mt-1 accent-indigo-600" />
                  <span><span className="block text-sm font-semibold text-gray-900">{t('payment.bank_transfer')}</span><span className="mt-0.5 block text-xs text-gray-600">{t('checkout.bankHint')}</span></span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${paymentMethod === 'cash_on_delivery' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
                  <input type="radio" name="payment-method" value="cash_on_delivery" checked={paymentMethod === 'cash_on_delivery'} onChange={() => { setPaymentMethod('cash_on_delivery'); setErrorMsg(''); setPaymentWarning(''); setPaymentReference(''); handleSlipFile(null) }} className="mt-1 accent-indigo-600" />
                  <span><span className="block text-sm font-semibold text-gray-900">{t('payment.cash_on_delivery')}</span><span className="mt-0.5 block text-xs text-gray-600">{t('checkout.codHint')}</span></span>
                </label>
              </fieldset>

              {paymentMethod === 'bank_transfer' ? <>
                <div>
                  <label htmlFor="payment-reference" className="mb-1.5 block text-sm font-semibold text-gray-800">Bank transfer reference (optional)</label>
                  <input id="payment-reference" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength={120} autoComplete="off" className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-base focus-visible:ring-2 ring-indigo-500" />
                </div>

                <div className="space-y-2 rounded-2xl bg-gray-900 p-4 text-sm text-white">

                <h4 className="font-bold text-base text-amber-200">
                  {t('checkout.bankTitle')}
                </h4>

                {[
                  [
                    t('checkout.bank'),
                    businessSettings.bank.bankName,
                  ],
                  [
                    t('checkout.accountName'),
                    businessSettings.bank.accountName,
                  ],
                  [
                    t('checkout.accountNumber'),
                    businessSettings.bank.accountNumber,
                  ],
                  [
                    t('checkout.branch'),
                    businessSettings.bank.branch,
                  ],
                ].map(([label, value]) => (

                  <div
                    key={label}
                    className="flex items-center justify-between gap-2"
                  >

                    <p className="min-w-0 break-words">
                      {label}:{' '}
                      <span className="font-semibold">
                        {value}
                      </span>
                    </p>

                    <button
                      type="button"
                      onClick={() => handleCopy(value)}
                      aria-label={`${t('checkout.copy')} ${label}`}
                      className="flex min-h-10 shrink-0 items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 hover:bg-white/25 focus-visible:ring-2 ring-indigo-400"
                    >
                      <Copy className="h-4 w-4" />
                      {t('checkout.copy')}
                    </button>

                  </div>

                ))}

                <p className="border-t border-white/20 pt-2 text-lg font-bold text-emerald-200">
                  {t('checkout.totalPay')}: {formatPrice(orderTotal)}
                </p>

                </div>
              </> : (
                <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p className="font-semibold">{t('checkout.codAmountDue')}</p>
                  <p className="border-t border-emerald-200 pt-2 text-base font-bold">{formatPrice(orderTotal)}</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setSummaryOpen((open) => !open)}
                aria-expanded={summaryOpen}
                className="flex min-h-11 w-full items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold focus-visible:ring-2 ring-indigo-500"
              >
                {t('checkout.summary')}

                {summaryOpen
                  ? <ChevronUp className="h-4 w-4" />
                  : <ChevronDown className="h-4 w-4" />
                }
              </button>

              {summaryOpen && (
                <div className="space-y-2 rounded-xl bg-gray-50 p-3">

                  {cart.map((item) => (

                    <div
                      key={item.cartItemId}
                      className="flex justify-between gap-2 text-sm"
                    >

                      <span className="min-w-0 break-words">
                        {getItemTitle(item)} × {item.quantity}
                      </span>

                      <span className="shrink-0">
                        {formatPrice(
                          (Number(item.unit_price) ||
                            Number(item.price) ||
                            0) *
                            item.quantity
                        )}
                      </span>

                    </div>

                  ))}

                  <div className="flex justify-between gap-2 border-t border-gray-200 pt-2 text-sm">
                    <span>{t('checkout.subtotal')}</span>
                    <span>{formatPrice(totalAmount)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-sm">
                    <span>{t('checkout.deliveryFee')}</span>
                    <span>{deliveryFee > 0 ? formatPrice(deliveryFee) : t('checkout.freeDelivery')}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-sm font-bold">
                    <span>{t('checkout.orderTotal')}</span>
                    <span>{formatPrice(orderTotal)}</span>
                  </div>

                </div>
              )}

              {paymentMethod === 'bank_transfer' && <div>

                <label
                  htmlFor="payment-slip"
                  className="mb-1.5 block text-sm font-semibold text-gray-800"
                >
                  {t('checkout.slip')}
                </label>

                <label
                  htmlFor="payment-slip"
                  className="flex min-h-14 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center hover:border-gray-600"
                >

                  {slipPreview ? (
                    <img
                      src={slipPreview}
                      alt={t('checkout.slip')}
                      className="max-h-40 max-w-full rounded-lg object-contain"
                    />
                  ) : (
                    <Upload className="h-6 w-6 text-gray-600" />
                  )}

                  <span className="text-sm font-medium text-gray-800">
                    {slipFile?.name || t('checkout.slipChoose')}
                  </span>

                </label>

                <input
                  id="payment-slip"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) =>
                    handleSlipFile(
                      event.target.files?.[0] || null
                    )
                  }
                  className="sr-only"
                />

              </div>}

              {errorMsg && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
                >
                  {errorMsg}
                </p>
              )}

            </form>

          )}

        </div>

        {step !== 'success' && cart.length > 0 && (

          <div className="space-y-3 border-t border-gray-200 bg-gray-50 p-4">

            <div className="space-y-1.5 text-sm text-gray-700">
              <div className="flex items-center justify-between gap-3">
                <span>{t('checkout.subtotal')}</span>
                <span>{formatPrice(totalAmount)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{t('checkout.deliveryFee')}</span>
                <span>{deliveryFee > 0 ? formatPrice(deliveryFee) : t('checkout.freeDelivery')}</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
                <span>{t('checkout.orderTotal')}</span>
                <span>{formatPrice(orderTotal)}</span>
              </div>
            </div>

            {step === 'cart' ? (

              <button
                type="button"
                onClick={handleProceedToCheckout}
                className="min-h-12 w-full rounded-xl bg-gray-900 py-3 font-semibold text-white hover:bg-gray-800 focus-visible:ring-2 ring-indigo-500"
              >
                {user
                  ? t('cart.checkout')
                  : t('cart.loginToCheckout')}
              </button>

            ) : step === 'details' ? (

              <div className="flex gap-2">

                <button
                  type="button"
                  onClick={() => setStep('cart')}
                  className="min-h-12 flex-1 rounded-xl border border-gray-300 py-3 font-semibold text-gray-900 focus-visible:ring-2 ring-indigo-500"
                >
                  {t('checkout.back')}
                </button>

                <button
                  type="submit"
                  form="checkout-details"
                  className="min-h-12 flex-1 rounded-xl bg-black py-3 font-semibold text-white focus-visible:ring-2 ring-indigo-500"
                >
                  {t('checkout.next')}
                </button>

              </div>

            ) : (

              <div className="flex gap-2">

                <button
                  type="button"
                  onClick={() => setStep('details')}
                  disabled={submitting}
                  className="min-h-12 rounded-xl border border-gray-300 px-4 py-3 font-semibold text-gray-900 disabled:opacity-50 focus-visible:ring-2 ring-indigo-500"
                >
                  {t('checkout.back')}
                </button>

                <button
                  type="submit"
                  form="checkout-payment"
                  disabled={submitting}
                  className="min-h-12 flex-1 rounded-xl bg-black px-3 py-3 font-semibold text-white disabled:opacity-50 focus-visible:ring-2 ring-indigo-500"
                >
                  {submitting
                    ? t('checkout.placing')
                    : t('checkout.place')}
                </button>

              </div>

            )}

          </div>

        )}

      </div>
    </div>
  )
}
