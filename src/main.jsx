import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/noto-sans-sinhala/400.css'
import '@fontsource/noto-sans-sinhala/500.css'
import '@fontsource/noto-sans-sinhala/600.css'
import '@fontsource/noto-sans-sinhala/700.css'
import './index.css'
import App from './App.jsx'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import { ToastProvider } from './components/ToastContext.jsx'
import { CartProvider } from './context/CartContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <ToastProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </ToastProvider>
    </LanguageProvider>
  </StrictMode>,
)
