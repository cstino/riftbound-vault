import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import './confirmDialog.css'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Azione distruttiva: il pulsante di conferma è rosso. */
  danger?: boolean
}

interface ConfirmState {
  current: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  ask: (o: ConfirmOptions) => Promise<boolean>
  close: (ok: boolean) => void
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  current: null,
  ask: (o) =>
    new Promise<boolean>((resolve) => {
      get().current?.resolve(false)
      set({ current: { ...o, resolve } })
    }),
  close: (ok) => {
    get().current?.resolve(ok)
    set({ current: null })
  },
}))

/** Chiede conferma con la finestra dell'app (al posto di window.confirm). */
export const askConfirm = (o: ConfirmOptions) => useConfirmStore.getState().ask(o)

export function ConfirmDialog() {
  const { current, close } = useConfirmStore()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!current) return
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, close])

  return (
    <AnimatePresence>
      {current && (
        <motion.div className="confirm-root" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <div className="confirm-scrim" onClick={() => close(false)} />
          <motion.div
            className="confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            <h2 id="confirm-title">{current.title}</h2>
            {current.message && <p>{current.message}</p>}
            <div className="confirm-actions">
              <button type="button" className="btn" onClick={() => close(false)}>
                {current.cancelLabel ?? 'Annulla'}
              </button>
              <button
                ref={confirmRef}
                type="button"
                className={`btn ${current.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
              >
                {current.confirmLabel ?? 'Conferma'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
