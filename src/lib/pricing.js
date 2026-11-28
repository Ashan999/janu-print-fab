import { supabase } from './supabase'

export const DEFAULT_CUSTOM_BASE_PRICE = 2200

/**
 * Central Janu Print pricing resolver.
 *
 * Resolution order:
 * 1. An explicitly configured package whose complete location list matches.
 * 2. Product-specific base price, then shirt-type base price, then product fallback.
 * 3. Each selected print location is priced independently, using the most specific
 *    active print rule. Legacy package rows without a complete configuration are
 *    intentionally ignored.
 */

export function normalize(value) {
  return value === undefined || value === null || value === ''
    ? null
    : String(value).trim().toLocaleLowerCase()
}

export function sameValue(a, b) {
  return normalize(a) === normalize(b)
}

export function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function formatLKR(amount) {
  return `LKR ${toNumber(amount).toLocaleString('en-LK')}`
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') ?? null
}

function selectionValue(selection, field) {
  const aliases = {
    t_shirt_type: ['tShirtType', 't_shirt_type'],
    print_method: ['printMethod', 'method', 'print_method'],
    print_location: ['printLocation', 'location', 'print_location'],
    print_size: ['printSize', 'size', 'print_size'],
    product_id: ['productId', 'product_id'],
  }
  return firstDefined(...(aliases[field] || [field]).map((key) => selection?.[key]))
}

function fieldMatches(ruleValue, selectedValue) {
  return ruleValue === undefined || ruleValue === null || ruleValue === '' || sameValue(ruleValue, selectedValue)
}

export function ruleMatches(rule, selection = {}) {
  return ['t_shirt_type', 'print_method', 'print_location', 'print_size', 'product_id']
    .every((field) => fieldMatches(rule?.[field], selectionValue(selection, field)))
}

export function getRuleSpecificity(rule) {
  return ['product_id', 't_shirt_type', 'print_method', 'print_location', 'print_size']
    .reduce((score, field) => score + (rule?.[field] ? 1 : 0), 0)
}

function compareRules(a, b) {
  const specificity = getRuleSpecificity(b) - getRuleSpecificity(a)
  if (specificity) return specificity
  const created = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  if (created) return created
  return String(a.id || '').localeCompare(String(b.id || ''))
}

export async function getPricingRules() {
  const { data, error } = await supabase
    .from('pricing_rules')
    .select('*')
    .eq('is_active', true)

  if (error) {
    console.error('Pricing rules load error:', error)
    return { rules: [], error }
  }
  return { rules: data || [], error: null }
}

export function findBestPricingRule(rules, selection = {}) {
  if (!Array.isArray(rules)) return null
  return rules
    .filter((rule) => ruleMatches(rule, selection))
    .sort(compareRules)[0] || null
}

function isBaseRule(rule) {
  return ['tshirt', 'tshirt_base'].includes(rule?.rule_type)
}

function calculateCustomBasePrice({ rules = [], fallbackPrice = DEFAULT_CUSTOM_BASE_PRICE }) {
  const rule = rules
    .filter((item) => item.rule_type === 'custom' && !item.product_id)
    .sort(compareRules)[0] || null
  return rule
    ? { price: toNumber(rule.price), rule, source: 'pricing_rule' }
    : { price: toNumber(fallbackPrice) || DEFAULT_CUSTOM_BASE_PRICE, rule: null, source: 'fallback' }
}

function isPrintRule(rule) {
  return ['print', 'print_method', 'print_size', 'print_location'].includes(rule?.rule_type)
}

function isPackageRule(rule) {
  return ['combination', 'package'].includes(rule?.rule_type)
}

export function calculateTShirtBasePrice({ productPrice = 0, rules = [], productId = null, tShirtType = null }) {
  const baseRules = rules.filter(isBaseRule)
  const productRule = findBestPricingRule(
    baseRules.filter((rule) => rule.product_id),
    { productId, tShirtType },
  )
  const typeRule = findBestPricingRule(
    baseRules.filter((rule) => !rule.product_id),
    { tShirtType },
  )
  const rule = productRule || typeRule

  if (!rule) return { price: toNumber(productPrice), rule: null, source: 'product' }
  return { price: toNumber(rule.price), rule, source: 'pricing_rule' }
}

export function calculateSinglePrintPrice({ rules = [], productId = null, tShirtType = null, printMethod = null, printLocation = null, printSize = null }) {
  const selection = { productId, tShirtType, printMethod, printLocation, printSize }
  const candidates = rules.filter(isPrintRule)
  const productRules = candidates.filter((rule) => rule.product_id)
  const rule = findBestPricingRule(productRules, selection) || findBestPricingRule(candidates.filter((candidate) => !candidate.product_id), selection)
  return { price: toNumber(rule?.price), rule }
}

function normalizedPrintLocation(item = {}) {
  return {
    location: firstDefined(item.location, item.printLocation, item.print_location),
    method: firstDefined(item.method, item.printMethod, item.print_method),
    size: firstDefined(item.size, item.printSize, item.print_size),
    artwork_path: firstDefined(item.artwork_path, item.artworkPath, item.design_path),
  }
}

function normalizedPrintList(items = []) {
  if (!Array.isArray(items)) return []
  return items.map(normalizedPrintLocation)
    .filter((item) => item.location && item.method && item.size)
}

export function calculateMultiplePrintLocations({ rules = [], productId = null, tShirtType = null, printLocations = [] }) {
  const locations = normalizedPrintList(printLocations).map((location) => {
    const result = calculateSinglePrintPrice({
      rules,
      productId,
      tShirtType,
      printMethod: location.method,
      printLocation: location.location,
      printSize: location.size,
    })
    return { ...location, price: result.price, rule: result.rule }
  })

  return {
    total: locations.reduce((sum, item) => sum + item.price, 0),
    locations,
    appliedRules: locations.map((item) => item.rule).filter(Boolean),
  }
}

