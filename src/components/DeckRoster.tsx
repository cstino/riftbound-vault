import type { PointerEvent } from 'react'
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { cardImage } from '../lib/data'
import type { CardDb } from '../lib/data'
import type { Deck } from '../lib/types'
import { DomainIcon } from './Icons'
import './deckRoster.css'

/** Colori dei domini della Legend, per bordo e bagliore della copertina. */
export function deckColors(deck: Deck, db: CardDb) {
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  const doms = legend?.domains ?? []
  const colors = doms.length ? doms.map((d) => `var(--${d.toLowerCase()})`) : ['var(--violet)']
  return { legend, doms, c1: colors[0], c2: colors[1] ?? colors[0] }
}

/**
 * Griglia di scelta dei mazzi, come i selettori dei personaggi: ritratto del campione, domini e
 * nome. Con il mouse la copertina si inclina verso il puntatore e un riflesso la attraversa.
 */
export function DeckRoster({ decks, db, selected, onPick }: { decks: Deck[]; db: CardDb; selected: string | null; onPick: (d: Deck) => void }) {
  return (
    <ul className="roster">
      {decks.map((d, i) => (
        <motion.li key={d.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.035, ease: [0.22, 1, 0.36, 1] }}>
          <RosterTile deck={d} db={db} on={d.id === selected} onPick={() => onPick(d)} />
        </motion.li>
      ))}
    </ul>
  )
}

function RosterTile({ deck, db, on, onPick }: { deck: Deck; db: CardDb; on: boolean; onPick: () => void }) {
  const { legend, doms, c1, c2 } = deckColors(deck, db)
  const champ = deck.championId ? db.byId.get(deck.championId) : undefined
  // posizione del puntatore sulla copertina, da 0 a 1
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const spring = { stiffness: 260, damping: 22 }
  const rotateY = useSpring(useTransform(px, [0, 1], [-11, 11]), spring)
  const rotateX = useSpring(useTransform(py, [0, 1], [9, -9]), spring)
  const shineX = useTransform(px, [0, 1], ['0%', '100%'])
  const shineY = useTransform(py, [0, 1], ['0%', '100%'])
  const shine = useMotionTemplate`radial-gradient(circle at ${shineX} ${shineY}, rgb(255 255 255 / 0.28), transparent 55%)`

  const still = useReducedMotion()
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== 'mouse' || still) return
    const r = e.currentTarget.getBoundingClientRect()
    px.set((e.clientX - r.left) / r.width)
    py.set((e.clientY - r.top) / r.height)
  }
  const leave = () => {
    px.set(0.5)
    py.set(0.5)
  }

  return (
    <motion.button
      type="button"
      className={`roster-tile${on ? ' roster-on' : ''}`}
      style={{ rotateX, rotateY, ['--c1' as string]: c1, ['--c2' as string]: c2 }}
      onPointerMove={move}
      onPointerLeave={leave}
      onClick={onPick}
      whileHover={{ y: -6, scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      aria-pressed={on}
    >
      <span className="roster-art">{champ && <img src={cardImage(champ)} alt="" loading="lazy" draggable={false} />}</span>
      <motion.span className="roster-shine" style={{ background: shine }} aria-hidden />
      <span className="roster-info">
        <strong>{deck.name}</strong>
        <span className="roster-doms">
          {doms.map((d) => (
            <DomainIcon key={d} domain={d} size={15} />
          ))}
          <span>{legend?.name.split(' - ')[1] ?? ''}</span>
        </span>
      </span>
      {on && (
        <motion.span className="roster-check" initial={{ scale: 0 }} animate={{ scale: 1 }} aria-hidden>
          ✓
        </motion.span>
      )}
    </motion.button>
  )
}
