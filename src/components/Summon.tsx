import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cardImage, isChampionUnit } from '../lib/data'
import type { Card } from '../lib/types'
import type { Game } from '../lib/game/types'
import './summon.css'

/** Carte che meritano l'evocazione: i campioni e le carte da 6 energia in su. */
export const isBigPlay = (c: Card) => isChampionUnit(c) || (c.energy ?? 0) >= 6

interface Shot {
  key: number
  card: Card
  uid: number
}

// tempi delle quattro fasi (ms dall'inizio)
const T = { ribbon: 300, gather: 850, solid: 1250, fly: 1950, end: 2850 }

/**
 * Evocazione delle carte importanti, in quattro tempi: la carta si accende al suo posto, si
 * scioglie in un nastro di energia che attraversa lo schermo, si ricompone in grande al centro
 * e torna al suo posto con un lampo dorato. Il colore è quello del dominio. Si salta con un tocco.
 */
export function Summon({ g }: { g: Game }) {
  const seen = useRef(g.log.length)
  const [queue, setQueue] = useState<Shot[]>([])
  const n = g.log.length
  useEffect(() => {
    const fresh = g.log.slice(seen.current)
    const start = seen.current
    seen.current = g.log.length
    const shots = fresh
      .map((e, i) => ({ e, key: start + i }))
      .filter(({ e }) => e.played != null && e.card && isBigPlay(e.card))
      .map(({ e, key }) => ({ key, card: e.card!, uid: e.played! }))
    if (shots.length) setQueue((q) => [...q, ...shots])
  }, [n, g])
  const shot = queue[0]
  // stabile: un nuovo rendering del tavolo non deve far ripartire i tempi dell'effetto
  const done = useCallback(() => setQueue((q) => q.slice(1)), [])
  return <AnimatePresence>{shot && <SummonShot key={shot.key} shot={shot} onDone={done} />}</AnimatePresence>
}

/** Rettangolo della carta sul tavolo (unità o equipaggiamento), se c'è. */
function rectOf(uid: number) {
  const el = document.querySelector(`[data-uid="${uid}"]`)
  return el ? el.getBoundingClientRect() : null
}

