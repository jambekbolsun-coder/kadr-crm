import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type Kind = 'default' | 'success' | 'error'
type Toast = { id: number; message: string; kind: Kind }
type ToastContextValue = { toast: (message: string, kind?: Kind) => void }

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const toast = useCallback((message: string, kind: Kind = 'default') => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setItems(x => [...x, { id, message, kind }])
    window.setTimeout(() => setItems(x => x.filter(t => t.id !== id)), 3600)
  }, [])
  const value = useMemo(() => ({ toast }), [toast])
  return <ToastContext.Provider value={value}>{children}<div className="toast-root">{items.map(t => <div className={`toast ${t.kind}`} key={t.id}><span>{t.message}</span><button onClick={() => setItems(x => x.filter(i => i.id !== t.id))}>×</button></div>)}</div></ToastContext.Provider>
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
