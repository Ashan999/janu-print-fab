import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCart } from '../context/CartContext'
import { useLang } from '../i18n/LanguageContext'
import { useToast } from '../components/ToastContext'
import { useShopSettings } from '../lib/useShopSettings'
import ColorSwatches from '../components/ColorSwatches'
import { formatPrice } from '../config'
import {
  ShoppingBag, Sparkles, Check, Truck, BadgeCheck, MessageCircle, Landmark, Heart,
  Search, SlidersHorizontal, ChevronDown, X, ChevronLeft, ChevronRight, Minus, Plus,
} from 'lucide-react'
import { getPricingRules, calculateProductPrice } from '../lib/pricing'
import { createPricingSnapshot } from '../lib/pricing'

const COLORS = ['Black', 'White', 'Navy', 'Charcoal', 'Red', 'Olive', 'Heather Gray']
const ALL_SIZES = ['S', 'M', 'L', 'XL', 'XXL']
const PAGE_SIZE = 9
const getProductAgeGroup = (product) =>
  !product.age_group || product.age_group === 'Adults'
    ? 'Adults (20+ yrs)'
    : product.age_group

export default function PrintGallery({ onGoToCustom, onOpenAuth, user, isAdmin = false }) {
  const [products, setProducts] = useState([])
  const [pricingRules, setPricingRules] = useState([])

  const [activeAudiences, setActiveAudiences] = useState(['Male', 'Female', 'Kids'])
  const [activeAgeGroups, setActiveAgeGroups] = useState([
    'Toddlers (1-5 yrs)',
    'Kids (6-12 yrs)',
    'Teens (13-19 yrs)',
    'Adults (20+ yrs)',
  ])

  const [activeShirtTypes, setActiveShirtTypes] = useState([
    'Crew neck',
    'V-neck',
    'Polo',
    'Henley',
    'Scoop neck',
    'Boat neck',
    'Off-shoulder',
  ])

  const [loading, setLoading] = useState(true)
  const [selectedAudience, setSelectedAudience] = useState('All')
  const [selectedAgeGroup, setSelectedAgeGroup] = useState('All')
  const [selectedShirtType, setSelectedShirtType] = useState('All')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selections, setSelections] = useState({})
  const [addedId, setAddedId] = useState(null)
  const [priceInquiryProduct, setPriceInquiryProduct] = useState(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [productImageRows, setProductImageRows] = useState([])
  const [wishlistIds, setWishlistIds] = useState([])
  const [imageViewer, setImageViewer] = useState(null)

  const { addToCart, setIsCartOpen } = useCart()
  const { t, tl } = useLang()
  const toast = useToast()
  const shopSettings = useShopSettings()

  const fetchGalleryData = useCallback(async () => {
    setLoading(true)

    const [
      { data: prodData, error: prodErr },
      { data: catData, error: catErr },
      { data: pricingData, error: pricingErr },
      { data: imageData, error: imageErr },
    ] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('category_settings')
        .select('*')
        .order('sort_order', { ascending: true }),

      getPricingRules(),
      supabase.from('product_images').select('product_id,image_url,role,sort_order').order('sort_order', { ascending: true }),
    ])

    if (catErr) {
      console.error('Could not load gallery categories:', catErr)
    }

    if (prodErr) {
      console.error('Could not load gallery products:', prodErr)
    }

    if (pricingErr) {
      console.error('Could not load pricing rules:', pricingErr)
      setPricingRules([])
    } else {
      setPricingRules(pricingData || [])
    }

    if (imageErr) {
      console.error('Could not load additional product images:', imageErr)
      setProductImageRows([])
    } else {
      setProductImageRows(imageData || [])
    }

    if (catData?.length) {
      const auds = catData
        .filter((c) => c.group_type === 'audience' && c.is_active)
        .map((c) => c.label)

      const types = catData
        .filter((c) => c.group_type === 'shirt_type' && c.is_active)
        .map((c) => c.label)

      const ages = catData
        .filter((c) => c.group_type === 'age_group' && c.is_active)
        .map((c) => c.label)

      setActiveAudiences(auds)
      setActiveShirtTypes(types)
      setActiveAgeGroups(ages)

    }

    if (!prodErr && prodData) {
      setProducts(prodData)

      setSelections((prev) => {
        const next = { ...prev }

        prodData.forEach((product) => {
          if (!next[product.id]) {
            const sizes = product.available_sizes || ALL_SIZES

            next[product.id] = {
              color: 'Black',
              size: sizes.includes('L') ? 'L' : sizes[0] || '',
              quantity: 1,
            }
          }
        })

        return next
      })
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    const loadWishlist = async () => {
      if (!user?.id) {
        setWishlistIds([])
        return
      }
      const { data, error } = await supabase.from('wishlist_items').select('product_id').eq('user_id', user.id)
      if (!active) return
      if (error) console.error('Could not load favorites:', error)
      setWishlistIds((data || []).map((item) => String(item.product_id)))
    }
    void loadWishlist()
    return () => { active = false }
  }, [user?.id])

  useEffect(() => {
    void fetchGalleryData()
  }, [fetchGalleryData])

  useEffect(() => {
    if (!imageViewer) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setImageViewer(null)
      if (event.key === 'ArrowRight') setImageViewer((current) => current && ({ ...current, index: (current.index + 1) % current.items.length }))
      if (event.key === 'ArrowLeft') setImageViewer((current) => current && ({ ...current, index: (current.index - 1 + current.items.length) % current.items.length }))
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [imageViewer])

  /*
   * CENTRAL PRICING
   *
   * Product price is used as fallback.
   * If an active pricing rule exists for the product's
   * T-shirt type, that rule becomes the displayed price.
   */
  const getProductCalculatedPrice = useCallback(
    (product, selection = {}) => {
      const result = calculateProductPrice({
        productId: product.id,
        basePrice: product.price,
        rules: pricingRules,
        tShirtType: product.shirt_type || 'Crew neck',
      })

      return result
    },
    [pricingRules]
  )

  const handleSelect = (productId, field, value) => {
    setSelections((previous) => ({
      ...previous,
      [productId]: {
        ...previous[productId],
        [field]: value,
      },
    }))
  }

  const toggleWishlist = async (product) => {
    if (!user?.id) {
      onOpenAuth?.()
      toast({ message: 'Sign in to save favorites.', type: 'error' })
      return
    }
    const productId = String(product.id)
    const isSaved = wishlistIds.includes(productId)
    const request = isSaved
      ? supabase.from('wishlist_items').delete().eq('user_id', user.id).eq('product_id', product.id)
      : supabase.from('wishlist_items').insert({ user_id: user.id, product_id: product.id })
    const { error } = await request
    if (error) {
      toast({ message: error.message || 'Could not update favorites.', type: 'error' })
      return
    }
    setWishlistIds((current) => isSaved
      ? current.filter((id) => id !== productId)
      : [...current, productId])
    toast({ message: isSaved ? 'Removed from favorites.' : 'Added to favorites.', type: 'success' })
  }

  const handleAdd = (product) => {
    const availableSizes = product.available_sizes || ALL_SIZES

    if (!availableSizes.length) return

    const selection = selections[product.id] || {
      color: 'Black',
      size: availableSizes[0],
      quantity: 1,
    }

    if (!availableSizes.includes(selection.size)) return

    const calculatedPrice = getProductCalculatedPrice(product, selection)
    if (!(Number(calculatedPrice.price) > 0)) {
      setPriceInquiryProduct(product)
      return
    }
    const finalPrice = Number(calculatedPrice.price) || 0

    addToCart({
      type: 'gallery',
      product_id: product.id,
      title: product.title,
      price: finalPrice,
      unit_price: finalPrice,
      color: selection.color,
      size: selection.size,
      quantity: Math.max(1, Math.min(99, Number(selection.quantity) || 1)),
      image_url: product.image_url,
      price_snapshot: createPricingSnapshot(calculatedPrice),

      // Pricing information saved with cart item
      pricing_source: calculatedPrice.source,
      pricing_rule_id: calculatedPrice.rule?.id || null,
      pricing_rule_name: calculatedPrice.rule?.name || null,
      t_shirt_type: product.shirt_type || 'Crew neck',
    })

    setAddedId(product.id)

    window.setTimeout(
      () => setAddedId((current) => (current === product.id ? null : current)),
      1200
    )

    toast({
      message: t('toast.added'),
      type: 'success',
      actionLabel: t('toast.viewCart'),
      onAction: () => setIsCartOpen(true),
    })
  }

  const visibleProducts = products.filter(
      (product) => product.is_active !== false &&
      activeAudiences.includes(product.audience || 'Male') &&
      activeShirtTypes.includes(product.shirt_type || 'Crew neck')
  )

  const searchQuery = searchTerm.trim().toLocaleLowerCase()

  const filtered = visibleProducts.filter((product) => {
    const matchesFilters =
      (selectedAudience === 'All' ||
        (product.audience || 'Male') === selectedAudience) &&
      (selectedAgeGroup === 'All' ||
        getProductAgeGroup(product) === selectedAgeGroup) &&
      (selectedShirtType === 'All' ||
        (product.shirt_type || 'Crew neck') === selectedShirtType)

    if (!matchesFilters || !searchQuery) return matchesFilters

    const searchableText = [
      product.title,
      product.category,
      product.audience,
      getProductAgeGroup(product),
      product.shirt_type,
      ...(Array.isArray(product.keywords) ? product.keywords : []),
    ]
      .join(' ')
      .toLocaleLowerCase()

    return searchableText.includes(searchQuery)
  })

  const shownProducts = filtered.slice(0, visibleCount)

  const audienceButtons = ['All', ...activeAudiences]
  const ageGroupButtons = ['All', ...activeAgeGroups]
  const shirtTypeButtons = ['All', ...activeShirtTypes]

  const trustItems = [
    [Truck, 'trust.delivery'],
    [BadgeCheck, 'trust.quality'],
    [MessageCircle, 'trust.support'],
    [Landmark, 'trust.secure'],
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <style>{`
        @keyframes pillPop {
          0% {
            transform: scale(0.94);
            opacity: 0.7;
          }

          60% {
            transform: scale(1.04);
            opacity: 1;
          }

          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes cardFadeIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.99);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .animate-pill-active {
          animation: pillPop 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .animate-card-in {
          animation: cardFadeIn 0.32s ease-out forwards;
        }
      `}</style>

      <section className="bg-gradient-to-r from-gray-900 via-gray-800 to-black text-white rounded-3xl p-5 sm:p-10 mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider bg-white/10 px-3 py-1 rounded-full mb-3">
            <Sparkles className="w-4 h-4" />
            {t('hero.badge')}
          </span>

          <h1 className="text-2xl sm:text-4xl font-bold leading-tight">
            {t('hero.title')}
          </h1>

          <p className="text-gray-200 text-sm sm:text-base mt-2">
            {t('hero.subtitle')}
          </p>
        </div>

        {!isAdmin && (
          <button
            type="button"
            onClick={onGoToCustom}
            className="min-h-12 bg-white text-black font-semibold px-6 py-3 rounded-xl text-sm hover:bg-gray-100 active:scale-95 transition shrink-0 shadow-lg focus-visible:ring-2 ring-indigo-400"
          >
            {t('hero.cta')} →
          </button>
        )}
      </section>

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-2">
        {trustItems.map(([Icon, key]) => (
          <div
            key={key}
            className="flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700"
          >
            <Icon className="h-4 w-4 text-indigo-600" />
            {t(key)}
          </div>
        ))}
      </div>

      <div className="sticky top-16 z-30 -mx-4 mb-5 space-y-3 border-y border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="gallery-filters"
          className="flex min-h-12 w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 text-left font-semibold text-gray-900 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-indigo-700" />

            {t('filter.category')}

            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
              {filtered.length}
            </span>
          </span>

          <ChevronDown
            className={`h-5 w-5 transition-transform ${
              filtersOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {filtersOpen && (
          <div
            id="gallery-filters"
            className="space-y-4 rounded-xl border border-gray-200 bg-white p-3 sm:p-4"
          >
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

              <input
                type="search"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value)
                  setVisibleCount(PAGE_SIZE)
                }}
                placeholder={t('filter.searchPlaceholder')}
                aria-label={t('filter.searchPlaceholder')}
                className="min-h-11 w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </label>

            <div>
              <p className="mb-2 text-xs font-semibold text-gray-700">
                {t('filter.audience')}
              </p>

              <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
                {audienceButtons.map((aud) => (
                  <button
                    key={aud}
                    type="button"
                    onClick={() => {
                      setSelectedAudience(aud)
                      setVisibleCount(PAGE_SIZE)
                    }}
                    className={`min-h-10 px-4 rounded-full text-sm font-semibold whitespace-nowrap transition focus-visible:ring-2 ring-indigo-500 ${
                      selectedAudience === aud
                        ? 'bg-black text-white shadow-md animate-pill-active'
                        : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {aud === 'All' ? t('filter.all') : tl('audience', aud)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-gray-700">
                {t('filter.ageGroup')}
              </p>

              <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
                {ageGroupButtons.map((age) => (
                  <button
                    key={age}
                    type="button"
                    onClick={() => {
                      setSelectedAgeGroup(age)
                      setVisibleCount(PAGE_SIZE)
                    }}
                    className={`min-h-10 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition focus-visible:ring-2 ring-indigo-500 ${
                      selectedAgeGroup === age
                        ? 'bg-emerald-700 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {age === 'All' ? t('filter.all') : age}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-gray-700">
                {t('filter.style')}
              </p>

              <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
                {shirtTypeButtons.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setSelectedShirtType(st)
                      setVisibleCount(PAGE_SIZE)
                    }}
                    className={`min-h-10 px-3.5 rounded-full text-sm font-medium whitespace-nowrap transition focus-visible:ring-2 ring-indigo-500 ${
                      selectedShirtType === st
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {st === 'All' ? t('filter.all') : tl('shirt', st)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedAudience('All')
                  setSelectedAgeGroup('All')
                  setSelectedShirtType('All')
                  setSearchTerm('')
                  setVisibleCount(PAGE_SIZE)
                }}
                className="min-h-10 rounded-lg px-3 text-sm font-medium text-gray-600 underline-offset-4 hover:text-gray-950 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                {t('filter.reset')}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {!loading ? (
            <p className="text-xs text-gray-600">
              {t('filter.count', { count: filtered.length })}
            </p>
          ) : (
            <span />
          )}

        </div>
      </div>

      {loading ? (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          aria-label={t('gallery.loading')}
        >
          {[1, 2, 3].map((number) => (
            <div
              key={number}
              className="bg-gray-100 animate-pulse h-96 rounded-2xl"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <p className="text-gray-700 text-sm">
            {t('product.noResults')}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedAudience('All')
                setSelectedAgeGroup('All')
                setSelectedShirtType('All')
                setSearchTerm('')
                setVisibleCount(PAGE_SIZE)
              }}
              className="min-h-11 bg-gray-100 text-gray-900 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-200 focus-visible:ring-2 ring-indigo-500"
            >
              {t('filter.reset')}
            </button>

            {!isAdmin && (
              <button
                type="button"
                onClick={onGoToCustom}
                className="min-h-11 bg-black text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-800 focus-visible:ring-2 ring-indigo-500"
              >
                {t('product.createCustom')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {shownProducts.map((product) => {
              const availableSizes = product.available_sizes || ALL_SIZES
              const soldOut = availableSizes.length === 0

              const selection = selections[product.id] || {
                color: 'Black',
                size: availableSizes[0] || '',
                quantity: 1,
              }
              const selectedQuantity = Math.max(1, Math.min(99, Number(selection.quantity) || 1))

              const calculatedPrice = getProductCalculatedPrice(product, selection)
              const displayPrice = calculatedPrice.price
      const priceAvailable = Number(displayPrice) > 0
              const productImages = [
                { role: 'Main', url: product.image_url },
                ...productImageRows.filter((image) => String(image.product_id) === String(product.id)).map((image) => ({ role: image.role || 'Detail', url: image.image_url })),
                ...(Array.isArray(product.images) ? product.images.map((image, index) => typeof image === 'string' ? { role: `Detail ${index + 1}`, url: image } : { role: image.role || `Detail ${index + 1}`, url: image.url || image.image_url }) : []),
                ...(Array.isArray(product.image_urls) ? product.image_urls.map((url, index) => ({ role: `Detail ${index + 1}`, url })) : []),
              ].filter((item, index, list) => item.url && list.findIndex((other) => other.url === item.url) === index)

              return (
                <article
                  key={product.id}
                  className="animate-card-in bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col"
                >
                  <div className="aspect-square bg-gray-100 relative overflow-hidden">
                    <button type="button" onClick={() => setImageViewer({ items: productImages, index: 0 })} aria-label={`View images for ${product.title}`} className="h-full w-full cursor-zoom-in">
                      <img src={product.image_url} alt={product.title} loading="lazy" decoding="async" className={`h-full w-full object-cover transition duration-300 ${soldOut ? 'opacity-50 grayscale' : 'hover:scale-105'}`} />
                    </button>

                    {!isAdmin && <button type="button" onClick={() => void toggleWishlist(product)} aria-label={wishlistIds.includes(String(product.id)) ? `Remove ${product.title} from favorites` : `Add ${product.title} to favorites`} aria-pressed={wishlistIds.includes(String(product.id))} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-gray-800 shadow-md transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                      <Heart className={`h-5 w-5 ${wishlistIds.includes(String(product.id)) ? 'fill-rose-600 text-rose-600' : ''}`} />
                    </button>}

                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                      <span className="bg-white/95 backdrop-blur text-gray-900 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                        {tl('audience', product.audience || 'Male')}
                      </span>

                      <span className="bg-black/80 backdrop-blur text-white text-xs font-medium px-2.5 py-1 rounded-full">
                        {tl('shirt', product.shirt_type || 'Crew neck')}
                      </span>

                      <span className="bg-indigo-700/90 backdrop-blur text-white text-xs font-medium px-2.5 py-1 rounded-full">
                        {getProductAgeGroup(product)}
                      </span>
                    </div>

                    {soldOut && (
                      <span className="absolute top-3 right-3 bg-red-700 text-white text-xs font-bold px-3 py-1 rounded-full">
                        {t('product.soldOut')}
                      </span>
                    )}
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-gray-900 break-words">
                          {product.title}
                        </h3>

                        <span className="font-bold text-lg text-gray-900 whitespace-nowrap">
                          {priceAvailable ? formatPrice(displayPrice) : t('product.priceOnRequest')}
                        </span>
                      </div>

                      {calculatedPrice.source === 'pricing_rule' && (
                        <p className="mt-1 text-[11px] text-emerald-600 font-medium">
                          Central pricing
                        </p>
                      )}

                      {Array.isArray(product.keywords) &&
                        product.keywords.length > 0 && (
                          <div
                            className="mt-2 flex flex-wrap gap-1.5"
                            aria-label={t('filter.keywords')}
                          >
                            {product.keywords.map((keyword) => (
                              <span
                                key={keyword}
                                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        )}

                      <div className="mt-4">
                        <div className="mb-2 flex items-center gap-2 text-sm text-gray-700">
                          <span>{t('product.color')}</span>

                          <span className="font-semibold">
                            {tl('color', selection.color)}
                          </span>
                        </div>

                        <ColorSwatches
                          colors={COLORS}
                          value={selection.color}
                          onChange={(color) =>
                            handleSelect(product.id, 'color', color)
                          }
                          disabled={soldOut}
                        />
                      </div>

                      <div className="mt-4">
                        <label className="text-sm text-gray-700 block mb-2">
                          {t('product.size')}
                        </label>

                        <div className="flex gap-2">
                          {ALL_SIZES.map((size) => {
                            const available = availableSizes.includes(size)
                            const selected =
                              selection.size === size && available

                            return (
                              <button
                                key={size}
                                type="button"
                                disabled={!available}
                                aria-pressed={selected}
                                onClick={() =>
                                  handleSelect(
                                    product.id,
                                    'size',
                                    size
                                  )
                                }
                                className={`h-10 min-w-10 flex-1 rounded-lg border text-sm font-semibold transition focus-visible:ring-2 ring-indigo-500 disabled:cursor-not-allowed ${
                                  !available
                                    ? 'border-gray-200 bg-gray-50 text-gray-400 line-through'
                                    : selected
                                      ? 'border-black bg-black text-white'
                                      : 'border-gray-300 text-gray-800 hover:bg-gray-50'
                                }`}
                              >
                                {size}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-700">Quantity</span>
                        <div className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white">
                          <button
                            type="button"
                            aria-label={`Decrease ${product.title} quantity`}
                            disabled={selectedQuantity <= 1}
                            onClick={() => handleSelect(product.id, 'quantity', selectedQuantity - 1)}
                            className="flex h-10 w-10 items-center justify-center rounded-l-lg text-gray-700 hover:bg-gray-50 disabled:text-gray-300"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span aria-live="polite" className="min-w-8 text-center text-sm font-semibold text-gray-900">{selectedQuantity}</span>
                          <button
                            type="button"
                            aria-label={`Increase ${product.title} quantity`}
                            disabled={selectedQuantity >= 99}
                            onClick={() => handleSelect(product.id, 'quantity', selectedQuantity + 1)}
                            className="flex h-10 w-10 items-center justify-center rounded-r-lg text-gray-700 hover:bg-gray-50 disabled:text-gray-300"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAdd(product)}
                      disabled={soldOut}
                      className={`min-h-12 w-full rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] focus-visible:ring-2 ring-indigo-500 ${
                        soldOut
                          ? 'bg-gray-200 text-gray-600 cursor-not-allowed'
                          : !priceAvailable
                            ? 'bg-indigo-700 text-white hover:bg-indigo-800'
                          : 'bg-black text-white hover:bg-gray-800'
                      }`}
                    >
                      {soldOut ? (
                        t('product.soldOut')
                      ) : addedId === product.id ? (
                        <>
                          <Check className="w-5 h-5" />
                          {t('product.added')}
                        </>
                      ) : (
                        priceAvailable ? <>
                          <ShoppingBag className="w-5 h-5" />
                          {t('product.add')}
                        </> : <>{t('product.askForPrice')}</>
                      )}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          {shownProducts.length < filtered.length && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((count) => count + PAGE_SIZE)
                }
                className="min-h-12 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus-visible:ring-2 ring-indigo-500"
              >
                {t('filter.loadMore')}
              </button>
            </div>
          )}
        </>
      )}

      {imageViewer && imageViewer.items[imageViewer.index] && (
        <div role="dialog" aria-modal="true" aria-label="Product image viewer" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setImageViewer(null) }}>
          <button type="button" aria-label="Close image viewer" onClick={() => setImageViewer(null)} className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"><X className="h-6 w-6" /></button>
          {imageViewer.items.length > 1 && <button type="button" aria-label="Previous image" onClick={() => setImageViewer((current) => ({ ...current, index: (current.index - 1 + current.items.length) % current.items.length }))} className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white"><ChevronLeft className="h-6 w-6" /></button>}
          <div className="flex max-h-full max-w-5xl flex-col items-center gap-3"><img src={imageViewer.items[imageViewer.index].url} alt={`${imageViewer.items[imageViewer.index].role} product view`} className="max-h-[80vh] max-w-full object-contain" /><p className="text-sm font-semibold text-white">{imageViewer.items[imageViewer.index].role} · {imageViewer.index + 1} of {imageViewer.items.length}</p></div>
          {imageViewer.items.length > 1 && <button type="button" aria-label="Next image" onClick={() => setImageViewer((current) => ({ ...current, index: (current.index + 1) % current.items.length }))} className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white"><ChevronRight className="h-6 w-6" /></button>}
        </div>
      )}

      {priceInquiryProduct && (
        <div role="dialog" aria-modal="true" aria-labelledby="price-inquiry-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPriceInquiryProduct(null) }}>
          <section className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <button type="button" aria-label={t('common.close')} onClick={() => setPriceInquiryProduct(null)} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            <div className="flex items-center gap-3 pr-10">
              <img src={priceInquiryProduct.image_url} alt={priceInquiryProduct.title} className="h-16 w-16 rounded-xl object-cover" />
              <div>
                <h2 id="price-inquiry-title" className="text-lg font-bold text-gray-900">{t('product.priceInquiryTitle')}</h2>
                <p className="mt-1 text-sm font-medium text-gray-700">{priceInquiryProduct.title}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-gray-600">{t('product.priceInquiryBody')}</p>
            <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-center text-lg font-bold text-gray-900">{shopSettings.contactPhone}</p>
            <a href={`tel:${String(shopSettings.contactPhone || '').replace(/[^\d+]/g, '')}`} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 font-semibold text-white hover:bg-gray-800"><Phone className="h-4 w-4" />{t('product.callForPrice')}</a>
          </section>
        </div>
      )}
    </div>
  )
}
