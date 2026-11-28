import { useEffect, useState } from 'react'
import { openPrivateFile, safeFileName, supabase, validateUpload } from '../lib/supabase'
import PricingManager from './PricingManager'
import KeywordEditor from '../components/KeywordEditor'
import { normalizeKeywords } from '../lib/productKeywords'
import { getOrderItemDisplayTitle, getOrderItemPrintRequirements } from '../lib/orderPrintDetails'
import { SHOP } from '../config'
import {
  Plus,
  Trash2,
  ExternalLink,
  Package,
  Image as ImageIcon,
  ShieldAlert,
  SlidersHorizontal,
  DollarSign,
  Clock3,
  Shirt,
  ShoppingBag,
  BarChart3,
  Search,
  Pencil,
  Phone,
  X,
  Download,
  Settings,
  Eye,
  Truck,
} from 'lucide-react'

const ALL_SIZES = ['S', 'M', 'L', 'XL', 'XXL']

// Stable product code generated from product UUID.
const getProductCode = (productId) => {
  const cleanId = String(productId || '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()

  return cleanId
    ? `JPF-TS-${cleanId.slice(0, 6)}`
    : 'JPF-TS-NEW'
}

const ORDER_STATUSES = [
  'Pending Verification',
  'Payment Verified',
  'Printing',
  'Shipped',
  'Completed',
]

function getOrderAnalytics(orders) {
  const validOrders = orders.filter(
    (order) =>
      !['cancelled', 'canceled'].includes(
        String(order.status || '').toLowerCase()
      )
  )

  const items = validOrders.flatMap((order) =>
    (Array.isArray(order.order_items)
      ? order.order_items
      : []
    ).map((item) => ({
      ...item,
      quantity: Math.max(0, Number(item.quantity) || 0),
    }))
  )

  const itemCountBy = (selector) => {
    const counts = new Map()

    items.forEach((item) => {
      const label = selector(item)

      if (label) {
        counts.set(
          label,
          (counts.get(label) || 0) + item.quantity
        )
      }
    })

    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1]
    )
  }

  const sizeCounts = new Map(
    ALL_SIZES.map((size) => [size, 0])
  )

  items.forEach((item) => {
    const size = String(item.size || '').trim()

    if (size) {
      sizeCounts.set(
        size,
        (sizeCounts.get(size) || 0) + item.quantity
      )
    }
  })

  const customItems = items.filter(
    (item) =>
      (item.item_type || item.type) === 'custom'
  )

  const galleryItems = items.filter(
    (item) =>
      (item.item_type || item.type) === 'gallery'
  )

  const totalUnits = items.reduce(
    (sum, item) => sum + item.quantity,
    0
  )

  const totalRevenue = validOrders.reduce(
    (sum, order) => {
      const amount = Number(order.total_amount)

      return (
        sum +
        (Number.isFinite(amount) ? amount : 0)
      )
    },
    0
  )

  return {
    totalRevenue,
    totalOrders: validOrders.length,

    pendingOrders: validOrders.filter(
      (order) =>
        String(order.status || '').toLowerCase() ===
        'pending verification'
    ).length,

    customCount: customItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    ),

    galleryCount: galleryItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    ),

    totalUnits,

    sizes: [...sizeCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    ),

    colors: itemCountBy(
      (item) =>
        String(item.color || '').trim()
    ),

    products: itemCountBy((item) => {
      if (
        (item.item_type || item.type) !== 'gallery'
      ) {
        return null
      }

      return (
        item.title ||
        item.product_title ||
        item.product_id ||
        'Untitled product'
      )
    }),

    positions: itemCountBy((item) => {
      if (
        (item.item_type || item.type) !== 'custom'
      ) {
        return null
      }

      return item.print_position
    }),

    hasOrders: validOrders.length > 0,
  }
}

function AnalyticsBarList({
  title,
  rows,
  total,
  emptyMessage,
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-900">
        {title}
      </h3>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 mt-4">
          {emptyMessage}
        </p>
      ) : (
        <div className="space-y-4 mt-4">
          {rows.slice(0, 5).map(
            ([label, count]) => {
              const percentage =
                total > 0
                  ? (count / total) * 100
                  : 0

              return (
                <div key={label}>
                  <div className="flex items-center justify-between gap-3 text-sm mb-1.5">
                    <span className="text-gray-700 truncate">
                      {label}
                    </span>

                    <span className="text-gray-500 whitespace-nowrap">
                      {count} ·{' '}
                      {Math.round(percentage)}%
                    </span>
                  </div>

                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full"
                      style={{
                        width: `${percentage}%`,
                      }}
                    />
                  </div>
                </div>
              )
            }
          )}
        </div>
      )}
    </section>
  )
}

