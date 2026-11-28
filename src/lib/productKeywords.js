export function normalizeKeywords(values) {
  const keywords = new Map()
  values.flatMap((value) => String(value || '').split(',')).forEach((value) => {
    const keyword = value.trim()
    if (keyword && !keywords.has(keyword.toLocaleLowerCase())) {
      keywords.set(keyword.toLocaleLowerCase(), keyword)
    }
  })
  return [...keywords.values()]
}
