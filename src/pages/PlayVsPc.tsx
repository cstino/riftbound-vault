import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useNavigate } from 'react-router-dom'
import { useDb } from '../lib/useDb'
import { useVault } from '../lib/store'
import { asset, cardImage } from '../lib/data'
import { type Product, presetDeckId, productDeckToDeck } from '../lib/products'
import { Match, deckCoverage, deckToSpec } from '../lib/game'
import { useGame } from '../lib/gameStore'
import type { Deck } from '../lib/types'
import './game.css'

type Side = 'mine' | 'pc'

/** Mazzi tra cui scegliere: i tuoi e quelli ufficiali che non hai ancora in Mazzi. */
function useDeckChoices(): Deck[] {
  const db = useDb()
  const mine = useVault((s) => s.decks)
  const [products, setProducts] = useState<Product[]>([])
  useEffect(() => {
    fetch(asset('data/products.json'))
      .then((r) => r.json())
      .then(setProducts)
      .catch(() => setProducts([]))
  }, [])
  return useMemo(() => {
    const official = products.flatMap((p) => p.decks.map((d) => productDeckToDeck(d, db)))
    return [...mine, ...official.filter((o) => !mine.some((m) => m.id === o.id))]
  }, [products, mine, db])
}

export function PlayVsPc() {
  const db = useDb()
  const navigate = useNavigate()
  const decks = useDeckChoices()
  const startGame = useGame((s) => s.start)
  const last = useGame((s) => s.decks)
  const [side, setSide] = useState<Side>('mine')
  const [pick, setPick] = useState<{ mine: string | null; pc: string | null }>(() => ({
    mine: last?.mine ?? presetDeckId('Zed'),
    pc: last?.pc ?? presetDeckId('Shen'),
  }))
  const [open, setOpen] = useState<string | null>(null)
  // null = a caso come nel Duel (487.5); un numero = campo scelto come nel Match (488.5)
  const [bf, setBf] = useState<number | null>(() => (last ? last.bf : 0))

  const rows = useMemo(
    () =>
      decks
        .map((d) => ({ deck: d, cov: deckCoverage(d, db), champ: d.championId ? db.byId.get(d.championId) : undefined }))
        .sort((a, b) => Number(b.cov.playable) - Number(a.cov.playable) || b.cov.done / Math.max(1, b.cov.total) - a.cov.done / Math.max(1, a.cov.total)),
    [decks, db],
  )
  const byId = (id: string | null) => rows.find((r) => r.deck.id === id)
  const mine = byId(pick.mine)
  const pc = byId(pick.pc)
  const ready = !!mine?.cov.playable && !!pc?.cov.playable

  function start() {
    if (!mine || !pc) return
    const m = new Match([deckToSpec(mine.deck, db), deckToSpec(pc.deck, db)], ['Giocatore', 'PC'], 0, undefined, bf === null ? [null, null] : [bf, null])
    m.next()
    startGame(m, { mine: mine.deck.id, pc: pc.deck.id, bf })
    navigate('/playground/partita/gioca')
  }

  function choose(id: string) {
    setPick((p) => ({ ...p, [side]: id }))
    if (side === 'mine') {
      setSide('pc')
      if (bf !== null) setBf(0)
    }
  }

  return (
    <div className="setup">
      <Link to="/playground" className="link-more">
        ← Playground
      </Link>
      <header className="setup-head">
        <h1>Partita contro il PC</h1>
        <p className="muted">
          Una partita vera, 1 contro 1, con le regole del Core Rules ufficiale: turni, rune, catena, showdown, combattimenti e punti. Si possono usare solo i mazzi le cui carte sono già tutte implementate e
          testate nel motore.
        </p>
      </header>

      <div className="setup-versus">
        {(['mine', 'pc'] as Side[]).map((s) => {
          const r = s === 'mine' ? mine : pc
          return (
            <button key={s} type="button" className={`versus-slot${side === s ? ' versus-on' : ''}`} onClick={() => setSide(s)}>
              <span className="versus-art">{r?.champ && <img src={cardImage(r.champ)} alt="" />}</span>
              <span className="versus-who">{s === 'mine' ? 'Il tuo mazzo' : 'Mazzo del PC'}</span>
              <strong>{r?.deck.name ?? 'Scegli'}</strong>
            </button>
          )
        })}
        <span className="versus-vs" aria-hidden>
          VS
        </span>
      </div>

      {mine && (
        <section className="bf-pick">
          <div className="bf-pick-head">
            <strong>Il tuo campo di battaglia</strong>
            <span className="chips">
              <button type="button" className="chip" aria-pressed={bf !== null} onClick={() => setBf(bf ?? 0)}>
                Lo scelgo io
              </button>
              <button type="button" className="chip" aria-pressed={bf === null} onClick={() => setBf(null)}>
                Casuale
              </button>
            </span>
          </div>
          <p className="tiny">
            {bf === null
              ? 'Come nel Duel: ognuno estrae a caso uno dei suoi tre campi (regola 487.5).'
              : 'Come nel Match: ognuno sceglie uno dei suoi tre campi (regola 488.5). Il PC sceglie il suo.'}
          </p>
          {bf !== null && (
            <div className="bf-options">
              {mine.deck.battlefields.map((id, i) => {
                const c = db.byId.get(id)
                return (
                  c && (
                    <button key={id} type="button" className={`bf-option${bf === i ? ' bf-option-on' : ''}`} onClick={() => setBf(i)}>
                      <img src={cardImage(c)} alt="" loading="lazy" />
                      <span>{c.name}</span>
                    </button>
                  )
                )
              })}
            </div>
          )}
        </section>
      )}

      <p className="setup-help">
        Stai scegliendo: <strong>{side === 'mine' ? 'il tuo mazzo' : 'il mazzo del PC'}</strong>
      </p>

      <ul className="deck-choices">
        {rows.map(({ deck, cov, champ }, i) => {
          const pct = Math.round((cov.done / Math.max(1, cov.total)) * 100)
          const selected = pick[side] === deck.id
          return (
            <motion.li key={deck.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
              <div className={`deck-choice${selected ? ' deck-choice-on' : ''}${cov.playable ? '' : ' deck-choice-off'}`}>
                <button type="button" className="deck-choice-main" disabled={!cov.playable} onClick={() => choose(deck.id)}>
                  <span className="deck-choice-art">{champ && <img src={cardImage(champ)} alt="" loading="lazy" />}</span>
                  <span className="deck-choice-body">
                    <strong>{deck.name}</strong>
                    <span className="cov-bar" aria-hidden>
                      <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: pct / 100 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
                    </span>
                    <span className="tiny">
                      {cov.playable ? 'Giocabile: tutte le carte implementate' : `${pct}% delle carte implementate · ne mancano ${cov.missing.length}`}
                    </span>
                  </span>
                  {selected && <span className="deck-choice-check">✓</span>}
                </button>
                {!cov.playable && cov.missing.length > 0 && (
                  <button type="button" className="deck-choice-more" onClick={() => setOpen(open === deck.id ? null : deck.id)} aria-expanded={open === deck.id}>
                    {open === deck.id ? 'Nascondi' : 'Quali mancano'}
                  </button>
                )}
              </div>
              <AnimatePresence>
                {open === deck.id && (
                  <motion.p className="deck-missing" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                    {cov.missing.join(' · ')}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.li>
          )
        })}
      </ul>

      <div className="setup-go">
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={start}>
          {ready ? `Inizia: ${mine!.deck.name} contro ${pc!.deck.name}` : 'Scegli due mazzi giocabili'}
        </button>
      </div>
    </div>
  )
}