export default function AdminDashboard({
  isAdmin = false,
}) {
  const [tab, setTab] = useState('dashboard')

  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [productPrintConfigs, setProductPrintConfigs] = useState({})
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null)
  const [shopSettings, setShopSettings] = useState({
    contact_phone: SHOP.whatsapp,
    whatsapp_number: SHOP.whatsapp,
    delivery_fee: '0',
  })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [deliverySaving, setDeliverySaving] = useState(false)

  // Order filters
  const [orderSearch, setOrderSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // New Product Form States
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Graphic')
  const [audience, setAudience] = useState('Male')
  const [shirtType, setShirtType] =
    useState('Crew neck')
  const [ageGroup, setAgeGroup] = useState('Adults (20+ yrs)')
  const [price, setPrice] = useState('')
  const [keywords, setKeywords] = useState([])
  const [isProductActive, setIsProductActive] = useState(true)
  const [selectedSizes, setSelectedSizes] =
    useState(['S', 'M', 'L', 'XL', 'XXL'])

  const [imageFile, setImageFile] =
    useState(null)
  const [additionalImageFiles, setAdditionalImageFiles] = useState([])
  const [existingProductImages, setExistingProductImages] = useState([])
  const [editingProduct, setEditingProduct] = useState(null)
  const [existingImageUrl, setExistingImageUrl] = useState('')
  const [existingFrontArtworkUrl, setExistingFrontArtworkUrl] = useState(null)
  const [existingBackArtworkUrl, setExistingBackArtworkUrl] = useState(null)

  const [printType, setPrintType] =
    useState('single_side')
  const [frontPrintSize, setFrontPrintSize] =
    useState('A4')
  const [backPrintSize, setBackPrintSize] =
    useState('A4')
  const [frontArtworkFile, setFrontArtworkFile] =
    useState(null)
  const [backArtworkFile, setBackArtworkFile] =
    useState(null)

  const [uploading, setUploading] =
    useState(false)

  const [productSearch, setProductSearch] =
    useState('')
  const [shipmentDrafts, setShipmentDrafts] = useState({})

  useEffect(() => {
    if (isAdmin) {
      fetchAllData()
      void loadShopSettings()
    }
  }, [isAdmin])

  const loadShopSettings = async () => {
    const { data, error } = await supabase
      .from('shop_settings')
      .select('contact_phone, whatsapp_number, delivery_fee')
      .eq('id', 'default')
      .maybeSingle()
    if (error) {
      console.error('Could not load shop contact settings:', error)
      return
    }
    setShopSettings({
      contact_phone: data?.contact_phone || data?.whatsapp_number || SHOP.whatsapp,
      whatsapp_number: data?.whatsapp_number || SHOP.whatsapp,
      delivery_fee: String(data?.delivery_fee ?? 0),
    })
  }

  const saveShopSettings = async (event) => {
    event.preventDefault()
    const contactPhone = String(shopSettings.contact_phone || '').trim()
    const whatsappNumber = String(shopSettings.whatsapp_number || '').trim()
    if (!contactPhone || !/^[+\d][+\d\s()-]{6,19}$/.test(contactPhone)) {
      alert('Enter a valid customer contact phone number.')
      return
    }
    setSettingsSaving(true)
    const { error } = await supabase.from('shop_settings').upsert({
      id: 'default',
      contact_phone: contactPhone,
      whatsapp_number: whatsappNumber || contactPhone,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    setSettingsSaving(false)
    if (error) {
      alert(`Could not save shop settings: ${error.message}`)
      return
    }
    setShopSettings((current) => ({ ...current, contact_phone: contactPhone, whatsapp_number: whatsappNumber || contactPhone }))
    window.dispatchEvent(new Event('jpf-shop-settings-updated'))
    alert('Shop contact settings saved.')
  }

  const saveDeliverySettings = async (event) => {
    event.preventDefault()
    const deliveryFee = Number(shopSettings.delivery_fee)
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      alert('Enter a delivery charge of zero or more.')
      return
    }
    setDeliverySaving(true)
    const { error } = await supabase.from('shop_settings').upsert({
      id: 'default',
      delivery_fee: deliveryFee,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    setDeliverySaving(false)
    if (error) {
      alert(`Could not save delivery charge: ${error.message}`)
      return
    }
    setShopSettings((current) => ({ ...current, delivery_fee: String(deliveryFee) }))
    window.dispatchEvent(new Event('jpf-shop-settings-updated'))
    alert('Delivery charge saved.')
  }

  const fetchAllData = async () => {
    setLoading(true)

    const {
      data: ordData,
      error: ordError,
    } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', {
        ascending: false,
      })

    if (ordError) {
      alert(
        'Failed to load orders: ' +
          ordError.message
      )
    } else if (ordData) {
      setOrders(ordData)
    }

    const {
      data: prodData,
      error: prodError,
    } = await supabase
      .from('products')
      .select('*')
      .order('created_at', {
        ascending: false,
      })

    if (prodError) {
      alert(
        'Failed to load products: ' +
          prodError.message
      )
    } else if (prodData) {
      setProducts(prodData)
    }

    const { data: printConfigData, error: printConfigError } = await supabase
      .from('product_print_configs')
      .select('product_id,front_enabled,back_enabled,front_print_size,back_print_size,front_artwork_url,back_artwork_url')
    if (printConfigError) {
      console.error('Could not load product print references:', printConfigError)
      setProductPrintConfigs({})
    } else {
      setProductPrintConfigs(Object.fromEntries((printConfigData || []).map((config) => [String(config.product_id), config])))
    }

    const { data: catData } =
      await supabase
        .from('category_settings')
        .select('*')
        .order('sort_order', {
          ascending: true,
        })

    if (catData && catData.length > 0) {
      setCategories(catData)

      const firstAud = catData.find(
        (c) => c.group_type === 'audience'
      )

      const firstType = catData.find(
        (c) => c.group_type === 'shirt_type'
      )

      if (firstAud) {
        setAudience(firstAud.label)
      }

      if (firstType) {
        setShirtType(firstType.label)
      }
    }

    setLoading(false)
  }

  const toggleFormSize = (size) => {
    setSelectedSizes((prev) =>
      prev.includes(size)
        ? prev.filter((s) => s !== size)
        : [...prev, size]
    )
  }

  const handleToggleProductSize = async (
    product,
    size
  ) => {
    const currentSizes =
      product.available_sizes ||
      ALL_SIZES

    const updatedSizes =
      currentSizes.includes(size)
        ? currentSizes.filter(
            (s) => s !== size
          )
        : [...currentSizes, size]

    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id
          ? {
              ...p,
              available_sizes:
                updatedSizes,
            }
          : p
      )
    )

    const { error } =
      await supabase
        .from('products')
        .update({
          available_sizes:
            updatedSizes,
        })
        .eq('id', product.id)

    if (error) {
      alert(
        'Size update error: ' +
          error.message
      )

      fetchAllData()
    }
  }

  const handleToggleCategorySetting =
    async (item) => {
      const nextActive =
        !item.is_active

      setCategories((prev) =>
        prev.map((c) =>
          c.id === item.id
            ? {
                ...c,
                is_active:
                  nextActive,
              }
            : c
        )
      )

      const { error } =
        await supabase
          .from('category_settings')
          .update({
            is_active:
              nextActive,
          })
          .eq('id', item.id)

      if (error) {
        alert(
          'Category status update error: ' +
            error.message
        )

        fetchAllData()
      }
    }

  const resetProductForm = () => {
    setEditingProduct(null)
    setTitle('')
    setCategory('Graphic')
    setAudience('Male')
    setShirtType('Crew neck')
    setAgeGroup('Adults (20+ yrs)')
    setPrice('')
    setKeywords([])
    setIsProductActive(true)
    setSelectedSizes(['S', 'M', 'L', 'XL', 'XXL'])
    setImageFile(null)
    setAdditionalImageFiles([])
    setExistingProductImages([])
    setExistingImageUrl('')
    setExistingFrontArtworkUrl(null)
    setExistingBackArtworkUrl(null)
    setPrintType('single_side')
    setFrontPrintSize('A4')
    setBackPrintSize('A4')
    setFrontArtworkFile(null)
    setBackArtworkFile(null)
  }

  const handleEditProduct = async (product) => {
    setEditingProduct(product)
    setTitle(product.title || '')
    setCategory(product.category || 'Graphic')
    setAudience(product.audience || 'Male')
    setShirtType(product.shirt_type || 'Crew neck')
    setAgeGroup(product.age_group || 'Adults (20+ yrs)')
    setPrice(product.price ?? '')
    setKeywords(Array.isArray(product.keywords) ? product.keywords : [])
    setIsProductActive(product.is_active !== false)
    setSelectedSizes(product.available_sizes || ALL_SIZES)
    setImageFile(null)
    setAdditionalImageFiles([])
    setExistingImageUrl(product.image_url || '')
    setFrontArtworkFile(null)
    setBackArtworkFile(null)
    const [configResult, imageResult] = await Promise.all([
      supabase.from('product_print_configs').select('*').eq('product_id', product.id).maybeSingle(),
      supabase.from('product_images').select('id,image_url,role,sort_order').eq('product_id', product.id).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    ])
    const { data, error } = configResult
    if (error) {
      alert(`Could not load the print configuration: ${error.message}`)
      return
    }
    if (imageResult.error) {
      alert(`Could not load the product images: ${imageResult.error.message}`)
      return
    }
    setExistingProductImages(imageResult.data || [])
    setPrintType(data?.print_type || 'single_side')
    setFrontPrintSize(data?.front_print_size || 'A4')
    setBackPrintSize(data?.back_print_size || 'A4')
    setExistingFrontArtworkUrl(data?.front_artwork_url || null)
    setExistingBackArtworkUrl(data?.back_artwork_url || null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeleteProductImage = async (image) => {
    if (!window.confirm('Remove this detail image from the product?')) return
    const marker = '/object/public/gallery-images/'
    const markerIndex = image.image_url?.indexOf(marker) ?? -1
    if (markerIndex >= 0) {
      const filePath = decodeURIComponent(image.image_url.slice(markerIndex + marker.length))
      const { error: fileError } = await supabase.storage.from('gallery-images').remove([filePath])
      if (fileError) return alert(`Could not remove the image file: ${fileError.message}`)
    }
    const { error } = await supabase.from('product_images').delete().eq('id', image.id)
    if (error) return alert(`Could not remove the product image: ${error.message}`)
    setExistingProductImages((current) => current.filter((item) => item.id !== image.id))
  }

  const handleAddProduct = async (event) => {
    event.preventDefault()
    if (!title.trim() || price === '' || Number(price) < 0 || (!editingProduct && !imageFile)) {
      return alert('Enter a title, a valid non-negative price, and a main product photo.')
    }
    if (!selectedSizes.length) return alert('Select at least one available size.')
    for (const file of [imageFile, ...additionalImageFiles, frontArtworkFile, backArtworkFile].filter(Boolean)) {
      const uploadError = validateUpload(file, { allowPdf: false, maxBytes: 5 * 1024 * 1024 })
      if (uploadError) return alert(uploadError === 'err.fileTooLarge' ? 'Product images must be 5 MB or smaller.' : 'Use a PNG, JPG, or WEBP image.')
    }

    setUploading(true)
    try {
      const uploadImage = async (file) => {
        if (!file) return null
        const path = safeFileName(file)
        const { error } = await supabase.storage.from('gallery-images').upload(path, file, { upsert: false })
        if (error) throw error
        return supabase.storage.from('gallery-images').getPublicUrl(path).data.publicUrl
      }
      const mainImageUrl = await uploadImage(imageFile) || existingImageUrl
      const payload = {
        title: title.trim(),
        category,
        audience,
        age_group: ageGroup,
        shirt_type: shirtType,
        price: Number(price),
        image_url: mainImageUrl,
        available_sizes: selectedSizes,
        keywords,
        is_active: isProductActive,
      }
      const productRequest = editingProduct
        ? supabase.from('products').update(payload).eq('id', editingProduct.id).select('id').single()
        : supabase.from('products').insert(payload).select('id').single()
      const { data: savedProduct, error: productError } = await productRequest
      if (productError) throw productError

      const uploadArtwork = async (file, existingUrl) => await uploadImage(file) || existingUrl || null
      const frontArtworkUrl = await uploadArtwork(frontArtworkFile, existingFrontArtworkUrl)
      const backArtworkUrl = printType === 'double_side' ? await uploadArtwork(backArtworkFile, existingBackArtworkUrl) : null
      const configPayload = {
        product_id: savedProduct.id,
        print_type: printType,
        front_enabled: true,
        back_enabled: printType === 'double_side',
        front_print_size: frontPrintSize,
        back_print_size: printType === 'double_side' ? backPrintSize : null,
        front_artwork_url: frontArtworkUrl,
        back_artwork_url: backArtworkUrl,
        is_active: true,
      }
      const { data: existingConfig, error: configLookupError } = await supabase.from('product_print_configs').select('id').eq('product_id', savedProduct.id).maybeSingle()
      if (configLookupError) throw configLookupError
      const configRequest = existingConfig
        ? supabase.from('product_print_configs').update(configPayload).eq('id', existingConfig.id)
        : supabase.from('product_print_configs').insert(configPayload)
      const { error: configError } = await configRequest
      if (configError) throw configError

      for (const [index, file] of additionalImageFiles.entries()) {
        const imageUrl = await uploadImage(file)
        const { error } = await supabase.from('product_images').insert({
          product_id: savedProduct.id,
          image_url: imageUrl,
          role: 'detail',
          sort_order: existingProductImages.length + index,
        })
        if (error) throw error
      }

      resetProductForm()
      await fetchAllData()
      alert(editingProduct ? 'Product updated.' : 'T-shirt added to the gallery!')
    } catch (error) {
      alert(error.message || 'The product could not be saved.')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteProduct =
    async (id) => {
      if (
        !confirm(
          'Delete this T-shirt from gallery?'
        )
      ) {
        return
      }

      const { error } =
        await supabase
          .from('products')
          .delete()
          .eq('id', id)

      if (error) {
        alert(
          'Delete failed: ' +
            error.message
        )

        return
      }

      fetchAllData()
    }

  const handleStatusChange =
    async (
      orderId,
      newStatus
    ) => {
      const { error } =
        await supabase
          .from('orders')
        .update({
          status: newStatus,
          ...(newStatus === 'Printing' ? { shipping_status: 'preparing' } : {}),
          ...(newStatus === 'Shipped' ? { shipping_status: 'shipped' } : {}),
          ...(newStatus === 'Completed' ? { shipping_status: 'delivered' } : {}),
        })
          .eq(
            'id',
            orderId
          )

      if (error) {
        alert(
          'Status update failed: ' +
            error.message
        )

        return
      }

      fetchAllData()
    }

  const handlePaymentReview = async (order, decision) => {
    const note = decision === 'rejected'
      ? window.prompt('Add a short reason for rejecting this receipt:')
      : null
    if (decision === 'rejected' && !note?.trim()) return
    const { error } = await supabase.rpc('jpf_admin_review_payment', {
      p_order_id: order.id,
      p_decision: decision,
      p_note: note,
    })
    if (error) {
      alert(`Payment review failed: ${error.message}`)
      return
    }
    fetchAllData()
  }

  const handleCashOnDeliveryPaid = async (order) => {
    const { error } = await supabase.rpc('jpf_admin_mark_cod_paid', {
      p_order_id: order.id,
    })
    if (error) {
      alert(`Could not confirm cash payment: ${error.message}`)
      return
    }
    fetchAllData()
  }

  const downloadCustomerDesign = async (pathOrUrl) => {
    const marker = '/object/public/customer-designs/'
    const markerIndex = String(pathOrUrl || '').indexOf(marker)
    const storagePath = markerIndex >= 0
      ? decodeURIComponent(String(pathOrUrl).slice(markerIndex + marker.length))
      : pathOrUrl
    const { data, error } = await supabase.storage.from('customer-designs').download(storagePath)
    if (error || !data) {
      console.error('Could not download customer design:', error)
      await openPrivateFile('customer-designs', pathOrUrl, () => alert('Could not open the customer design.'))
      return
    }
    const objectUrl = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = decodeURIComponent(String(storagePath).split('/').pop() || 'customer-design')
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }

  const updateShipmentDraft = (orderId, field, value) => {
    setShipmentDrafts((current) => ({
      ...current,
      [orderId]: { ...current[orderId], [field]: value },
    }))
  }

  const saveShipment = async (order) => {
    const draft = shipmentDrafts[order.id] || {}
    const trackingUrl = String(draft.tracking_url ?? order.tracking_url ?? '').trim()
    if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) {
      alert('Enter a valid tracking URL that starts with https://')
      return
    }
    const { error } = await supabase.from('orders').update({
      courier_name: String(draft.courier_name ?? order.courier_name ?? '').trim() || null,
      tracking_number: String(draft.tracking_number ?? order.tracking_number ?? '').trim() || null,
      tracking_url: trackingUrl || null,
    }).eq('id', order.id)
    if (error) alert(`Could not save shipment details: ${error.message}`)
    else {
      setShipmentDrafts((current) => { const next = { ...current }; delete next[order.id]; return next })
      fetchAllData()
    }
  }

  const handleDeleteOrder =
    async (order) => {
      const shortId =
        String(
          order.id || ''
        ).slice(0, 8)

      if (
        !confirm(
          `Delete order #${shortId} (${order.customer_name || 'Customer'})? This will also remove its items.`
        )
      ) {
        return
      }

      const { error } =
        await supabase
          .from('orders')
          .delete()
          .eq(
            'id',
            order.id
          )

      if (error) {
        alert(
          'Order delete failed: ' +
            error.message
        )

        return
      }

      fetchAllData()
    }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-2xl border text-center">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />

        <h2 className="text-lg font-bold">
          Admin Access Only
        </h2>

        <p className="text-sm text-gray-500 mt-1">
          Your account does not have administrator access.
        </p>
      </div>
    )
  }

  const audienceItems =
    categories.filter(
      (c) =>
        c.group_type ===
        'audience'
    )

  const shirtTypeItems =
    categories.filter(
      (c) =>
        c.group_type ===
        'shirt_type'
    )

  const ageGroupItems = categories.filter((categoryItem) => categoryItem.group_type === 'age_group')

  const analytics =
    getOrderAnalytics(
      orders
    )

  const filteredOrders =
    orders.filter(
      (order) => {
        const matchesStatus =
          statusFilter ===
            'All' ||
          order.status ===
            statusFilter

        if (!matchesStatus) {
          return false
        }

        const q =
          orderSearch
            .trim()
            .toLowerCase()

        if (!q) {
          return true
        }

        const haystack = [
          order.id,
          order.customer_name,
          order.phone,
          order.customer_phone,
          order.address,
          order.shipping_address,
          order.status,

          ...(Array.isArray(
            order.order_items
          )
            ? order.order_items.flatMap(
                (item) => [
                  item.product_id,
                  item.title,
                ]
              )
            : []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return haystack.includes(q)
      }
    )

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Admin Panel
          </h1>

          <p className="text-sm text-gray-500">
            Analytics overview, customer orders, gallery stock, pricing, and category settings
          </p>
        </div>

        {/* Admin Tabs */}
        <div className="flex flex-wrap bg-gray-100 p-1 rounded-xl w-fit gap-1">

          {/* Dashboard */}
          <button
            type="button"
            onClick={() =>
              setTab('dashboard')
            }
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'dashboard'
                ? 'bg-white text-black shadow-sm'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Dashboard
          </button>

          {/* Orders */}
          <button
            type="button"
            onClick={() =>
              setTab('orders')
            }
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'orders'
                ? 'bg-white text-black shadow-sm'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <Package className="w-4 h-4" />
            Orders ({orders.length})
          </button>

          {/* Gallery Products */}
          <button
            type="button"
            onClick={() =>
              setTab('products')
            }
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'products'
                ? 'bg-white text-black shadow-sm'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            Gallery Products ({products.length})
          </button>

          {/* Pricing */}
          <button
            type="button"
            onClick={() =>
              setTab('pricing')
            }
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'pricing'
                ? 'bg-white text-black shadow-sm'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Pricing
          </button>

          {/* Categories */}
          <button
            type="button"
            onClick={() =>
              setTab('categories')
            }
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'categories'
                ? 'bg-white text-black shadow-sm'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Categories ON/OFF
          </button>

          <button
            type="button"
            onClick={() => setTab('delivery')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'delivery'
                ? 'bg-white text-black shadow-sm'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <Truck className="w-4 h-4" />
            Delivery
          </button>

          <button
            type="button"
            onClick={() => setTab('settings')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'settings'
                ? 'bg-white text-black shadow-sm'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">
          Loading admin data...
        </div>
      ) : tab === 'dashboard' ? (

        /* =========================
           DASHBOARD
        ========================= */
        <section className="space-y-5">

          {!analytics.hasOrders ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-sm text-gray-500">
              No order analytics data yet
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <DollarSign className="w-4 h-4" />
                    Total Revenue
                  </div>

                  <p className="text-xl font-bold text-gray-900 mt-2">
                    LKR{' '}
                    {analytics.totalRevenue.toLocaleString()}
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Package className="w-4 h-4" />
                    Total Orders
                  </div>

                  <p className="text-xl font-bold text-gray-900 mt-2">
                    {analytics.totalOrders}
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock3 className="w-4 h-4" />
                    Pending Verification
                  </div>

                  <p className="text-xl font-bold text-gray-900 mt-2">
                    {analytics.pendingOrders}
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Shirt className="w-4 h-4" />
                    Custom Items
                  </div>

                  <p className="text-xl font-bold text-gray-900 mt-2">
                    {analytics.customCount}
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <ShoppingBag className="w-4 h-4" />
                    Gallery Items
                  </div>

                  <p className="text-xl font-bold text-gray-900 mt-2">
                    {analytics.galleryCount}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                <AnalyticsBarList
                  title="Top Selling Sizes"
                  rows={analytics.sizes}
                  total={analytics.totalUnits}
                  emptyMessage="No size data yet"
                />

                <AnalyticsBarList
                  title="Top Selling Colors"
                  rows={analytics.colors}
                  total={analytics.totalUnits}
                  emptyMessage="No color data yet"
                />

                <AnalyticsBarList
                  title="Top Designs / Products"
                  rows={analytics.products}
                  total={analytics.galleryCount}
                  emptyMessage="No gallery sales yet"
                />

                <AnalyticsBarList
                  title="Custom Print Positions"
                  rows={analytics.positions}
                  total={analytics.customCount}
                  emptyMessage="No custom print orders yet"
                />
              </div>
            </>
          )}
        </section>

      ) : tab === 'orders' ? (

        /* =========================
           ORDERS
        ========================= */
        <div className="space-y-4">

          <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">

            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />

              <input
                type="text"
                value={orderSearch}
                onChange={(e) =>
                  setOrderSearch(
                    e.target.value
                  )
                }
                placeholder="Search by customer name, phone, address, or order ID..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400"
              />
            </div>

            <div className="flex items-center gap-2">

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value
                  )
                }
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 font-medium"
              >
                <option value="All">
                  All Statuses ({orders.length})
                </option>

                {ORDER_STATUSES.map(
                  (st) => (
                    <option
                      key={st}
                      value={st}
                    >
                      {st}
                    </option>
                  )
                )}
              </select>

              {(orderSearch ||
                statusFilter !==
                  'All') && (
                <button
                  type="button"
                  onClick={() => {
                    setOrderSearch('')
                    setStatusFilter(
                      'All'
                    )
                  }}
                  className="text-xs font-medium text-gray-600 hover:text-black px-2.5 py-2 rounded-xl border border-gray-200"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="bg-white p-10 rounded-2xl border text-center text-gray-500">
              {orders.length === 0
                ? 'No orders yet.'
                : 'No orders match your current filter.'}
            </div>
          ) : (
            filteredOrders.map(
              (order) => (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">

                    <div>
                      <div className="flex flex-wrap items-center gap-2">

                        <span className="font-bold text-gray-900">
                          {order.customer_name}
                        </span>

                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">
                          #{order.id.slice(0, 8)}
                        </span>

                        <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2.5 py-0.5 rounded-full">
                          LKR{' '}
                          {Number(
                            order.pricing_snapshot?.total_price ?? order.total_amount ?? 0
                          ).toLocaleString()}
                        </span>
                      </div>

                      {(order.phone || order.customer_phone) ? (
                        <a href={`tel:${String(order.phone || order.customer_phone).replace(/[^\d+]/g, '')}`} className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline">
                          <Phone className="h-4 w-4" />
                          {order.phone || order.customer_phone}
                          <span className="text-xs">· Call customer</span>
                        </a>
                      ) : (
                        <p className="mt-1 text-sm text-gray-600">Phone: —</p>
                      )}

                      <p className="text-sm text-gray-600">
                        📍{' '}
                        {order.address ||
                          order.shipping_address ||
                          '—'}
                      </p>

                      {order.notes && (
                        <p className="text-xs text-gray-500 mt-1">
                          📝 Order Note:{' '}
                          {order.notes}
                        </p>
                      )}

                      <button type="button" onClick={() => setSelectedOrderDetails(order)} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-800 hover:bg-indigo-100">
                        <Eye className="h-4 w-4" />
                        View order details
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">

                      {(order.payment_receipt_url || order.payment_slip_path || order.payment_slip_url) && (
                        <button
                          type="button"
                          onClick={() =>
                            openPrivateFile(
                              'payment-slips',
                              order.payment_receipt_url || order.payment_slip_path || order.payment_slip_url
                            )
                          }
                          className="flex items-center gap-1.5 text-xs font-medium bg-blue-50 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-100"
                        >
                          Bank Slip
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <span className="rounded-full bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900">
                        Payment: {String(order.payment_status || 'pending').replaceAll('_', ' ')}
                      </span>

                      <span className="rounded-full bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-800">
                        Method: {order.payment_method === 'cash_on_delivery' ? 'Cash on delivery' : 'Bank transfer'}
                      </span>

                      {order.payment_method === 'cash_on_delivery' && !['paid', 'refunded'].includes(String(order.payment_status || '').toLowerCase()) && !['cancelled', 'canceled'].includes(String(order.status || '').toLowerCase()) && (
                        <button type="button" onClick={() => void handleCashOnDeliveryPaid(order)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">Mark cash received</button>
                      )}

                      {(order.payment_receipt_url || order.payment_slip_path || order.payment_slip_url) && !['paid', 'refunded'].includes(String(order.payment_status || '').toLowerCase()) && (
                        <>
                          <button type="button" onClick={() => void handlePaymentReview(order, 'paid')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">Verify payment</button>
                          <button type="button" onClick={() => void handlePaymentReview(order, 'rejected')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">Reject receipt</button>
                        </>
                      )}

                      <select
                        value={
                          order.status
                        }
                        onChange={(e) =>
                          handleStatusChange(
                            order.id,
                            e.target.value
                          )
                        }
                        className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-2 bg-gray-50"
                      >
                        {ORDER_STATUSES.map(
                          (st) => (
                            <option
                              key={st}
                              value={st}
                            >
                              {st}
                            </option>
                          )
                        )}
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          handleDeleteOrder(
                            order
                          )
                        }
                        className="flex items-center gap-1 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 px-2.5 py-2 rounded-lg transition"
                        title="Delete order"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">

                    {order.order_items?.map(
                      (item) => {
                        const itemUnitPrice =
                          Number(
                            item.unit_price ??
                              item.price ??
                              0
                          )
                        const printRequirements = getOrderItemPrintRequirements(item)

                        return (
                          <div
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 p-3 rounded-xl text-sm"
                          >
                            <div>

                              <span className="font-medium text-gray-900">
                                {getOrderItemDisplayTitle(item) || 'Ordered item'}
                              </span>

                              {item.product_id &&
                                (
                                  item.item_type ||
                                  item.type
                                ) ===
                                  'gallery' && (
                                  <span className="ml-2 inline-flex rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-indigo-700">
                                    {getProductCode(
                                      item.product_id
                                    )}
                                  </span>
                                )}

                              <span className="text-gray-500 ml-2">
                                ({item.color} /{' '}
                                {item.size}) ×{' '}
                                {item.quantity}
                              </span>

                              {printRequirements && (
                                <p className="mt-1 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-900">
                                  Print area / method / size: {printRequirements}
                                </p>
                              )}

                              {(item.custom_notes ||
                                item.notes) && (
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Note:{' '}
                                  {item.custom_notes ||
                                    item.notes}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-3">

                              {(item.design_url ||
                                item.design_path ||
                                item.custom_design_url) && (
                                <button
                                  type="button"
                                  onClick={() => void downloadCustomerDesign(item.design_path || item.design_url || item.custom_design_url)}
                                  className="text-xs font-medium bg-black text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-gray-800"
                                >
                                  Download customer design
                                  <Download className="w-3 h-3" />
                                </button>
                              )}

                              {Array.isArray(item.print_locations) && item.print_locations.length > 0 && <div className="flex flex-wrap gap-1.5">{item.print_locations.map((location, index) => <div key={`${location.location}-${index}`} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700">{location.location} · {location.method} · {location.size}{Number.isFinite(Number(location.price)) && <span>· LKR {Number(location.price).toLocaleString()}</span>}{location.artwork_path && <button type="button" onClick={() => void openPrivateFile('customer-designs', location.artwork_path)} className="font-semibold text-indigo-700 underline">Artwork</button>}</div>)}</div>}

                              <span className="font-semibold">
                                LKR{' '}
                                {(
                                  itemUnitPrice *
                                  Number(
                                    item.quantity ||
                                      1
                                  )
                                ).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        )
                      }
                    )}
                  </div>
                  <div className="mt-4 grid gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
                    <input aria-label="Courier name" placeholder="Courier name" value={shipmentDrafts[order.id]?.courier_name ?? order.courier_name ?? ''} onChange={(event) => updateShipmentDraft(order.id, 'courier_name', event.target.value)} className="min-h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
                    <input aria-label="Tracking number" placeholder="Tracking number" value={shipmentDrafts[order.id]?.tracking_number ?? order.tracking_number ?? ''} onChange={(event) => updateShipmentDraft(order.id, 'tracking_number', event.target.value)} className="min-h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
                    <input aria-label="Tracking URL" type="url" placeholder="https://tracking.example/..." value={shipmentDrafts[order.id]?.tracking_url ?? order.tracking_url ?? ''} onChange={(event) => updateShipmentDraft(order.id, 'tracking_url', event.target.value)} className="min-h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
                    <button type="button" onClick={() => void saveShipment(order)} className="min-h-10 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white">Save tracking</button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Delivery status: {String(order.shipping_status || 'not_ready').replaceAll('_', ' ')}</p>

                  {selectedOrderDetails?.id === order.id && (
                    <div role="dialog" aria-modal="true" aria-labelledby={`order-details-title-${order.id}`} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedOrderDetails(null) }}>
                      <section className="relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
                        <button type="button" aria-label="Close order details" onClick={() => setSelectedOrderDetails(null)} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
                        <div className="pr-10">
                          <h2 id={`order-details-title-${order.id}`} className="text-xl font-bold text-gray-900">Order details · #{String(order.id).slice(0, 8).toUpperCase()}</h2>
                          <p className="mt-1 text-sm text-gray-600">{order.customer_name} · {order.phone || order.customer_phone || 'No phone number'}</p>
                          {(order.phone || order.customer_phone) && <a href={`tel:${String(order.phone || order.customer_phone).replace(/[^\d+]/g, '')}`} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-50 px-3 text-sm font-semibold text-indigo-800"><Phone className="h-4 w-4" />Call customer</a>}
                        </div>
                        <div className="mt-5 space-y-3">
                          {(order.order_items || []).map((item) => {
                            const product = products.find((entry) => String(entry.id) === String(item.product_id))
                            const config = productPrintConfigs[String(item.product_id)]
                            const itemTitle = getOrderItemDisplayTitle(item) || product?.title || 'Ordered item'
                            const imageUrl = item.image_url || product?.image_url
                            const designPath = item.design_path || item.design_url || item.custom_design_url
                            const printLocations = Array.isArray(item.print_locations) ? item.print_locations : []
                            const printRequirements = getOrderItemPrintRequirements(item)
                            const isGalleryItem = (item.item_type || item.type) === 'gallery'
                            const unitPrice = Number(item.unit_price ?? item.price) || 0
                            return (
                              <article key={item.id || `${item.product_id}-${itemTitle}`} className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                                <div className="flex gap-3">
                                  {imageUrl ? <img src={imageUrl} alt={itemTitle} className="h-24 w-24 shrink-0 rounded-lg bg-white object-cover" /> : <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg bg-white text-sm text-gray-400">No image</div>}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3 className="font-bold text-gray-900">{itemTitle}</h3>
                                      {isGalleryItem && item.product_id && <span className="rounded bg-indigo-100 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-800">{getProductCode(item.product_id)}</span>}
                                    </div>
                                    <p className="mt-1 text-sm text-gray-700">Colour: {item.color || '—'} · Size: {item.size || '—'} · Quantity: {item.quantity || 1}</p>
                                    {item.print_position && <p className="mt-1 text-sm text-gray-700">Print area: {item.print_position}</p>}
                                    {printRequirements && <p className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-sm font-medium text-violet-900">Print area / method / size: {printRequirements}</p>}
                                    {(item.custom_notes || item.notes) && <p className="mt-1 text-sm text-gray-600">Note: {item.custom_notes || item.notes}</p>}
                                    <p className="mt-2 text-sm font-semibold text-gray-900">Unit: LKR {unitPrice.toLocaleString()} · Line total: LKR {(unitPrice * Number(item.quantity || 1)).toLocaleString()}</p>
                                  </div>
                                </div>

                                {isGalleryItem && config && <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-200 pt-3">
                                  {config.front_enabled && <div className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-2 text-xs text-gray-700">Front artwork · {config.front_print_size || 'Size not set'}{config.front_artwork_url && <a href={config.front_artwork_url} target="_blank" rel="noopener noreferrer" className="ml-1 font-semibold text-indigo-700 underline">Open design</a>}</div>}
                                  {config.back_enabled && <div className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-2 text-xs text-gray-700">Back artwork · {config.back_print_size || 'Size not set'}{config.back_artwork_url && <a href={config.back_artwork_url} target="_blank" rel="noopener noreferrer" className="ml-1 font-semibold text-indigo-700 underline">Open design</a>}</div>}
                                </div>}

                                {printLocations.length > 0 && <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-200 pt-3">{printLocations.map((location, index) => <div key={`${location.location}-${index}`} className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-white px-2.5 py-2 text-xs text-gray-700">{location.location} · {location.method} · {location.size}{location.artwork_path && <button type="button" onClick={() => void downloadCustomerDesign(location.artwork_path)} className="ml-1 font-semibold text-indigo-700 underline">Download artwork</button>}</div>)}</div>}

                                {designPath && <button type="button" onClick={() => void downloadCustomerDesign(designPath)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-gray-900 px-3 text-sm font-semibold text-white hover:bg-gray-800"><Download className="h-4 w-4" />Download customer design</button>}
                              </article>
                            )
                          })}
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4 font-bold text-gray-900"><span>Order total</span><span>LKR {Number(order.pricing_snapshot?.total_price ?? order.total_amount ?? 0).toLocaleString()}</span></div>
                      </section>
                    </div>
                  )}
                </div>
              )
            )
          )}
        </div>

      ) : tab === 'pricing' ? (

        /* =========================
           CENTRAL PRICING
        ========================= */
        <PricingManager />

      ) : tab === 'categories' ? (

        /* =========================
           CATEGORY SETTINGS
        ========================= */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Audience */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">

            <h2 className="font-bold text-gray-900 mb-1">
              Audience Categories
              (Male / Female / Kids)
            </h2>

            <p className="text-xs text-gray-500 mb-4">
              Turn OFF any category that is currently unavailable for customers.
            </p>

            <div className="space-y-2.5">

              {audienceItems.map(
                (item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50"
                  >
                    <div>

                      <span className="font-semibold text-sm text-gray-900">
                        {item.label}
                      </span>

                      <span
                        className={`ml-2.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          item.is_active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {item.is_active
                          ? 'Available (ON)'
                          : 'Unavailable (OFF)'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleToggleCategorySetting(
                          item
                        )
                      }
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                        item.is_active
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                      }`}
                    >
                      {item.is_active
                        ? 'ON'
                        : 'OFF'}
                    </button>
                  </div>
                )
              )}
            </div>
          </div>

          {/* T-Shirt Types */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">

            <h2 className="font-bold text-gray-900 mb-1">
              T-Shirt Types Availability
            </h2>

            <p className="text-xs text-gray-500 mb-4">
              Control which neckline/T-shirt styles customers can filter & order.
            </p>

            <div className="space-y-2.5">

              {shirtTypeItems.map(
                (item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50"
                  >
                    <div>

                      <span className="font-semibold text-sm text-gray-900">
                        {item.label}
                      </span>

                      <span
                        className={`ml-2.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          item.is_active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {item.is_active
                          ? 'Available (ON)'
                          : 'Unavailable (OFF)'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleToggleCategorySetting(
                          item
                        )
                      }
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                        item.is_active
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                      }`}
                    >
                      {item.is_active
                        ? 'ON'
                        : 'OFF'}
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

      ) : tab === 'delivery' ? (

        <form onSubmit={saveDeliverySettings} className="max-w-2xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-bold text-gray-900">Delivery charge</h2>
          </div>
          <p className="mt-1 text-sm text-gray-600">Set the delivery amount customers see at checkout. This charge is saved with each new order.</p>
          <label className="mt-5 block text-sm font-semibold text-gray-700">
            Delivery charge (LKR)
            <input type="number" min="0" step="0.01" required value={shopSettings.delivery_fee} onChange={(event) => setShopSettings((current) => ({ ...current, delivery_fee: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 font-normal text-gray-900" />
          </label>
          <p className="mt-1 text-xs text-gray-500">Enter 0 for free delivery.</p>
          <button type="submit" disabled={deliverySaving} className="mt-5 min-h-11 rounded-lg bg-violet-600 px-5 font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{deliverySaving ? 'Saving…' : 'Save delivery charge'}</button>
        </form>

      ) : tab === 'settings' ? (

        <form onSubmit={saveShopSettings} className="max-w-2xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold text-gray-900">Shop contact settings</h2>
          <p className="mt-1 text-sm text-gray-600">Customers will see this number when a gallery design needs a price quote. They can tap it to call.</p>
          <label className="mt-5 block text-sm font-semibold text-gray-700">
            Customer contact phone
            <input type="tel" required value={shopSettings.contact_phone} onChange={(event) => setShopSettings((current) => ({ ...current, contact_phone: event.target.value }))} placeholder="e.g. +94 71 234 5678" className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 font-normal text-gray-900" />
          </label>
          <label className="mt-4 block text-sm font-semibold text-gray-700">
            WhatsApp number
            <input type="tel" value={shopSettings.whatsapp_number} onChange={(event) => setShopSettings((current) => ({ ...current, whatsapp_number: event.target.value }))} placeholder="e.g. 94712345678" className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 font-normal text-gray-900" />
            <span className="mt-1 block text-xs font-normal text-gray-500">Use country code for WhatsApp, without spaces. Leave blank to use the contact phone above.</span>
          </label>
          <button type="submit" disabled={settingsSaving} className="mt-5 min-h-11 rounded-lg bg-violet-600 px-5 font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{settingsSaving ? 'Saving…' : 'Save settings'}</button>
        </form>

      ) : (

        /* =========================
           GALLERY PRODUCTS
        ========================= */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Add Product */}
          <form
            onSubmit={handleAddProduct}
            className="bg-white p-5 rounded-2xl border border-gray-200 h-fit space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-gray-900">{editingProduct ? 'Edit Gallery T-Shirt' : 'Add Gallery T-Shirt'}</h2>
                <p className="mt-1 text-xs text-gray-500">Required fields are marked with an asterisk.</p>
              </div>
              {editingProduct && <button type="button" onClick={resetProductForm} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Cancel edit</button>}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700">
                Design Title
              </label>

              <input
                type="text"
                required
                value={title}
                onChange={(e) =>
                  setTitle(
                    e.target.value
                  )
                }
                placeholder="e.g. Classic Polo Tee"
                className="w-full mt-1 border rounded-xl px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">

              <div>
                <label className="text-xs font-medium text-gray-700">
                  Audience
                </label>

                <select
                  value={audience}
                  onChange={(e) =>
                    setAudience(
                      e.target.value
                    )
                  }
                  className="w-full mt-1 border rounded-xl px-3 py-2 text-sm bg-white"
                >
                  {(audienceItems.length >
                  0
                    ? audienceItems
                    : [
                        {
                          id: '1',
                          label: 'Male',
                        },
                        {
                          id: '2',
                          label: 'Female',
                        },
                        {
                          id: '3',
                          label: 'Kids',
                        },
                      ]
                  ).map(
                    (a) => (
                      <option
                        key={a.id}
                        value={a.label}
                      >
                        {a.label}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700">
                  T-Shirt Type
                </label>

                <select
                  value={shirtType}
                  onChange={(e) =>
                    setShirtType(
                      e.target.value
                    )
                  }
                  className="w-full mt-1 border rounded-xl px-3 py-2 text-sm bg-white"
                >
                  {(shirtTypeItems.length >
                  0
                    ? shirtTypeItems
                    : [
                        {
                          id: '1',
                          label: 'Crew neck',
                        },
                        {
                          id: '2',
                          label: 'V-neck',
                        },
                        {
                          id: '3',
                          label: 'Polo',
                        },
                        {
                          id: '4',
                          label: 'Henley',
                        },
                        {
                          id: '5',
                          label: 'Scoop neck',
                        },
                        {
                          id: '6',
                          label: 'Boat neck',
                        },
                        {
                          id: '7',
                          label: 'Off-shoulder',
                        },
                      ]
                  ).map(
                    (t) => (
                      <option
                        key={t.id}
                        value={t.label}
                      >
                        {t.label}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700">Age group</label>
              <select value={ageGroup} onChange={(event) => setAgeGroup(event.target.value)} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm">
                {(ageGroupItems.length ? ageGroupItems : [
                  { id: 'age-toddlers', label: 'Toddlers (1-5 yrs)' },
                  { id: 'age-kids', label: 'Kids (6-12 yrs)' },
                  { id: 'age-teens', label: 'Teens (13-19 yrs)' },
                  { id: 'age-adults', label: 'Adults (20+ yrs)' },
                ]).map((item) => <option key={item.id} value={item.label}>{item.label}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">

              <div>
                <label className="text-xs font-medium text-gray-700">
                  Style Tag
                </label>

                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(
                      e.target.value
                    )
                  }
                  className="w-full mt-1 border rounded-xl px-3 py-2 text-sm bg-white"
                >
                  <option value="Graphic">
                    Graphic
                  </option>

                  <option value="Minimal">
                    Minimal
                  </option>

                  <option value="Typography">
                    Typography
                  </option>

                  <option value="Anime">
                    Anime
                  </option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700">
                  Base Price (LKR)
                </label>

                <input
                  type="number"
                min="0"
                step="0.01"
                  required
                  value={price}
                  onChange={(e) =>
                    setPrice(
                      e.target.value
                    )
                  }
                  placeholder="2800"
                  className="w-full mt-1 border rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>

            <KeywordEditor value={keywords} onChange={setKeywords} suggestions={normalizeKeywords(products.flatMap((product) => product.keywords || []))} />

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1.5">
                Available Sizes
                (ON/OFF)
              </label>

              <div className="flex gap-1.5">

                {ALL_SIZES.map(
                  (s) => {
                    const active =
                      selectedSizes.includes(
                        s
                      )

                    return (
                      <button
                        type="button"
                        key={s}
                        onClick={() =>
                          toggleFormSize(
                            s
                          )
                        }
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition ${
                          active
                            ? 'bg-black text-white border-black'
                            : 'bg-gray-100 text-gray-400 border-gray-200 line-through'
                        }`}
                      >
                        {s}
                      </button>
                    )
                  }
                )}
              </div>
            </div>

            <fieldset className="space-y-3 rounded-xl border border-gray-200 p-3">
              <legend className="px-1 text-xs font-semibold text-gray-800">Print configuration</legend>
              <div className="grid grid-cols-2 gap-2">
                {[['single_side', 'Single side'], ['double_side', 'Double side']].map(([value, label]) => <button key={value} type="button" aria-pressed={printType === value} onClick={() => setPrintType(value)} className={`min-h-10 rounded-lg border px-3 text-sm font-semibold ${printType === value ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-gray-300 bg-white text-gray-700'}`}>{label}</button>)}
              </div>
              <label className="block text-xs font-medium text-gray-700">Front print size<select value={frontPrintSize} onChange={(event) => setFrontPrintSize(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">{['A5', 'A4', 'A3', 'Custom'].map((item) => <option key={item}>{item}</option>)}</select></label>
              {printType === 'double_side' && <label className="block text-xs font-medium text-gray-700">Back print size<select value={backPrintSize} onChange={(event) => setBackPrintSize(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">{['A5', 'A4', 'A3', 'Custom'].map((item) => <option key={item}>{item}</option>)}</select></label>}
              <label className="block text-xs font-medium text-gray-700">Front reference image (optional){existingFrontArtworkUrl && <span className="ml-1 text-emerald-700">Current image saved</span>}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFrontArtworkFile(event.target.files?.[0] || null)} className="mt-1 w-full text-xs" /></label>
              {printType === 'double_side' && <label className="block text-xs font-medium text-gray-700">Back reference image (optional){existingBackArtworkUrl && <span className="ml-1 text-emerald-700">Current image saved</span>}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setBackArtworkFile(event.target.files?.[0] || null)} className="mt-1 w-full text-xs" /></label>}
            </fieldset>

            <div>
              <label className="text-xs font-medium text-gray-700">
                Main product photo {!editingProduct && '*'}
              </label>

              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required={!editingProduct}
                onChange={(e) =>
                  setImageFile(
                    e.target.files?.[0] ||
                      null
                  )
                }
                className="w-full mt-1 text-xs text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:font-medium"
              />
              {existingImageUrl && !imageFile && <img src={existingImageUrl} alt="Current main product" className="mt-2 h-20 w-20 rounded-lg bg-gray-100 object-cover" />}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700">Additional product images</label>
              <input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => setAdditionalImageFiles(Array.from(event.target.files || []))} className="mt-1 w-full text-xs text-gray-600" />
              {existingProductImages.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2">{existingProductImages.map((image) => <div key={image.id} className="relative overflow-hidden rounded-lg border border-gray-200"><img src={image.image_url} alt={`${title} ${image.role || 'detail'} view`} className="aspect-square w-full object-cover" /><button type="button" onClick={() => void handleDeleteProductImage(image)} aria-label="Remove product detail image" className="absolute right-1 top-1 rounded-full bg-white/95 p-1.5 text-red-700 shadow"><Trash2 className="h-4 w-4" /></button></div>)}</div>}
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={isProductActive} onChange={(event) => setIsProductActive(event.target.checked)} /> Available in the customer shop</label>

            <button
              type="submit"
              disabled={uploading}
              className="w-full bg-black text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-gray-800 disabled:opacity-50"
            >
              {editingProduct ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}

              {uploading
                ? 'Uploading...'
                : editingProduct ? 'Save product changes' : 'Publish to Gallery'}
            </button>
          </form>

          {/* Existing Products */}
          <div className="lg:col-span-2 space-y-4">

            <div className="rounded-2xl border border-gray-200 bg-white p-3">

              <div className="relative">

                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) =>
                    setProductSearch(
                      e.target.value
                    )
                  }
                  placeholder="Search by T-shirt name or code..."
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {products
                .filter((p) => {
                  const q =
                    productSearch
                      .trim()
                      .toLowerCase()

                  if (!q) {
                    return true
                  }

                  return `${p.title || ''} ${getProductCode(
                    p.id
                  )} ${
                    p.audience || ''
                  } ${
                    p.shirt_type ||
                    ''
                  }`
                    .toLowerCase()
                    .includes(q)
                })
                .map((p) => {
                  const availSizes =
                    p.available_sizes ||
                    ALL_SIZES

                  return (
                    <div
                      key={p.id}
                      className="bg-white rounded-2xl border border-gray-200 p-3.5 flex flex-col gap-3"
                    >

                      <div className="flex items-center gap-3">

                        <img
                          src={p.image_url}
                          alt={p.title}
                          className="w-16 h-16 rounded-xl object-cover bg-gray-100"
                        />

                        <div className="flex-1 min-w-0">

                          <h3 className="font-semibold text-sm text-gray-900 truncate">
                            {p.title}
                          </h3>

                          <p className="mt-0.5 text-[11px] font-bold tracking-wide text-indigo-700">
                            {getProductCode(
                              p.id
                            )}
                          </p>

                          <p className="text-[11px] text-gray-500">
                            {p.audience ||
                              'Male'}{' '}
                            •{' '}
                            {p.shirt_type ||
                              'Crew neck'}
                          </p>

                          <p className="text-sm font-bold mt-0.5">
                            LKR{' '}
                            {Number(
                              p.price ||
                                0
                            ).toLocaleString()}
                          </p>
                          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.is_active === false ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-700'}`}>{p.is_active === false ? 'Hidden from shop' : 'Active'}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleEditProduct(p)}
                          className="rounded-lg p-2 text-indigo-700 hover:bg-indigo-50"
                          title="Edit product"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteProduct(
                              p.id
                            )
                          }
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                          title="Delete T-shirt"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Size Stock */}
                      <div className="border-t pt-2.5">

                        <div className="flex items-center justify-between mb-1.5">

                          <span className="text-[11px] font-medium text-gray-500">
                            Tap size to toggle stock:
                          </span>

                          <span className="text-[11px] text-gray-400">
                            {availSizes.length}/5 in stock
                          </span>
                        </div>

                        <div className="flex gap-1.5">

                          {ALL_SIZES.map(
                            (size) => {
                              const inStock =
                                availSizes.includes(
                                  size
                                )

                              return (
                                <button
                                  type="button"
                                  key={size}
                                  onClick={() =>
                                    handleToggleProductSize(
                                      p,
                                      size
                                    )
                                  }
                                  className={`flex-1 py-1 text-xs font-semibold rounded-lg border transition ${
                                    inStock
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : 'bg-gray-100 text-gray-400 border-gray-200 line-through'
                                  }`}
                                >
                                  {size}
                                </button>
                              )
                            }
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
