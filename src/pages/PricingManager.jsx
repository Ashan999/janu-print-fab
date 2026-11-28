import { useEffect, useMemo, useState } from 'react'
import {
  Edit3,
  Plus,
  Search,
  Trash2,
  X,
  Check,
  Power,
  RefreshCw,
  DollarSign,
  Shirt,
  Printer,
  Layers,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const T_SHIRT_TYPES = [
  'Crew Neck',
  'V-Neck',
  'Polo',
  'Henley',
  'Scoop Neck',
  'Boat Neck',
  'Off-Shoulder',
  'Oversized',
]

const PRINT_METHODS = [
  'DTF',
  'Screen Print',
  'DTG',
  'Vinyl',
  'Sublimation',
  'Embroidery',
]

const PRINT_LOCATIONS = [
  'Front',
  'Back',
  'Left Chest',
  'Right Chest',
  'Sleeve',
  'Full Front',
  'Full Back',
]

const PRINT_SIZES = [
  'A6',
  'A5',
  'A4',
  'A3',
  'Custom',
]

const RULE_TYPES = [
  {
    value: 'tshirt',
    label: 'T-Shirt Base Price',
    description: 'Base price for a T-shirt type',
    icon: Shirt,
  },
  {
    value: 'custom',
    label: 'Custom Design Base',
    description: 'Base price for a customer uploaded T-shirt design',
    icon: Shirt,
  },
  {
    value: 'print',
    label: 'Print Price',
    description: 'Price for a print configuration',
    icon: Printer,
  },
  {
    value: 'combination',
    label: 'Combination / Package',
    description: 'Special price for a combination',
    icon: Layers,
  },
]

const EMPTY_FORM = {
  name: '',
  rule_type: 'tshirt',
  product_id: '',
  t_shirt_type: '',
  print_method: '',
  print_location: '',
  print_size: '',
  price: '',
  is_active: true,
  combination_locations: [
    { location: 'Front', method: 'DTF', size: 'A4' },
    { location: 'Back', method: 'DTF', size: 'A4' },
  ],
}

function formatLKR(value) {
  return `LKR ${Number(value || 0).toLocaleString()}`
}

function getRuleTypeLabel(type) {
  const item = RULE_TYPES.find((rule) => rule.value === type)
  return item?.label || type
}

function getRuleDescription(rule) {
  if (rule.rule_type === 'combination' || rule.rule_type === 'package') {
    const locations = Array.isArray(rule.combination_config) ? rule.combination_config : []
    if (locations.length < 2) return 'Needs a complete package configuration'
    return locations
      .map((item) => [item.location, item.method, item.size].filter(Boolean).join(' · '))
      .join(' + ')
  }

  const parts = []

  if (rule.t_shirt_type) {
    parts.push(rule.t_shirt_type)
  }
  if (rule.product_id) {
    parts.push(`Product ${String(rule.product_id).slice(0, 8)}`)
  }

  if (rule.print_method) {
    parts.push(rule.print_method)
  }

  if (rule.print_location) {
    parts.push(rule.print_location)
  }

  if (rule.print_size) {
    parts.push(rule.print_size)
  }

  return parts.length > 0 ? parts.join(' • ') : 'All configurations'
}

export default function PricingManager() {
  const [rules, setRules] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const loadRules = async () => {
    setLoading(true)

    const [
      { data, error },
      { data: productData, error: productError },
    ] = await Promise.all([
      supabase
        .from('pricing_rules')
        .select('*')
        .order('rule_type', { ascending: true })
        .order('created_at', { ascending: false }),
      supabase.from('products').select('id,title').order('title'),
    ])

    if (error) {
      console.error('Pricing rules load error:', error)
      alert(`Could not load pricing rules.\n\n${error.message}`)
      setRules([])
    } else {
      setRules(data || [])
    }

    if (productError) {
      console.error('Pricing product list load error:', productError)
      setProducts([])
    } else {
      setProducts(productData || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadRules()
  }, [])

  const filteredRules = useMemo(() => {
    const query = search.trim().toLowerCase()

    return rules.filter((rule) => {
      const matchesSearch =
        !query ||
        [
          rule.name,
          rule.rule_type,
          rule.t_shirt_type,
          rule.print_method,
          rule.print_location,
          rule.print_size,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(query)
          )

      const matchesType =
        typeFilter === 'all' || rule.rule_type === typeFilter

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && rule.is_active) ||
        (statusFilter === 'inactive' && !rule.is_active)

      return matchesSearch && matchesType && matchesStatus
    })
  }, [rules, search, typeFilter, statusFilter])

  const stats = useMemo(() => {
    const active = rules.filter((rule) => rule.is_active).length
    const inactive = rules.filter((rule) => !rule.is_active).length

    const tshirt = rules.filter(
      (rule) =>
        rule.rule_type === 'tshirt' ||
        rule.rule_type === 'tshirt_base'
    ).length

    const print = rules.filter(
      (rule) =>
        rule.rule_type === 'print' ||
        rule.rule_type === 'print_method' ||
        rule.rule_type === 'print_size' ||
        rule.rule_type === 'print_location'
    ).length

    const combination = rules.filter(
      (rule) =>
        rule.rule_type === 'combination' ||
        rule.rule_type === 'package'
    ).length

    return {
      total: rules.length,
      active,
      inactive,
      tshirt,
      print,
      combination,
    }
  }, [rules])

  const openCreate = () => {
    setEditingRule(null)

    setForm({
      ...EMPTY_FORM,
    })

    setModalOpen(true)
  }

  const openEdit = (rule) => {
    setEditingRule(rule)

    setForm({
      name: rule.name || '',
      rule_type:
        rule.rule_type === 'tshirt_base'
          ? 'tshirt'
          : rule.rule_type === 'package'
            ? 'combination'
            : rule.rule_type || 'tshirt',
      product_id: rule.product_id || '',
      t_shirt_type: rule.t_shirt_type || '',
      print_method: rule.print_method || '',
      print_location: rule.print_location || '',
      print_size: rule.print_size || '',
      price: rule.price ?? '',
      is_active: Boolean(rule.is_active),
      combination_locations: Array.isArray(rule.combination_config)
        ? rule.combination_config.map((location) => ({
            location: location.location || '',
            method: location.method || '',
            size: location.size || '',
          }))
        : [
            { location: 'Front', method: 'DTF', size: 'A4' },
            { location: 'Back', method: 'DTF', size: 'A4' },
          ],
    })

    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return

    setModalOpen(false)
    setEditingRule(null)
    setForm(EMPTY_FORM)
  }

  const handleChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleRuleTypeChange = (value) => {
    setForm((current) => ({
      ...current,
      rule_type: value,
      product_id: value === 'custom' ? '' : current.product_id,
      t_shirt_type:
        value === 'tshirt' ? current.t_shirt_type : '',
      print_method:
        value === 'tshirt' ? '' : current.print_method,
      print_location:
        value === 'tshirt' ? '' : current.print_location,
      print_size:
        value === 'tshirt' ? '' : current.print_size,
    }))
  }

  const validateForm = () => {
    if (!form.name.trim()) {
      return 'Please enter a pricing rule name.'
    }

    if (
      form.price === '' ||
      form.price === null ||
      Number(form.price) < 0
    ) {
      return 'Please enter a valid price.'
    }

    if (form.rule_type === 'tshirt' && !form.t_shirt_type && !form.product_id) {
      return 'Select a T-shirt type or a specific product.'
    }

    if (form.rule_type === 'print') {
      if (!form.print_method) {
        return 'Please select a print method.'
      }

      if (!form.print_location) {
        return 'Please select a print location.'
      }

      if (!form.print_size) {
        return 'Please select a print size.'
      }
    }

    if (form.rule_type === 'combination') {
      if (form.combination_locations.length < 2 || form.combination_locations.some((item) => !item.location || !item.method || !item.size)) {
        return 'Add at least two complete print locations to define this package.'
      }
    }

    return null
  }

  const saveRule = async (event) => {
    event.preventDefault()

    const validationError = validateForm()

    if (validationError) {
      alert(validationError)
      return
    }

    setSaving(true)

    const payload = {
      name: form.name.trim(),
      rule_type: form.rule_type,
      product_id: form.product_id || null,
      t_shirt_type: form.t_shirt_type || null,
      print_method: form.rule_type === 'print' ? form.print_method || null : null,
      print_location: form.rule_type === 'print' ? form.print_location || null : null,
      print_size: form.rule_type === 'print' ? form.print_size || null : null,
      combination_config: form.rule_type === 'combination'
        ? form.combination_locations.map(({ location, method, size }) => ({ location, method, size }))
        : null,
      price: Number(form.price),
      is_active: Boolean(form.is_active),
    }

    let result

    if (editingRule) {
      result = await supabase
        .from('pricing_rules')
        .update(payload)
        .eq('id', editingRule.id)
    } else {
      result = await supabase
        .from('pricing_rules')
        .insert(payload)
    }

    if (result.error) {
      console.error('Pricing rule save error:', result.error)

      alert(
        `Could not save pricing rule.\n\n${result.error.message}`
      )

      setSaving(false)
      return
    }

    setSaving(false)
    setModalOpen(false)
    setEditingRule(null)
    setForm(EMPTY_FORM)

    await loadRules()
  }

  const toggleActive = async (rule) => {
    const nextStatus = !rule.is_active

    const { error } = await supabase
      .from('pricing_rules')
      .update({
        is_active: nextStatus,
      })
      .eq('id', rule.id)

    if (error) {
      console.error('Pricing rule status update error:', error)

      alert(
        `Could not update pricing rule status.\n\n${error.message}`
      )

      return
    }

    setRules((current) =>
      current.map((item) =>
        item.id === rule.id
          ? {
              ...item,
              is_active: nextStatus,
            }
          : item
      )
    )
  }

  const deleteRule = async (rule) => {
    const confirmed = window.confirm(
      `Delete pricing rule "${rule.name}"?\n\nThis cannot be undone.`
    )

    if (!confirmed) return

    setDeletingId(rule.id)

    const { error } = await supabase
      .from('pricing_rules')
      .delete()
      .eq('id', rule.id)

    if (error) {
      console.error('Pricing rule delete error:', error)

      alert(
        `Could not delete pricing rule.\n\n${error.message}`
      )

      setDeletingId(null)
      return
    }

    setRules((current) =>
      current.filter((item) => item.id !== rule.id)
    )

    setDeletingId(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Pricing Manager
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Manage central T-shirt and printing prices.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadRules}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  loading ? 'animate-spin' : ''
                }`}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add Pricing Rule
            </button>
          </div>
        </div>

        {/* Stats */}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard
            icon={DollarSign}
            label="Total Rules"
            value={stats.total}
          />

          <StatCard
            icon={Check}
            label="Active"
            value={stats.active}
          />

          <StatCard
            icon={Shirt}
            label="T-Shirts"
            value={stats.tshirt}
          />

          <StatCard
            icon={Shirt}
            label="Custom Base"
            value={rules.filter((rule) => rule.rule_type === 'custom').length}
          />

          <StatCard
            icon={Printer}
            label="Print Rules"
            value={stats.print}
          />

          <StatCard
            icon={Layers}
            label="Packages"
            value={stats.combination}
          />
        </div>

        {/* Filters */}

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_200px_200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search pricing rules..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value)
              }
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
            >
              <option value="all">All Types</option>

              <option value="tshirt">
                T-Shirt Base
              </option>

              <option value="print">
                Print
              </option>

              <option value="combination">
                Combination
              </option>
            </select>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All Status</option>
            </select>
          </div>
        </div>

        {/* Rules */}

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <RefreshCw className="h-5 w-5 animate-spin" />
                Loading pricing rules...
              </div>
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
              <DollarSign className="h-10 w-10 text-gray-300" />

              <h3 className="mt-3 text-base font-semibold text-gray-900">
                No pricing rules found
              </h3>

              <p className="mt-1 max-w-md text-sm text-gray-500">
                Create your first central pricing rule to start
                controlling T-shirt and printing prices.
              </p>

              <button
                type="button"
                onClick={openCreate}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Add Pricing Rule
              </button>
            </div>
          ) : (
            <>
              {/* Desktop table */}

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Rule
                      </th>

                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Type
                      </th>

                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Configuration
                      </th>

                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Price
                      </th>

                      <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Status
                      </th>

                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {filteredRules.map((rule) => (
                      <tr
                        key={rule.id}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-5 py-4">
                          <div className="font-semibold text-gray-900">
                            {rule.name}
                          </div>

                          {rule.created_at && (
                            <div className="mt-1 text-xs text-gray-400">
                              {new Date(
                                rule.created_at
                              ).toLocaleDateString()}
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                            {getRuleTypeLabel(
                              rule.rule_type
                            )}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="max-w-xs text-sm text-gray-700">
                            {getRuleDescription(rule)}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <span className="text-sm font-bold text-gray-900">
                            {formatLKR(rule.price)}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              toggleActive(rule)
                            }
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                              rule.is_active
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                rule.is_active
                                  ? 'bg-emerald-500'
                                  : 'bg-gray-400'
                              }`}
                            />

                            {rule.is_active
                              ? 'Active'
                              : 'Inactive'}
                          </button>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openEdit(rule)
                              }
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100"
                              title="Edit"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                deleteRule(rule)
                              }
                              disabled={
                                deletingId === rule.id
                              }
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                              title="Delete"
                            >
                              {deletingId === rule.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}

              <div className="divide-y divide-gray-100 md:hidden">
                {filteredRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-gray-900">
                          {rule.name}
                        </h3>

                        <div className="mt-1">
                          <span className="inline-flex rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
                            {getRuleTypeLabel(
                              rule.rule_type
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-bold text-gray-900">
                          {formatLKR(rule.price)}
                        </div>

                        <div
                          className={`mt-1 text-xs font-semibold ${
                            rule.is_active
                              ? 'text-emerald-600'
                              : 'text-gray-400'
                          }`}
                        >
                          {rule.is_active
                            ? 'Active'
                            : 'Inactive'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg bg-gray-50 p-3">
                      <p className="text-xs font-medium text-gray-500">
                        Configuration
                      </p>

                      <p className="mt-1 text-sm text-gray-800">
                        {getRuleDescription(rule)}
                      </p>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          toggleActive(rule)
                        }
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700"
                      >
                        <Power className="h-4 w-4" />

                        {rule.is_active
                          ? 'Deactivate'
                          : 'Activate'}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openEdit(rule)
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700"
                      >
                        <Edit3 className="h-4 w-4" />
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          deleteRule(rule)
                        }
                        disabled={
                          deletingId === rule.id
                        }
                        className="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
          <div className="flex gap-3">
            <div className="mt-0.5">
              <DollarSign className="h-5 w-5 text-indigo-600" />
            </div>

            <div>
              <h3 className="text-sm font-bold text-indigo-900">
                How the pricing system works
              </h3>

              <p className="mt-1 text-sm leading-6 text-indigo-800">
                Each selected print location is priced independently. A package price is used only when every configured location, method, and size exactly matches the customer order. Until you add a Custom Design Base rule, uploaded designs use the existing LKR 2,200 base price.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-4">
          <div className="max-h-[95vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl md:max-w-2xl md:rounded-2xl">
            {/* Modal header */}

            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {editingRule
                    ? 'Edit Pricing Rule'
                    : 'Add Pricing Rule'}
                </h2>

                <p className="mt-0.5 text-xs text-gray-500">
                  Create a central pricing rule for your
                  printing business.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}

            <form
              onSubmit={saveRule}
              className="space-y-5 p-5"
            >
              {/* Name */}

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                  Rule Name
                </label>

                <input
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    handleChange(
                      'name',
                      event.target.value
                    )
                  }
                  placeholder="Example: Crew Neck Basic"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {/* Rule type */}

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Pricing Type
                </label>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {RULE_TYPES.map((item) => {
                    const Icon = item.icon
                    const selected =
                      form.rule_type === item.value

                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() =>
                          handleRuleTypeChange(
                            item.value
                          )
                        }
                        className={`rounded-xl border p-3 text-left transition ${
                          selected
                            ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            selected
                              ? 'text-indigo-600'
                              : 'text-gray-500'
                          }`}
                        />

                        <div className="mt-2 text-sm font-bold text-gray-900">
                          {item.label}
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                          {item.description}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* T-shirt type */}

              {form.rule_type !== 'custom' && <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                  Product override <span className="font-normal text-gray-400">Optional</span>
                </label>
                <select
                  value={form.product_id}
                  onChange={(event) => handleChange('product_id', event.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                >
                  <option value="">Use for all matching products</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
                </select>
              </div>}

              {(form.rule_type === 'tshirt' ||
                form.rule_type === 'print' ||
                form.rule_type === 'combination') && (
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    T-Shirt Type
                    <span className="ml-1 font-normal text-gray-400">
                    Optional when a product override is selected
                    </span>
                  </label>

                  <select
                    value={form.t_shirt_type}
                    onChange={(event) =>
                      handleChange(
                        't_shirt_type',
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="">
                      All T-Shirt Types
                    </option>

                    {T_SHIRT_TYPES.map((type) => (
                      <option
                        key={type}
                        value={type}
                      >
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Print method */}

              {form.rule_type === 'print' && (
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Print Method
                  </label>

                  <select
                    value={form.print_method}
                    onChange={(event) =>
                      handleChange(
                        'print_method',
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="">
                      Any Print Method
                    </option>

                    {PRINT_METHODS.map((method) => (
                      <option
                        key={method}
                        value={method}
                      >
                        {method}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Print location */}

              {form.rule_type === 'print' && (
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Print Location
                  </label>

                  <select
                    value={form.print_location}
                    onChange={(event) =>
                      handleChange(
                        'print_location',
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="">
                      Any Print Location
                    </option>

                    {PRINT_LOCATIONS.map(
                      (location) => (
                        <option
                          key={location}
                          value={location}
                        >
                          {location}
                        </option>
                      )
                    )}
                  </select>
                </div>
              )}

              {/* Print size */}

              {form.rule_type === 'print' && (
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Print Size
                  </label>

                  <select
                    value={form.print_size}
                    onChange={(event) =>
                      handleChange(
                        'print_size',
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="">
                      Any Print Size
                    </option>

                    {PRINT_SIZES.map((size) => (
                      <option
                        key={size}
                        value={size}
                      >
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {form.rule_type === 'combination' && (
                <section className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Exact package locations</h3>
                    <p className="mt-1 text-xs leading-5 text-gray-600">Add at least two locations. This price applies only when the order has the exact same set of locations, methods, and sizes.</p>
                  </div>
                  {form.combination_locations.map((location, index) => (
                    <div key={`package-location-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                      <select aria-label={`Package location ${index + 1}`} value={location.location} onChange={(event) => handleChange('combination_locations', form.combination_locations.map((item, itemIndex) => itemIndex === index ? { ...item, location: event.target.value } : item))} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm">
                        <option value="">Choose location</option>{PRINT_LOCATIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <select aria-label={`Package method ${index + 1}`} value={location.method} onChange={(event) => handleChange('combination_locations', form.combination_locations.map((item, itemIndex) => itemIndex === index ? { ...item, method: event.target.value } : item))} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm">
                        <option value="">Choose method</option>{PRINT_METHODS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <select aria-label={`Package size ${index + 1}`} value={location.size} onChange={(event) => handleChange('combination_locations', form.combination_locations.map((item, itemIndex) => itemIndex === index ? { ...item, size: event.target.value } : item))} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm">
                        <option value="">Choose size</option>{PRINT_SIZES.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <button type="button" disabled={form.combination_locations.length <= 2} onClick={() => handleChange('combination_locations', form.combination_locations.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove package location ${index + 1}`} className="min-h-10 rounded-lg border border-red-200 px-3 text-red-700 disabled:opacity-40"><Trash2 className="mx-auto h-4 w-4" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => handleChange('combination_locations', [...form.combination_locations, { location: '', method: '', size: '' }])} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 text-sm font-semibold text-indigo-800"><Plus className="h-4 w-4" /> Add print location</button>
                </section>
              )}

              {/* Price */}

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                  Price (LKR)
                </label>

                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(event) =>
                      handleChange(
                        'price',
                        event.target.value
                      )
                    }
                    placeholder="1500"
                    className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              {/* Active */}

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) =>
                    handleChange(
                      'is_active',
                      event.target.checked
                    )
                  }
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />

                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    Active pricing rule
                  </div>

                  <div className="text-xs text-gray-500">
                    Active rules can be used by the customer
                    pricing engine.
                  </div>
                </div>
              </label>

              {/* Actions */}

              <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      {editingRule
                        ? 'Update Rule'
                        : 'Save Rule'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
          <Icon className="h-4 w-4 text-indigo-600" />
        </div>

        <div>
          <div className="text-xs font-medium text-gray-500">
            {label}
          </div>

          <div className="mt-0.5 text-xl font-bold text-gray-900">
            {value}
          </div>
        </div>
      </div>
    </div>
  )
}
