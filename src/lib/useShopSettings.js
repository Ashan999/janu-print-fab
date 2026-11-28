import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { SHOP } from '../config'

const DEFAULT_SETTINGS = {
  whatsapp: SHOP.whatsapp,
  contactPhone: SHOP.whatsapp,
  contactEmail: '',
  businessAddress: SHOP.address,
  businessHours: SHOP.businessHours,
  deliveryFee: 0,
  bank: {
    bankName: SHOP.bank.bankName,
    accountName: SHOP.bank.accountName,
    accountNumber: SHOP.bank.accountNumber,
    branch: SHOP.bank.branch,
  },
}

export function useShopSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  useEffect(() => {
    let active = true
    const loadSettings = async () => {
      const { data } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle()
      if (!active || !data) return
      setSettings({
        whatsapp: data.whatsapp_number?.trim() || SHOP.whatsapp,
        contactPhone: data.contact_phone?.trim() || data.whatsapp_number?.trim() || SHOP.whatsapp,
        contactEmail: data.contact_email?.trim() || '',
        businessAddress: data.business_address?.trim() || SHOP.address,
        businessHours: data.business_hours?.trim() || SHOP.businessHours,
        deliveryFee: Math.max(0, Number(data.delivery_fee) || 0),
        bank: {
          bankName: data.bank_name?.trim() || SHOP.bank.bankName,
          accountName: data.account_name?.trim() || SHOP.bank.accountName,
          accountNumber: data.account_number?.trim() || SHOP.bank.accountNumber,
          branch: data.branch_name?.trim() || SHOP.bank.branch,
        },
      })
    }
    void loadSettings()
    window.addEventListener('jpf-shop-settings-updated', loadSettings)

    return () => {
      active = false
      window.removeEventListener('jpf-shop-settings-updated', loadSettings)
    }
  }, [])

  return settings
}
