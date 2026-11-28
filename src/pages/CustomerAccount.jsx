import { useCallback, useEffect, useState } from 'react'
import { Heart, MapPin, Plus, Save, Trash2, Upload, UserRound } from 'lucide-react'
import { supabase, safeFileName, validateUpload, getSignedUrl } from '../lib/supabase'
import { useToast } from '../components/ToastContext'
import { formatPrice } from '../config'

const EMPTY_ADDRESS = {
  label: 'Home', recipient_name: '', phone: '', address: '', city: '', district: '',
  postal_code: '', notes: '', is_default: false,
}

export default function CustomerAccount({ user }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingAddress, setSavingAddress] = useState(false)
  const [uploadingArtwork, setUploadingArtwork] = useState(false)
  const [profile, setProfile] = useState({ full_name: '', phone: '', nic: '' })
  const [addresses, setAddresses] = useState([])
  const [addressForm, setAddressForm] = useState(null)
  const [editingAddressId, setEditingAddressId] = useState(null)
  const [artworks, setArtworks] = useState([])
  const [artworkName, setArtworkName] = useState('')
  const [artworkFile, setArtworkFile] = useState(null)
  const [wishlist, setWishlist] = useState([])

  const loadAccount = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    const [profileResult, addressResult, artworkResult, wishlistResult] = await Promise.all([
      supabase.from('customer_profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('customer_addresses').select('*').eq('user_id', user.id).order('is_default', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('customer_artworks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('wishlist_items').select('product_id, created_at, product:products(id,title,image_url,price,available_sizes)').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])
    const failed = [profileResult, addressResult, artworkResult, wishlistResult].find((result) => result.error)
    if (failed) {
      console.error('Account data load error:', failed.error)
      toast({ message: failed.error.message || 'Could not load account details.', type: 'error' })
    }
    const profileData = profileResult.data
    setProfile({
      full_name: profileData?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || '',
      phone: profileData?.phone || user.user_metadata?.phone || '',
      nic: profileData?.nic || '',
    })
    setAddresses(addressResult.data || [])
    setArtworks(await Promise.all((artworkResult.data || []).map(async (artwork) => ({
      ...artwork,
      preview_url: await getSignedUrl('customer-designs', artwork.file_path),
    }))))
    setWishlist((wishlistResult.data || []).filter((entry) => entry.product))
    setLoading(false)
  }, [user, toast])

  useEffect(() => { void loadAccount() }, [loadAccount])

  const saveProfile = async (event) => {
    event.preventDefault()
    if (profile.full_name.trim().length < 2) {
      toast({ message: 'Enter your full name.', type: 'error' })
      return
    }
    setSavingProfile(true)
    const { error } = await supabase.from('customer_profiles').upsert({
      id: user.id,
      full_name: profile.full_name.trim(),
      phone: profile.phone.trim(),
      nic: profile.nic.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    if (error) toast({ message: error.message, type: 'error' })
    else toast({ message: 'Profile saved.', type: 'success' })
    setSavingProfile(false)
  }

  const saveAddress = async (event) => {
    event.preventDefault()
    if (!addressForm) return
    if (addressForm.recipient_name.trim().length < 2 || addressForm.phone.trim().length < 7 || addressForm.address.trim().length < 5 || addressForm.city.trim().length < 2) {
      toast({ message: 'Check the recipient, phone, street address, and city fields.', type: 'error' })
      return
    }
    setSavingAddress(true)
    if (addressForm.is_default) {
      const { error: unsetError } = await supabase.from('customer_addresses').update({ is_default: false }).eq('user_id', user.id)
      if (unsetError) {
        toast({ message: unsetError.message, type: 'error' })
        setSavingAddress(false)
        return
      }
    }
    const payload = { ...addressForm, user_id: user.id, updated_at: new Date().toISOString() }
    const request = editingAddressId
      ? supabase.from('customer_addresses').update(payload).eq('id', editingAddressId).eq('user_id', user.id)
      : supabase.from('customer_addresses').insert(payload)
    const { error } = await request
    if (error) toast({ message: error.message, type: 'error' })
    else {
      toast({ message: 'Delivery address saved.', type: 'success' })
      setAddressForm(null)
      setEditingAddressId(null)
      await loadAccount()
    }
    setSavingAddress(false)
  }

  const removeAddress = async (id) => {
    const { error } = await supabase.from('customer_addresses').delete().eq('id', id).eq('user_id', user.id)
    if (error) toast({ message: error.message, type: 'error' })
    else setAddresses((current) => current.filter((address) => address.id !== id))
  }

  const setDefaultAddress = async (address) => {
    const { error: unsetError } = await supabase.from('customer_addresses').update({ is_default: false }).eq('user_id', user.id)
    if (unsetError) return toast({ message: unsetError.message, type: 'error' })
    const { error } = await supabase.from('customer_addresses').update({ is_default: true }).eq('id', address.id).eq('user_id', user.id)
    if (error) toast({ message: error.message, type: 'error' })
    else await loadAccount()
  }

  const saveArtwork = async (event) => {
    event.preventDefault()
    const validationError = validateUpload(artworkFile, { maxBytes: 10 * 1024 * 1024 })
    if (validationError) return toast({ message: validationError === 'err.fileType' ? 'Use a PNG, JPG, WEBP, or PDF file.' : 'Choose an artwork file up to 10 MB.', type: 'error' })
    if (!artworkName.trim()) return toast({ message: 'Give this artwork a name.', type: 'error' })
    setUploadingArtwork(true)
    const filePath = `${user.id}/${safeFileName(artworkFile)}`
    const { error: uploadError } = await supabase.storage.from('customer-designs').upload(filePath, artworkFile, { upsert: false })
    if (uploadError) {
      toast({ message: uploadError.message, type: 'error' })
      setUploadingArtwork(false)
      return
    }
    const { error } = await supabase.from('customer_artworks').insert({
      user_id: user.id,
      name: artworkName.trim(),
      file_path: filePath,
      mime_type: artworkFile.type,
      file_size_bytes: artworkFile.size,
    })
    if (error) {
      await supabase.storage.from('customer-designs').remove([filePath])
      toast({ message: error.message, type: 'error' })
    } else {
      setArtworkName('')
      setArtworkFile(null)
      await loadAccount()
      toast({ message: 'Artwork saved for later.', type: 'success' })
    }
    setUploadingArtwork(false)
  }

  const deleteArtwork = async (artwork) => {
    const { error: fileError } = await supabase.storage.from('customer-designs').remove([artwork.file_path])
    if (fileError) return toast({ message: fileError.message, type: 'error' })
    const { error } = await supabase.from('customer_artworks').delete().eq('id', artwork.id).eq('user_id', user.id)
    if (error) toast({ message: error.message, type: 'error' })
    else setArtworks((current) => current.filter((item) => item.id !== artwork.id))
  }

  const removeWishlistItem = async (productId) => {
    const { error } = await supabase.from('wishlist_items').delete().eq('user_id', user.id).eq('product_id', productId)
    if (error) toast({ message: error.message, type: 'error' })
    else setWishlist((current) => current.filter((entry) => entry.product_id !== productId))
  }

  if (loading) return <div className="mx-auto max-w-5xl px-4 py-10"><div className="h-44 animate-pulse rounded-2xl bg-gray-100" /></div>

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-7 pb-10">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">My account</h1>
        <p className="mt-1 text-sm text-gray-600">Manage your contact details, delivery addresses, saved artwork, and favorites.</p>
      </header>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><UserRound className="h-5 w-5" /> Profile</h2>
        <p className="mt-1 text-sm text-gray-600">{user.email}</p>
        <form onSubmit={saveProfile} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">Full name<input value={profile.full_name} onChange={(event) => setProfile({ ...profile, full_name: event.target.value })} autoComplete="name" required className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 font-normal" /></label>
          <label className="text-sm font-medium text-gray-700">Phone<input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} autoComplete="tel" type="tel" className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 font-normal" /></label>
          <label className="text-sm font-medium text-gray-700">NIC (optional)<input value={profile.nic} onChange={(event) => setProfile({ ...profile, nic: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 font-normal" /></label>
          <div className="flex items-end"><button disabled={savingProfile} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gray-900 px-4 font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{savingProfile ? 'Saving…' : 'Save profile'}</button></div>
        </form>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><MapPin className="h-5 w-5" /> Delivery addresses</h2><button type="button" onClick={() => { setEditingAddressId(null); setAddressForm({ ...EMPTY_ADDRESS, recipient_name: profile.full_name, phone: profile.phone, is_default: addresses.length === 0 }) }} className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm font-semibold"><Plus className="h-4 w-4" /> Add address</button></div>
        {addresses.length === 0 && !addressForm ? <p className="mt-4 text-sm text-gray-600">No saved addresses yet.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{addresses.map((address) => <article key={address.id} className="rounded-xl border border-gray-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">{address.label}</h3>{address.is_default && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">Default</span>}</div><p className="mt-2 text-sm font-medium">{address.recipient_name} · {address.phone}</p><p className="mt-1 whitespace-pre-line text-sm text-gray-600">{address.address}, {address.city}{address.district ? `, ${address.district}` : ''}{address.postal_code ? ` ${address.postal_code}` : ''}</p></div><button type="button" onClick={() => void removeAddress(address.id)} aria-label="Delete address" className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div><div className="mt-3 flex gap-3 text-sm"><button type="button" onClick={() => { setEditingAddressId(address.id); setAddressForm({ ...address }) }} className="font-semibold text-indigo-700">Edit</button>{!address.is_default && <button type="button" onClick={() => void setDefaultAddress(address)} className="font-semibold text-gray-700">Set as default</button>}</div></article>)}</div>}
        {addressForm && <form onSubmit={saveAddress} className="mt-5 grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Address type<select value={addressForm.label} onChange={(event) => setAddressForm({ ...addressForm, label: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3"><option>Home</option><option>Office</option><option>Other</option></select></label>
          <label className="text-sm font-medium">Recipient name<input required value={addressForm.recipient_name} onChange={(event) => setAddressForm({ ...addressForm, recipient_name: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
          <label className="text-sm font-medium">Phone<input required type="tel" value={addressForm.phone} onChange={(event) => setAddressForm({ ...addressForm, phone: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
          <label className="text-sm font-medium">City<input required value={addressForm.city} onChange={(event) => setAddressForm({ ...addressForm, city: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
          <label className="text-sm font-medium sm:col-span-2">Address<input required value={addressForm.address} onChange={(event) => setAddressForm({ ...addressForm, address: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
          <label className="text-sm font-medium">District<input value={addressForm.district || ''} onChange={(event) => setAddressForm({ ...addressForm, district: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
          <label className="text-sm font-medium">Postal code<input value={addressForm.postal_code || ''} onChange={(event) => setAddressForm({ ...addressForm, postal_code: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
          <label className="text-sm font-medium sm:col-span-2">Delivery notes<input value={addressForm.notes || ''} onChange={(event) => setAddressForm({ ...addressForm, notes: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={Boolean(addressForm.is_default)} onChange={(event) => setAddressForm({ ...addressForm, is_default: event.target.checked })} /> Use as my default delivery address</label>
          <div className="flex gap-2 sm:col-span-2"><button disabled={savingAddress} className="min-h-11 rounded-lg bg-gray-900 px-4 font-semibold text-white disabled:opacity-50">{savingAddress ? 'Saving…' : 'Save address'}</button><button type="button" onClick={() => { setAddressForm(null); setEditingAddressId(null) }} className="min-h-11 rounded-lg border px-4 font-semibold">Cancel</button></div>
        </form>}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Saved artwork</h2>
        <p className="mt-1 text-sm text-gray-600">Private files only you and authorized Janu Print staff can access.</p>
        <form onSubmit={saveArtwork} className="mt-4 flex flex-col gap-3 rounded-xl bg-gray-50 p-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-medium">Artwork name<input value={artworkName} onChange={(event) => setArtworkName(event.target.value)} required maxLength={120} placeholder="e.g. Front logo" className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3" /></label>
          <label className="flex-1 text-sm font-medium">File<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setArtworkFile(event.target.files?.[0] || null)} required className="mt-1 block min-h-11 w-full text-sm" /></label>
          <button disabled={uploadingArtwork} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 font-semibold text-white disabled:opacity-50"><Upload className="h-4 w-4" />{uploadingArtwork ? 'Uploading…' : 'Save artwork'}</button>
        </form>
        {artworks.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{artworks.map((artwork) => <article key={artwork.id} className="overflow-hidden rounded-xl border border-gray-200"><div className="flex aspect-square items-center justify-center bg-gray-50">{artwork.preview_url && artwork.mime_type.startsWith('image/') ? <img src={artwork.preview_url} alt={artwork.name} className="h-full w-full object-contain" /> : <span className="text-sm font-semibold text-gray-500">PDF artwork</span>}</div><div className="flex items-center justify-between gap-2 p-3"><span className="min-w-0 truncate text-sm font-medium">{artwork.name}</span><button type="button" onClick={() => void deleteArtwork(artwork)} aria-label={`Delete ${artwork.name}`} className="shrink-0 rounded p-1.5 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div></article>)}</div>}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><Heart className="h-5 w-5" /> Favorites</h2>
        {wishlist.length === 0 ? <p className="mt-3 text-sm text-gray-600">You have no saved favorites yet.</p> : <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{wishlist.map(({ product }) => <article key={product.id} className="overflow-hidden rounded-xl border border-gray-200"><img src={product.image_url} alt={product.title} className="aspect-square w-full bg-gray-100 object-cover" /><div className="p-3"><h3 className="line-clamp-2 min-h-10 text-sm font-semibold">{product.title}</h3><p className="mt-1 text-sm">{formatPrice(product.price)}</p><button type="button" onClick={() => void removeWishlistItem(product.id)} className="mt-2 min-h-9 text-sm font-semibold text-red-700">Remove favorite</button></div></article>)}</div>}
      </section>
    </div>
  )
}
