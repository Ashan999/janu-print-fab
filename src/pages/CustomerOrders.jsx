import { useEffect, useState } from 'react'
import { Package, ExternalLink, Shirt, Printer, RotateCcw, Ban, Truck } from 'lucide-react'
import { openPrivateFile, supabase } from '../lib/supabase'
import { useLang } from '../i18n/LanguageContext'
import { useToast } from '../components/ToastContext'
import { formatPrice, SHOP } from '../config'
import { useCart } from '../context/CartContext'
import { getPricingRules, calculateProductPrice } from '../lib/pricing'
import { getOrderItemDisplayTitle, getOrderItemPrintLocations, getOrderItemPrintRequirements } from '../lib/orderPrintDetails'

const ORDER_STATUSES = [
  'Pending Verification',
  'Payment Verified',
  'Printing',
  'Shipped',
  'Completed',
]

function StatusStepper({ status, t, tl }) {
  const normalizedStatus = String(status || '').toLowerCase()
  const statusAliases = {
    pending: 'Pending Verification',
    'pending verification': 'Pending Verification',
    'payment verified': 'Payment Verified',
    printing: 'Printing',
    shipped: 'Shipped',
    completed: 'Completed',
  }
  const index = ORDER_STATUSES.indexOf(statusAliases[normalizedStatus] || status)
  const activeIndex = index < 0 ? 0 : index
  const percentage = (activeIndex / (ORDER_STATUSES.length - 1)) * 100

  return (
    <div aria-label={`${t('orders.status')}: ${tl('status', status)}`}>
      <p className="mb-2 text-sm font-semibold text-gray-800 md:hidden">{tl('status', status)}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 md:hidden">
        <div className="h-full rounded-full bg-indigo-600" style={{ width: `${percentage}%` }} />
      </div>
      <ol className="hidden items-start md:flex">
        {ORDER_STATUSES.map((step, stepIndex) => (
          <li key={step} className="relative flex-1 text-center">
            {stepIndex > 0 && (
              <span className={`absolute left-0 right-1/2 top-3 h-0.5 ${stepIndex <= activeIndex ? 'bg-indigo-600' : 'bg-gray-200'}`} />
            )}
            {stepIndex < ORDER_STATUSES.length - 1 && (
              <span className={`absolute left-1/2 right-0 top-3 h-0.5 ${stepIndex < activeIndex ? 'bg-indigo-600' : 'bg-gray-200'}`} />
            )}
            <span className={`relative mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              stepIndex <= activeIndex ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}>
              {stepIndex < activeIndex ? '✓' : stepIndex + 1}
            </span>
            <span className={`mt-2 block px-1 text-xs ${stepIndex === activeIndex ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
              {tl('status', step)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function CustomerOrders({ user, onOpenAuth, onGoToGallery }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const { t, tl, tError, lang } = useLang()
  const toast = useToast()
  const { addToCart, setIsCartOpen } = useCart()
  const [cancellingId, setCancellingId] = useState(null)

  useEffect(() => {
    let active = true
    const fetchMyOrders = async () => {
      if (!user) {
        setOrders([])
        setLoading(false)
        return
      }
      setLoading(true)
      let { data, error } = await supabase
        .from('orders')
        .select('*, order_items (*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error && String(error.message || '').toLowerCase().includes('user_id')) {
        const fallback = await supabase
          .from('orders')
          .select('*, order_items (*)')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })
        data = fallback.data
        error = fallback.error
      }
      if (!active) return
      if (error) toast({ message: tError(error), type: 'error' })
      else setOrders(data || [])
      setLoading(false)
    }

    void fetchMyOrders()
    return () => { active = false }
  }, [user, toast, tError])

  const viewPrivateFile = async (bucket, path) => {
    await openPrivateFile(bucket, path, () => toast({ message: t('err.generic'), type: 'error' }))
  }

  const cancelOrder = async (order) => {
    setCancellingId(order.id)
    const { error } = await supabase.rpc('jpf_customer_cancel_order', { p_order_id: order.id })
    if (error) toast({ message: error.message, type: 'error' })
    else {
      setOrders((current) => current.map((item) => item.id === order.id
        ? { ...item, status: 'Cancelled', shipping_status: 'cancelled' }
        : item))
      toast({ message: 'Your order was cancelled.', type: 'success' })
    }
    setCancellingId(null)
  }

  const printInvoice = (order) => {
    const invoiceWindow = window.open('', '_blank', 'width=800,height=900')
    if (!invoiceWindow) {
      toast({ message: 'Allow pop-ups to print your invoice.', type: 'error' })
      return
    }
    invoiceWindow.opener = null
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
    const rows = (order.order_items || []).map((item) => {
      const title = getOrderItemDisplayTitle(item) || (item.item_type === 'custom' ? 'Custom print' : 'Printed T-shirt')
      const printDetails = getOrderItemPrintRequirements(item)
      const details = [item.color, item.size, printDetails || item.print_position].filter(Boolean).join(' · ')
      const unitPrice = Number(item.unit_price ?? item.price) || 0
      return `<tr><td>${escapeHtml(title)}<small>${escapeHtml(details)}</small></td><td>${Number(item.quantity) || 0}</td><td>${escapeHtml(formatPrice(unitPrice))}</td><td>${escapeHtml(formatPrice(unitPrice * (Number(item.quantity) || 0)))}</td></tr>`
    }).join('')
    const total = order.pricing_snapshot?.total_price ?? order.total_amount
    invoiceWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(order.id)}</title><style>body{font:15px Arial,sans-serif;color:#111827;max-width:760px;margin:40px auto;padding:0 20px}header{border-bottom:2px solid #111827;padding-bottom:18px;display:flex;justify-content:space-between;gap:20px}h1{margin:0;font-size:24px}p{line-height:1.5;color:#4b5563}table{width:100%;border-collapse:collapse;margin-top:30px}th,td{text-align:left;border-bottom:1px solid #e5e7eb;padding:12px 8px}th{font-size:12px;text-transform:uppercase;color:#6b7280}small{display:block;margin-top:5px;color:#6b7280}.total{text-align:right;margin-top:22px;font-size:20px;font-weight:bold}@media print{body{margin:0 auto}}</style></head><body><header><div><h1>Janu Print FAB</h1><p>Order invoice</p></div><div><strong>Order #${escapeHtml(String(order.id).slice(0, 8).toUpperCase())}</strong><p>${escapeHtml(new Date(order.created_at).toLocaleDateString('en-LK'))}</p></div></header><p><strong>Customer:</strong> ${escapeHtml(order.customer_name || '')}<br><strong>Phone:</strong> ${escapeHtml(order.phone || order.customer_phone || '')}<br><strong>Delivery:</strong> ${escapeHtml(order.address || order.shipping_address || '')}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><p><strong>Payment status:</strong> ${escapeHtml(order.payment_status || 'pending')}</p><div class="total">Total: ${escapeHtml(formatPrice(total))}</div><script>window.onload=()=>window.print()</script></body></html>`)
    invoiceWindow.document.close()
  }

  const reorder = async (order) => {
    const orderItems = order.order_items || []
    const productIds = [...new Set(orderItems.map((item) => item.product_id).filter(Boolean))]
    const [productResult, pricingResult] = await Promise.all([
      productIds.length ? supabase.from('products').select('*').in('id', productIds) : Promise.resolve({ data: [], error: null }),
      getPricingRules(),
    ])
    const products = new Map((productResult.data || []).map((product) => [String(product.id), product]))
    const rules = pricingResult.rules || []
    let skipped = 0
    for (const item of orderItems) {
      const type = item.item_type || item.type || 'gallery'
      const product = item.product_id ? products.get(String(item.product_id)) : null
      const availableSizes = product?.available_sizes || []
      if (type !== 'custom' && (!product || product.is_active === false || !availableSizes.includes(item.size))) {
        skipped += 1
        continue
      }
      if (type === 'custom' && !(item.design_path || item.design_url || item.custom_design_url)) {
        skipped += 1
        continue
      }
      const printLocations = getOrderItemPrintLocations(item)
      const quote = calculateProductPrice({
        itemType: type,
        productId: product?.id ?? null,
        basePrice: product?.price ?? 0,
        rules,
        tShirtType: product?.shirt_type,
        printLocations,
      })
      const currentQuoteAvailable = Number(quote.price) > 0
      addToCart({
        type,
        product_id: item.product_id || null,
        title: product?.title || getOrderItemDisplayTitle(item) || 'Custom print',
        image_url: product?.image_url || item.image_url || null,
        color: item.color || 'Black',
        size: item.size || '',
        quantity: Math.max(1, Number(item.quantity) || 1),
        print_position: item.print_position || null,
        print_locations: printLocations,
        design_url: item.design_path || item.design_url || item.custom_design_url || null,
        unit_price: currentQuoteAvailable ? quote.price : (Number.isFinite(Number(item.unit_price ?? item.price)) ? Number(item.unit_price ?? item.price) : 0),
        price_snapshot: currentQuoteAvailable ? quote : item.price_snapshot || null,
        t_shirt_type: product?.shirt_type || null,
        pricing_source: currentQuoteAvailable ? 'current_rules' : 'reorder_snapshot',
      })
    }
    if (skipped) toast({ message: `${skipped} item${skipped === 1 ? '' : 's'} could not be restored because the product or artwork is no longer available.`, type: 'error' })
    if (orderItems.length > skipped) {
      setIsCartOpen(true)
      toast({ message: 'Items from this order were added to your cart. Review current pricing and artwork before checkout.', type: 'success' })
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-gray-700">{t('orders.loginPrompt')}</p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="mt-4 min-h-11 rounded-xl bg-black px-5 py-3 font-semibold text-white focus-visible:ring-2 ring-indigo-500"
        >
          {t('nav.login')}
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t('orders.title')}</h1>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((number) => (
            <div key={number} className="h-48 animate-pulse rounded-2xl border border-gray-200 bg-white" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-700">
          <Package className="mx-auto mb-3 h-12 w-12 text-gray-400" />
          <p className="font-medium">{t('orders.empty')}</p>
          <button
            type="button"
            onClick={onGoToGallery}
            className="mt-4 min-h-11 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white focus-visible:ring-2 ring-indigo-500"
          >
            {t('nav.gallery')}
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {orders.map((order) => {
            const slipPath = order.payment_slip_path || order.payment_slip_url || order.payment_receipt_url
            const normalizedStatus = String(order.status || '').toLowerCase()
            const canCancel = !['printing', 'shipped', 'completed', 'cancelled', 'canceled'].includes(normalizedStatus)
            const whatsappText = `Hello Janu Print FAB, I need help with order #${String(order.id).slice(0, 8).toUpperCase()}.`
            return (
              <article key={order.id} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {t('orders.orderNo')} #{String(order.id).slice(0, 8).toUpperCase()}
                    </p>
                    <p className="mt-1 text-sm text-gray-700">
                      {new Date(order.created_at).toLocaleDateString(lang === 'si' ? 'si-LK' : 'en-LK')}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-gray-600">Items: {formatPrice(order.pricing_snapshot?.subtotal ?? (order.order_items || []).reduce((sum, item) => sum + (Number(item.unit_price || item.price) || 0) * (Number(item.quantity) || 1), 0))}</p>
                    <p className="text-gray-600">Delivery: {formatPrice(order.delivery_fee ?? order.pricing_snapshot?.delivery_fee ?? 0)}</p>
                    <p className="font-bold text-gray-900">{t('orders.total')}: {formatPrice(order.pricing_snapshot?.total_price ?? order.total_amount)}</p>
                  </div>
                </header>

                {normalizedStatus.includes('cancel') ? <p className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">Order cancelled</p> : <StatusStepper status={order.status || 'Pending Verification'} t={t} tl={tl} />}
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-amber-50 px-3 py-1.5 font-semibold text-amber-900">Payment: {String(order.payment_status || 'pending').replaceAll('_', ' ')}</span>
                  <span className="rounded-full bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-900">{t('orders.paymentMethod')}: {t(`payment.${order.payment_method || 'bank_transfer'}`)}</span>
                  <span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-900">Delivery: {String(order.shipping_status || order.status || 'not_ready').replaceAll('_', ' ')}</span>
                </div>

                <section className="space-y-2">
                  <h2 className="text-sm font-semibold text-gray-800">{t('orders.items')}</h2>
                  {order.order_items?.map((item) => {
                    const designPath = item.design_path || item.design_url || item.custom_design_url
                    const printLocations = getOrderItemPrintLocations(item)
                    const printRequirements = getOrderItemPrintRequirements(item)
                    return (
                      <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 p-3">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.title || ''} loading="lazy" decoding="async" className="h-14 w-14 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white">
                            <Shirt className="h-6 w-6 text-gray-500" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-semibold text-gray-900">
                            {(item.item_type || item.type) === 'custom'
                              ? `${t('custom.title')} (${tl('pos', item.print_position)})`
                              : item.title || t('custom.title')}
                          </p>
                          <p className="mt-1 text-sm text-gray-700">
                            {tl('color', item.color)} · {t('product.size')}: {item.size} · ×{item.quantity}
                            {item.print_position ? ` · ${tl('pos', item.print_position)}` : ''}
                          </p>
                          {printRequirements && <p className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900">Print area / method / size: {printRequirements}</p>}
                          {designPath && (
                            <button
                              type="button"
                              onClick={() => viewPrivateFile('customer-designs', designPath)}
                              className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-indigo-700 hover:underline focus-visible:ring-2 ring-indigo-500"
                            >
                              {t('orders.viewDesign')} <ExternalLink className="h-4 w-4" />
                            </button>
                          )}
                          {printLocations.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{printLocations.map((location, index) => <span key={`${location.location}-${index}`} className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700">{location.location} · {location.method} · {location.size}{Number.isFinite(Number(location.price)) && <span>· {formatPrice(location.price)}</span>}{location.artwork_path && <button type="button" onClick={() => viewPrivateFile('customer-designs', location.artwork_path)} className="font-semibold text-indigo-700 underline">Artwork</button>}</span>)}</div>}
                        </div>
                        <span className="font-semibold text-gray-900">
                          {formatPrice(Number(item.unit_price || item.price) * item.quantity)}
                        </span>
                      </div>
                    )
                  })}
                </section>

                <footer className="flex flex-wrap items-end justify-between gap-3 border-t border-gray-100 pt-3">
                  <div className="text-sm text-gray-700">
                    <p className="font-semibold">{t('orders.delivery')}: {order.customer_name} ({order.phone || order.customer_phone})</p>
                    <p className="mt-1 break-words">{order.address || order.shipping_address}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                  {slipPath && (
                    <button
                      type="button"
                      onClick={() => viewPrivateFile('payment-slips', slipPath)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-200 focus-visible:ring-2 ring-indigo-500"
                    >
                      {t('orders.viewSlip')} <ExternalLink className="h-4 w-4" />
                    </button>
                  )}
                  {order.courier_name && <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm"><p className="flex items-center gap-1 font-semibold text-gray-900"><Truck className="h-4 w-4" />{order.courier_name}</p>{order.tracking_number && <p className="mt-1 text-gray-700">Tracking: {order.tracking_number}</p>}{order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold text-indigo-700">Track shipment <ExternalLink className="h-3.5 w-3.5" /></a>}</div>}
                  </div>
                </footer>
                <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  <button type="button" onClick={() => printInvoice(order)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold text-gray-800"><Printer className="h-4 w-4" /> Invoice</button>
                  <button type="button" onClick={() => void reorder(order)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold text-gray-800"><RotateCcw className="h-4 w-4" /> Reorder</button>
                  <a href={`https://wa.me/${SHOP.whatsapp}?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold text-gray-800">Contact support</a>
                  {canCancel && <button type="button" disabled={cancellingId === order.id} onClick={() => void cancelOrder(order)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 disabled:opacity-50"><Ban className="h-4 w-4" />{cancellingId === order.id ? 'Cancelling…' : 'Cancel order'}</button>}
                  {!canCancel && normalizedStatus === 'printing' && <span className="self-center text-sm text-gray-600">Your order has entered production and can no longer be changed.</span>}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
