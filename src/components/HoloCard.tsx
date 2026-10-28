import { useRef } from 'react'
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import type { Card } from '../lib/types'
import { asset, isBattlefield } from '../lib/data'
import './holoCard.css'

const SHEEN: Record<string, number> = { Common: 0.08, Uncommon: 0.16, Rare: 0.32, Epic: 0.45, Showcase: 0.7 }

/**
 * La carta del dettaglio: si inclina seguendo il puntatore e un riflesso olografico
 * scorre sulla superficie. L'intensità del riflesso cresce con la rarità.
 */
export function HoloCard({ card, layoutId }: { card: Card; layoutId?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const spring = { stiffness: 220, damping: 22, mass: 0.6 }
  const rx = useSpring(useTransform(py, [0, 1], [11, -11]), spring)
  const ry = useSpring(useTransform(px, [0, 1], [-14, 14]), spring)
  const gx = useTransform(px, (v) => `${v * 100}%`)
  const gy = useTransform(py, (v) => `${v * 100}%`)
  const glare = useMotionTemplate`radial-gradient(circle at ${gx} ${gy}, rgb(255 255 255 / 0.55), transparent 45%)`
  const holo = useMotionTemplate`linear-gradient(115deg, transparent 20%, rgb(255 62 165 / 0.9) 36%, rgb(59 216 242 / 0.9) 48%, rgb(255 214 102 / 0.9) 60%, transparent 76%) ${gx} ${gy} / 260% 260%`
  const strength = SHEEN[card.rarity ?? 'Common'] ?? 0.1
  const landscape = isBattlefield(card)

  function onMove(e: React.PointerEvent) {
    if (reduce || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    px.set((e.clientX - r.left) / r.width)
    py.set((e.clientY - r.top) / r.height)
  }
  function onLeave() {
    px.set(0.5)
    py.set(0.5)
  }

  return (
    <div className={`holo-stage${landscape ? ' holo-land' : ''}`} onPointerMove={onMove} onPointerLeave={onLeave}>
      <motion.div ref={ref} className="holo-card" style={reduce ? undefined : { rotateX: rx, rotateY: ry }}>
        <motion.img layoutId={layoutId} src={asset(card.image_file)} alt={card.name} draggable={false} />
        {!reduce && (
          <>
            <motion.div className="holo-sheen" style={{ background: holo, opacity: strength }} />
            <motion.div className="holo-glare" style={{ background: glare }} />
          </>
        )}
      </motion.div>
    </div>
  )
}
