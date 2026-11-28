export const SHOP = {
  name: 'Janu Print | Fab',
  whatsapp: '94713296006',

  bank: {
    bankName: 'NSB',
    accountName: 'M.K ashan virantha',
    accountNumber: '107810154261',
    branch: 'Hambantota',
  },

  phone: '',
  email: '',
  address: '',
  businessHours: '',
}

export const formatPrice = (amount) =>
  `Rs. ${Number(amount || 0).toLocaleString('en-LK')}`