function packageLocations(rule) {
  const config = rule?.combination_config || rule?.package_config || rule?.conditions
  if (Array.isArray(config)) return config
  if (Array.isArray(config?.locations)) return config.locations
  return []
}

function normalizedSignature(items) {
  return normalizedPrintList(items)
    .map((item) => [normalize(item.location), normalize(item.method), normalize(item.size)])
    .sort((a, b) => a.join('|').localeCompare(b.join('|')))
}

function exactPackageMatch(rule, selection) {
  const configured = normalizedSignature(packageLocations(rule))
  const chosen = normalizedSignature(selection)
  if (!configured.length || configured.length !== chosen.length) return false
  if (rule.t_shirt_type && !sameValue(rule.t_shirt_type, selection.tShirtType)) return false
  if (rule.product_id && !sameValue(rule.product_id, selection.productId)) return false
  return configured.every((item, index) => item.every((value, fieldIndex) => value === chosen[index][fieldIndex]))
}

function findExactPackageRule(rules, { productId, tShirtType, printLocations }) {
  return rules
    .filter(isPackageRule)
    .filter((rule) => exactPackageMatch(rule, { productId, tShirtType, printLocations }))
    .sort(compareRules)[0] || null
}

export function calculatePrintOrderPrice({ itemType = 'gallery', productId = null, productPrice = 0, rules = [], tShirtType = null, printMethod = null, printLocation = null, printSize = null, printLocations = [] }) {
  let requestedLocations = printLocations
  if ((!Array.isArray(requestedLocations) || requestedLocations.length === 0) && (printMethod || printLocation || printSize)) {
    requestedLocations = [{ location: printLocation, method: printMethod, size: printSize }]
  }
  const normalizedLocations = normalizedPrintList(requestedLocations)
  const base = itemType === 'custom'
    ? calculateCustomBasePrice({ rules, fallbackPrice: toNumber(productPrice) || DEFAULT_CUSTOM_BASE_PRICE })
    : calculateTShirtBasePrice({ productPrice, rules, productId, tShirtType })
  const appliedRules = base.rule ? [base.rule] : []
  const packageRule = normalizedLocations.length
    ? findExactPackageRule(rules, { productId, tShirtType, printLocations: normalizedLocations })
    : null

  if (packageRule) {
    appliedRules.push(packageRule)
    return {
      price: base.price + toNumber(packageRule.price),
      basePrice: base.price,
      printPrice: toNumber(packageRule.price),
      locations: normalizedLocations.map((item) => ({ ...item, price: null, rule: null })),
      appliedRules,
      pricingMode: 'combination',
      combinationRule: packageRule,
      source: base.source,
    }
  }

  const print = calculateMultiplePrintLocations({ rules, productId, tShirtType, printLocations: normalizedLocations })
  const pricedLocations = itemType === 'custom'
    ? print.locations.map((location, index) => location.rule
      ? location
      : { ...location, price: index === 0 ? 0 : 500 })
    : print.locations
  const printTotal = itemType === 'custom'
    ? pricedLocations.reduce((sum, location) => sum + toNumber(location.price), 0)
    : print.total
  appliedRules.push(...print.appliedRules)
  return {
    price: base.price + printTotal,
    basePrice: base.price,
    printPrice: printTotal,
    locations: pricedLocations,
    appliedRules,
    pricingMode: 'individual',
    combinationRule: null,
    source: base.source,
  }
}

export function calculateProductPrice({ itemType = 'gallery', productId = null, basePrice = 0, rules = [], tShirtType = null, printMethod = null, printLocation = null, printSize = null, printLocations = [] }) {
  const result = calculatePrintOrderPrice({ itemType, productId, productPrice: basePrice, rules, tShirtType, printMethod, printLocation, printSize, printLocations })
  return {
    ...result,
    rule: result.appliedRules[0] || null,
    source: result.appliedRules.length ? 'pricing_rule' : 'product',
  }
}

export async function getCalculatedPrice(options = {}) {
  const { rules, error } = await getPricingRules()
  if (error) {
    return {
      ...calculatePrintOrderPrice({ ...options, rules: [] }),
      rules: [],
      pricingMode: 'fallback',
      error,
    }
  }
  return { ...calculatePrintOrderPrice({ ...options, rules }), rules, error: null }
}

export function createPricingSnapshot(result) {
  return {
    total_price: toNumber(result?.price),
    base_price: toNumber(result?.basePrice),
    print_price: toNumber(result?.printPrice),
    pricing_mode: result?.pricingMode || 'individual',
    applied_rules: Array.isArray(result?.appliedRules)
      ? result.appliedRules.map((rule) => ({
          id: rule.id || null,
          name: rule.name || null,
          rule_type: rule.rule_type || null,
          price: toNumber(rule.price),
        }))
      : [],
    locations: Array.isArray(result?.locations)
      ? result.locations.map((location) => ({
          location: location.location || null,
          method: location.method || null,
          size: location.size || null,
          price: toNumber(location.price),
          pricing_rule_id: location.rule?.id || null,
          pricing_rule_name: location.rule?.name || null,
          artwork_path: location.artwork_path || null,
        }))
      : [],
  }
}

export default {
  getPricingRules,
  findBestPricingRule,
  calculateTShirtBasePrice,
  calculateCustomBasePrice,
  calculateSinglePrintPrice,
  calculateMultiplePrintLocations,
  calculatePrintOrderPrice,
  calculateProductPrice,
  getCalculatedPrice,
  createPricingSnapshot,
  formatLKR,
}
