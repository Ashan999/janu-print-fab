import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const toast = useCallback((options) => {
    const id = crypto.randomUUID()
    setToasts((current) => {
      const next = [...current, { ...options, id }].slice(-3)
      next.slice(0, -1).forEach(({ id: removedId }) => {
        const timer = timers.current.get(removedId)
        if (timer) clearTimeout(timer)
        timers.current.delete(removedId)
      })
      return next
    })
    timers.current.set(id, setTimeout(() => dismiss(id), 3000))
  }, [dismiss])

  useEffect(() => () => {
    timers.current.forEach(clearTimeout)
    timers.current.clear()
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-24 left-1/2 z-[70] flex w-[min(92vw,24rem)] -translate-x-1/2 flex-col gap-2 md:bottom-auto md:left-auto md:right-5 md:top-5 md:translate-x-0">
        {toasts.map(({ id, message, actionLabel, onAction, type = 'info' }) => (
          <div
            key={id}
            role="status"
            aria-live="polite"
            className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ${
              type === 'error'
                ? 'bg-red-700 text-white'
                : type === 'success'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-900 border border-gray-200'
            }`}
          >
            <span className="min-w-0 flex-1">{message}</span>
            {actionLabel && onAction && (
              <button
                type="button"
                onClick={() => {
                  onAction()
                  dismiss(id)
                }}
                className="shrink-0 rounded-lg px-2 py-1 font-semibold underline underline-offset-2 focus-visible:ring-2 ring-indigo-400"
              >
                {actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
