import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { Explainer } from './Explainer'
import { useSheet } from './sheetStore'
import './sheet.css'

/** Pannello che sale dal basso con la spiegazione di una parola chiave. */
export function KeywordSheet() {
  const { id, close } = useSheet()
  const drag = useDragControls()
  const { pathname } = useLocation()

  // cambiando pagina il pannello si chiude
  useEffect(() => close(), [pathname, close])

  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, close])

  return (
    <AnimatePresence>
      {id && (
        <motion.div className="sheet-root" key="sheet" initial="hidden" animate="shown" exit="hidden">
          <motion.div
            className="sheet-scrim"
            onClick={close}
            variants={{ hidden: { opacity: 0 }, shown: { opacity: 1 } }}
            transition={{ duration: 0.25 }}
          />
          <motion.div
            className="sheet"
            role="dialog"
            aria-modal="true"
            variants={{ hidden: { y: '100%' }, shown: { y: 0 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) close()
            }}
          >
            <div className="sheet-grip-area" onPointerDown={(e) => drag.start(e)} aria-hidden>
              <div className="sheet-grip" />
            </div>
            <button type="button" className="sheet-close" onClick={close} aria-label="Chiudi">
              ✕
            </button>
            <div className="sheet-body">
              <Explainer id={id} headingLevel={2} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
