export function getOrderItemPrintLocations(item) {
  if (Array.isArray(item?.print_locations) && item.print_locations.length > 0) {
    return item.print_locations
  }

  const encoded = String(item?.title || '').match(/\[Print:\s*(.*?)\]$/i)?.[1]
  if (!encoded) return []

  const artworkPath = item.design_path || item.design_url || item.custom_design_url || null
  return encoded.split(';').map((entry) => {
    const [location, method, size] = entry.split('/').map((part) => part.trim())
    return location && method && size
      ? { location, method, size, artwork_path: artworkPath }
      : null
  }).filter(Boolean)
}

export function getOrderItemPrintRequirements(item) {
  return getOrderItemPrintLocations(item)
    .filter((location) => location?.location && location?.method && location?.size)
    .map((location) => `${location.location} / ${location.method} / ${location.size}`)
    .join('; ')
}

export function getOrderItemDisplayTitle(item) {
  return String(item?.title || '').replace(/\s*\[Print:\s*.*?\]$/i, '').trim()
}