function SummonShot({ shot, onDone }: { shot: Shot; onDone: () => void }) {
  const still = useReducedMotion()
  const color = `var(--${(shot.card.domains[0] ?? 'violet').toLowerCase()})`
  const [phase, setPhase] = useState<'glow' | 'ribbon' | 'gather' | 'solid' | 'fly'>('glow')
  const [slot, setSlot] = useState(() => rectOf(shot.uid))
  const vw = window.innerWidth
  const vh = window.innerHeight
  // carta grande al centro: alta metà schermo, al massimo 380 px di larghezza
  const bigW = Math.min(380, vh * 0.5 * (5 / 7), vw * 0.7)

  useEffect(() => {
    if (still) {
      const t = setTimeout(onDone, 1400)
      return () => clearTimeout(t)
    }
    const ts = [
      setTimeout(() => setPhase('ribbon'), T.ribbon),
      setTimeout(() => setPhase('gather'), T.gather),
      setTimeout(() => setPhase('solid'), T.solid),
      setTimeout(() => {
        setSlot(rectOf(shot.uid)) // la carta può essersi spostata nel frattempo
        setPhase('fly')
      }, T.fly),
      setTimeout(onDone, T.end),
    ]
    return () => ts.forEach(clearTimeout)
  }, [still, shot.uid, onDone])

  if (still)
    return (
      <motion.div className="summon" onClick={onDone} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <img className="summon-still" src={cardImage(shot.card)} alt={shot.card.name} style={{ width: bigW }} />
      </motion.div>
    )

  // da dove parte e dove torna: il posto sul tavolo, o il centro se la carta non è sulla board (magie)
  const home = slot ? { x: slot.left + slot.width / 2 - vw / 2, y: slot.top + slot.height / 2 - vh / 2, s: slot.width / bigW } : { x: 0, y: 0, s: 0.2 }
  const big = { x: 0, y: -vh * 0.04, s: 1 }
  // inizio del nastro nelle coordinate dell'SVG (0-1000 su tutto lo schermo)
  const start = slot ? { x: ((slot.left + slot.width / 2) / vw) * 1000, y: ((slot.top + slot.height / 2) / vh) * 1000 } : { x: 300, y: 800 }

  return (
    <motion.div
      className="summon"
      style={{ ['--sc' as string]: color }}
      onClick={onDone}
      role="button"
      aria-label={`${shot.card.name} entra in gioco. Tocca per saltare`}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
    >
      <motion.div className="summon-dim" initial={{ opacity: 0 }} animate={{ opacity: phase === 'fly' ? 0 : phase === 'glow' ? 0.35 : 0.72 }} transition={{ duration: 0.4 }} />

      {/* 1. la carta si accende al suo posto e diventa energia */}
      {slot && phase === 'glow' && (
        <motion.div
          className="summon-slot-glow"
          style={{ left: slot.left, top: slot.top, width: slot.width, height: slot.height }}
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: [0, 1, 0.9], scale: [1, 1.08, 1.12] }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* 2. il nastro di energia attraversa lo schermo ad arco */}
      {(phase === 'ribbon' || phase === 'gather') && (
        <svg className="summon-ribbon" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="summon-grad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="white" stopOpacity="0" />
              <stop offset="0.45" stopColor="white" stopOpacity="0.95" />
              <stop offset="1" stopColor="white" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* un nastro largo e trasparente con un bordo più luminoso, come una lama di vetro */}
          {[
            { w: 230, o: 0.28, d: 0, blur: true, white: false },
            { w: 130, o: 0.32, d: 0.02, blur: false, white: false },
            { w: 46, o: 0.8, d: 0.05, blur: false, white: false },
            { w: 12, o: 1, d: 0.08, blur: false, white: true },
                    ].map((r, i) => (
            <motion.path
              key={i}
              d={`M ${start.x} ${start.y} C 120 900, 60 300, 520 120 S 980 -40, 1080 60`}
              fill="none"
              stroke={r.white ? 'url(#summon-grad)' : 'var(--sc)'}
              strokeWidth={r.w}
              strokeLinecap="round"
              style={{ filter: r.blur ? 'blur(26px)' : i === 1 ? 'blur(3px)' : 'drop-shadow(0 0 12px var(--sc))', opacity: r.o }}
              initial={{ pathLength: 0, pathOffset: 0 }}
              animate={{ pathLength: [0, 0.55, 0.3], pathOffset: [0, 0.25, 1] }}
              transition={{ duration: 0.75, delay: r.d, ease: [0.45, 0, 0.2, 1] }}
            />
          ))}
        </svg>
      )}

      {/* 3. raggi che convergono al centro */}
      {(phase === 'gather' || phase === 'solid') &&
        STREAKS.map((s, i) => (
          <motion.span
            key={i}
            className="summon-streak"
            style={{ top: `calc(50% + ${s.y}vh)`, height: s.h, rotate: s.r }}
            initial={{ x: '70vw', scaleX: 0.3, opacity: 0 }}
            animate={{ x: '-80vw', scaleX: [0.3, 1.4, 0.6], opacity: [0, 1, 0] }}
            transition={{ duration: 0.7, delay: s.d, ease: 'easeIn' }}
          />
        ))}

      {/* la carta: sagoma di energia, poi carta vera con cornice dorata, poi torna al suo posto */}
      {phase !== 'glow' && phase !== 'ribbon' && (
        <motion.div
          className={`summon-card${phase === 'gather' ? ' is-ghost' : ''}`}
          style={{ width: bigW }}
          initial={{ x: big.x + vw * 0.25, y: big.y, scale: 0.7, rotate: 4, rotateY: -35, opacity: 0 }}
          animate={
            phase === 'fly'
              ? { x: home.x, y: home.y, scale: home.s, rotate: 0, rotateY: 0, opacity: slot ? 1 : 0 }
              : { x: big.x, y: big.y, scale: 1, rotate: -6, rotateY: phase === 'solid' ? [8, -4] : 10, opacity: 1 }
          }
          transition={phase === 'fly' ? { duration: 0.45, ease: [0.55, 0, 0.75, 0.2] } : { duration: phase === 'solid' ? 0.7 : 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <img src={cardImage(shot.card)} alt={shot.card.name} draggable={false} />
          <span className="summon-card-energy" aria-hidden />
        </motion.div>
      )}

      {/* scintille attorno alla carta grande */}
      {phase === 'solid' &&
        SPARKS.map((s, i) => (
          <motion.span
            key={i}
            className="summon-spark"
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{ x: s.x * bigW, y: s.y * bigW, opacity: [0, 1, 0], scale: [0.4, 1, 0.2] }}
            transition={{ duration: 0.9, delay: s.d, ease: 'easeOut' }}
          />
        ))}

      {/* 4. lampo dorato all'atterraggio */}
      {phase === 'fly' && slot && (
        <motion.span
          className="summon-flash"
          style={{ left: slot.left + slot.width / 2, top: slot.top + slot.height / 2 }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.4, 2.6], opacity: [0, 1, 0] }}
          transition={{ duration: 0.6, delay: 0.4 }}
        />
      )}

      <motion.span className="summon-name" initial={{ opacity: 0, y: 10 }} animate={{ opacity: phase === 'solid' ? 1 : 0, y: phase === 'solid' ? 0 : 10 }}>
        {shot.card.name}
      </motion.span>
    </motion.div>
  )
}

// posizioni fisse (niente casualità nel rendering): raggi e scintille
const STREAKS = [
  { y: -14, h: 6, r: -8, d: 0 },
  { y: -6, h: 14, r: -6, d: 0.05 },
  { y: 2, h: 4, r: -7, d: 0.09 },
  { y: 9, h: 10, r: -5, d: 0.03 },
  { y: 17, h: 5, r: -9, d: 0.12 },
  { y: -22, h: 3, r: -6, d: 0.15 },
]
const SPARKS = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2 + (i % 3) * 0.3
  const r = 0.7 + ((i * 37) % 10) / 20
  return { x: Math.cos(a) * r, y: Math.sin(a) * r * 1.3, d: ((i * 7) % 10) / 40 }
})
