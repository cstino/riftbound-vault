import { useState } from 'react'
import { motion, type PanInfo } from 'motion/react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Card } from '../lib/types'
import { cardImage } from '../lib/data'
import './coverflow.css'

/** Carosello con la carta centrale in primo piano e le vicine inclinate e sfocate. */
export function Coverflow({ cards, caption }: { cards: Card[]; caption?: (c: Card) => string }) {
  const [index, setIndex] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()
  if (!cards.length) return null
  const go = (i: number) => setIndex(Math.max(0, Math.min(cards.length - 1, i)))

  function onDragEnd(_: unknown, info: PanInfo) {
    const power = info.offset.x + info.velocity.x * 0.2
    if (power < -60) go(index + 1)
    else if (power > 60) go(index - 1)
  }

  const active = cards[index]
  return (
    <div className="cover" role="region" aria-roledescription="carosello" aria-label="Le tue carte migliori">
      <motion.div className="cover-track" drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18} onDragEnd={onDragEnd}>
        {cards.map((c, i) => {
          const o = i - index
          if (Math.abs(o) > 3) return null
          return (
            <motion.button
              key={c.id}
              type="button"
              className="cover-card"
              aria-label={c.name}
              aria-current={o === 0}
              tabIndex={o === 0 ? 0 : -1}
              onClick={() =>
                o === 0 ? navigate(`/carta/${c.id}`, { state: { background: location, layoutId: `cover-${c.id}` } }) : go(i)
              }
              initial={false}
              animate={{
                x: `${o * 58}%`,
                scale: 1 - Math.min(Math.abs(o), 3) * 0.16,
                rotateY: o * -16,
                opacity: Math.abs(o) > 2 ? 0 : 1 - Math.abs(o) * 0.22,
                filter: o === 0 ? 'blur(0px) brightness(1)' : `blur(${Math.abs(o) * 1.6}px) brightness(0.6)`,
                zIndex: 10 - Math.abs(o),
              }}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            >
              <motion.img layoutId={`cover-${c.id}`} src={cardImage(c)} alt="" draggable={false} />
              {o === 0 && <span className="cover-glow" aria-hidden />}
            </motion.button>
          )
        })}
      </motion.div>
      <div className="cover-meta">
        <motion.p key={active.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="cover-name">
          {active.name}
        </motion.p>
        {caption && <p className="cover-caption">{caption(active)}</p>}
        <div className="cover-dots" aria-hidden>
          {cards.map((c, i) => (
            <span key={c.id} className={i === index ? 'on' : ''} />
          ))}
        </div>
      </div>
    </div>
  )
}
