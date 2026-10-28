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
import { CardText } from '../components/CardText'
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
  // quale mazzo si sta scegliendo (si apre l'elenco), e passo della preparazione
  const [picking, setPicking] = useState<Side | null>(null)
  const [step, setStep] = useState<'decks' | 'field'>('decks')
  const [fieldInfo, setFieldInfo] = useState<number | null>(null)
  const [pick, setPick] = useState<{ mine: string | null; pc: string | null }>(() => ({
    mine: last?.mine ?? presetDeckId('Zed'),
    pc: last?.pc ?? presetDeckId('Shen'),
  }))
  const [open, setOpen] = useState<string | null>(null)

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

  /** `bf`: campo scelto (488.5) oppure null per estrarlo a caso (487.5). */
  function start(bf: number | null) {
    if (!mine || !pc) return
    const m = new Match([deckToSpec(mine.deck, db), deckToSpec(pc.deck, db)], ['Giocatore', 'PC'], 0, undefined, bf === null ? [null, null] : [bf, null])
    m.next()
    startGame(m, { mine: mine.deck.id, pc: pc.deck.id, bf })
    navigate('/playground/partita/gioca')
  }

  function choose(id: string) {
    if (!picking) return
    setPick((p) => ({ ...p, [picking]: id }))
    setPicking(null)
  }

  if (step === 'field' && mine) {
    const fields = mine.deck.battlefields.map((id) => db.byId.get(id)).filter((c) => c != null)
    const info = fieldInfo !== null ? fields[fieldInfo] : undefined
    return (
      <div className="setup">
        <button type="button" className="link-more" onClick={() => setStep('decks')}>
          ← Mazzi
        </button>
        <header className="setup-head">
          <h1>Scegli il campo</h1>
          <p className="muted">Ognuno sceglie uno dei suoi tre campi di battaglia, come nel Match (regola 488.5). Il PC sceglie il suo. Tocca un campo per vederne i dettagli.</p>
        </header>
        <div className="field-list">
          {fields.map((c, i) => (
            <motion.button
              key={c.id}
              type="button"
              className="field-tile"
              onClick={() => setFieldInfo(i)}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            >
              <img src={cardImage(c)} alt="" />
              <span>{c.name}</span>
            </motion.button>
          ))}
        </div>
        <button type="button" className="btn field-random" onClick={() => start(null)}>
          <img src={asset('backs/legend.webp')} alt="" />
          Estrai a caso (come nel Duel, regola 487.5)
        </button>

        <AnimatePresence>
          {info && (
            <motion.div key="info" className="sheet-root" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button type="button" className="sheet-scrim" aria-label="Chiudi" onClick={() => setFieldInfo(null)} />
              <motion.div className="sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 360, damping: 34 }}>
                <span className="sheet-grip" aria-hidden />
                <div className="sheet-body bf-sheet">
                  <img className="bf-sheet-img" src={cardImage(info)} alt={info.name} />
                  <h2>{info.name}</h2>
                  {info.text && (
                    <div className="obj-text">
                      <CardText html={info.text} />
                    </div>
                  )}
                  <button type="button" className="btn btn-primary field-go" onClick={() => start(fieldInfo)}>
                    Gioca su questo campo
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="setup">
      <Link to="/playground" className="link-more">
        ← Playground
      </Link>
      <header className="setup-head">
        <h1>Partita contro il PC</h1>
        <p className="muted">Una partita 1 contro 1 con le regole del Core Rules ufficiale. Tocca una delle due card per scegliere il mazzo.</p>
      </header>

      <div className="setup-versus versus-big">
        {(['mine', 'pc'] as Side[]).map((sd) => {
          const r = sd === 'mine' ? mine : pc
          return (
            <motion.button key={sd} type="button" className="versus-slot" onClick={() => setPicking(sd)} whileTap={{ scale: 0.97 }}>
              <span className="versus-art">{r?.champ && <img src={cardImage(r.champ)} alt="" />}</span>
              <span className="versus-who">{sd === 'mine' ? 'Tu' : 'PC'}</span>
              <strong>{r?.deck.name ?? 'Scegli'}</strong>
              <span className="versus-change tiny">Cambia mazzo</span>
            </motion.button>
          )
        })}
        <span className="versus-vs" aria-hidden>
          VS
        </span>
      </div>

      <div className="setup-go">
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => setStep('field')}>
          {ready ? 'Inizia' : 'Scegli due mazzi giocabili'}
        </button>
      </div>

      <AnimatePresence>
        {picking && (
          <motion.div key="picker" className="sheet-root" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" className="sheet-scrim" aria-label="Chiudi" onClick={() => setPicking(null)} />
            <motion.div className="sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 360, damping: 34 }}>
              <span className="sheet-grip" aria-hidden />
              <div className="sheet-body">
                <h2>{picking === 'mine' ? 'Il tuo mazzo' : 'Mazzo del PC'}</h2>
                <p className="tiny muted">Si giocano solo i mazzi con tutte le carte implementate nel motore.</p>
                <ul className="deck-choices">
                  {rows.map(({ deck, cov, champ }) => {
                    const pct = Math.round((cov.done / Math.max(1, cov.total)) * 100)
                    const selected = pick[picking] === deck.id
                    return (
                      <li key={deck.id}>
                        <div className={`deck-choice${selected ? ' deck-choice-on' : ''}${cov.playable ? '' : ' deck-choice-off'}`}>
                          <button type="button" className="deck-choice-main" disabled={!cov.playable} onClick={() => choose(deck.id)}>
                            <span className="deck-choice-art">{champ && <img src={cardImage(champ)} alt="" loading="lazy" />}</span>
                            <span className="deck-choice-body">
                              <strong>{deck.name}</strong>
                              <span className="cov-bar" aria-hidden>
                                <span style={{ transform: `scaleX(${pct / 100})` }} />
                              </span>
                              <span className="tiny">{cov.playable ? 'Giocabile' : `${pct}% implementato · ne mancano ${cov.missing.length}`}</span>
                            </span>
                            {selected && <span className="deck-choice-check">✓</span>}
                          </button>
                          {!cov.playable && cov.missing.length > 0 && (
                            <button type="button" className="deck-choice-more" onClick={() => setOpen(open === deck.id ? null : deck.id)} aria-expanded={open === deck.id}>
                              {open === deck.id ? 'Nascondi' : 'Quali'}
                            </button>
                          )}
                        </div>
                        {open === deck.id && <p className="deck-missing">{cov.missing.join(' · ')}</p>}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
