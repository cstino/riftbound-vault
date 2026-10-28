import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useDb } from '../lib/useDb'
import { useVault } from '../lib/store'
import type { Card } from '../lib/types'
import { asset, cardImage, isBasePrinting, SET_ORDER, sortCards } from '../lib/data'
import { presetToDeck, validateDeck } from '../lib/deck'
import { deckFromLines, linesToCounts, parseList } from '../lib/importList'
import './addCards.css'

type Mode = 'carte' | 'mazzo'

export function AddCards() {
  const [params, setParams] = useSearchParams()
  const mode: Mode = params.get('modo') === 'mazzo' ? 'mazzo' : 'carte'
  return (
    <div className="add-page">
      <header className="page-head">
        <div>
          <h1>Aggiungi</h1>
          <p>Registra le carte di una bustina o un mazzo che hai comprato.</p>
        </div>
      </header>
      <div className="seg add-tabs" role="tablist">
        {(
          [
            ['carte', 'Carte (bustina)'],
            ['mazzo', 'Mazzo comprato'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => setParams(k === 'mazzo' ? { modo: 'mazzo' } : {}, { replace: true })}>
            {mode === k && <motion.span layoutId="add-tab" className="seg-active" />}
            <span>{label}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={mode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {mode === 'carte' ? <AddByCode /> : <AddDeck />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Carte: set + numero stampato sulla carta (es. VEN · 013/166), oppure ricerca per nome

const LAST_SET_KEY = 'rv-last-set'

function AddByCode() {
  const db = useDb()
  const addQty = useVault((s) => s.addQty)
  const owned = useVault((s) => s.owned)
  const location = useLocation()
  const [set, setSet] = useState(() => {
    try {
      return localStorage.getItem(LAST_SET_KEY) ?? 'RAD'
    } catch {
      return 'RAD'
    }
  })
  const [num, setNum] = useState('')
  const [alt, setAlt] = useState(false)
  const [nameQ, setNameQ] = useState('')
  // Carte aggiunte in questa sessione, dalla più recente
  const [session, setSession] = useState<{ id: string; qty: number }[]>([])
  const numRef = useRef<HTMLInputElement>(null)

  const sizes = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of db.cards) if (c.set_size && /^\d+$/.test(c.number)) m.set(c.set, c.set_size)
    return m
  }, [db])

  useEffect(() => {
    try {
      localStorage.setItem(LAST_SET_KEY, set)
    } catch {
      /* archiviazione non disponibile: si riparte da RAD */
    }
  }, [set])

  const found: Card | undefined = useMemo(() => {
    const n = num.trim()
    if (!/^\d{1,3}$/.test(n)) return undefined
    const code = `${set}-${n.padStart(3, '0')}${alt ? 'a' : ''}/${sizes.get(set)}`
    return db.cards.find((c) => c.code === code)
  }, [num, set, alt, sizes, db])

  const byName = useMemo(() => {
    const q = nameQ.trim().toLowerCase()
    if (q.length < 2) return []
    return db.cards
      .filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      .sort((a, b) => Number(isBasePrinting(b)) - Number(isBasePrinting(a)) || sortCards(a, b))
      .slice(0, 20)
  }, [nameQ, db])

  function add(c: Card, delta = 1) {
    addQty(c.id, delta)
    setSession((s) => {
      const rest = s.filter((x) => x.id !== c.id)
      const prev = s.find((x) => x.id === c.id)?.qty ?? 0
      const qty = prev + delta
      return qty > 0 ? [{ id: c.id, qty }, ...rest] : rest
    })
  }

  function addFound() {
    if (!found) return
    add(found)
    setNum('')
    setAlt(false)
    numRef.current?.focus()
  }

  const total = session.reduce((a, b) => a + b.qty, 0)

  return (
    <div className="add-code">
      <section className="code-box">
        <p className="code-help">
          Guarda in basso a sinistra sulla carta: <strong>VEN · 013/166</strong> vuol dire set VEN, numero 13.
        </p>
        <div className="chips" aria-label="Set">
          {SET_ORDER.map((s) => (
            <button key={s} className="chip" aria-pressed={set === s} onClick={() => setSet(s)}>
              {s}
            </button>
          ))}
        </div>
        <form
          className="code-row"
          onSubmit={(e) => {
            e.preventDefault()
            addFound()
          }}
        >
          <span className="code-prefix">{set} ·</span>
          <input
            ref={numRef}
            className="code-input"
            value={num}
            onChange={(e) => setNum(e.target.value.replace(/\D/g, '').slice(0, 3))}
            inputMode="numeric"
            placeholder="013"
            aria-label="Numero della carta"
          />
          <span className="code-suffix">/{sizes.get(set)}</span>
          <button type="button" className="chip" aria-pressed={alt} onClick={() => setAlt((v) => !v)} title="Numero con la lettera a: versione Alt Art">
            Alt Art
          </button>
        </form>

        <AnimatePresence mode="popLayout">
          {found ? (
            <motion.div
              key={found.id}
              className="code-found"
              initial={{ opacity: 0, scale: 0.92, rotate: -2 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            >
              <img src={cardImage(found)} alt={found.name} />
              <div className="code-found-body">
                <p className="code-found-name">{found.name}</p>
                <p className="tiny">
                  {found.rarity} · ne hai {owned[found.id] ?? 0}
                </p>
                <button type="button" className="btn btn-primary" onClick={addFound}>
                  Aggiungi
                </button>
              </div>
            </motion.div>
          ) : num ? (
            <motion.p key="none" className="muted code-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              Nessuna carta {set}-{num.padStart(3, '0')}
              {alt ? 'a' : ''}. Controlla set e numero.
            </motion.p>
          ) : null}
        </AnimatePresence>
      </section>

      <section className="section">
        <h2>Oppure cercala per nome</h2>
        <div className="search" style={{ marginTop: 10 }}>
          <input value={nameQ} onChange={(e) => setNameQ(e.target.value)} placeholder="Nome della carta" aria-label="Cerca per nome" />
        </div>
        {byName.length > 0 && (
          <ul className="rows" style={{ marginTop: 10 }}>
            {byName.map((c) => (
              <li key={c.id} className="row">
                <Link to={`/carta/${c.id}`} state={{ background: location }} className="row-art">
                  <img src={cardImage(c)} alt="" loading="lazy" />
                </Link>
                <div className="row-body">
                  <p className="row-name">{c.name}</p>
                  <p className="row-meta">
                    <span>{c.code}</span>
                    {c.alt_art && <span>Alt Art</span>}
                    {owned[c.id] ? <span className="ok">ne hai {owned[c.id]}</span> : null}
                  </p>
                </div>
                <motion.button type="button" className="add-btn" whileTap={{ scale: 0.85 }} onClick={() => add(c)} aria-label={`Aggiungi ${c.name}`}>
                  +
                </motion.button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {session.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Aggiunte ora</h2>
            <span className="tiny">{total} carte</span>
          </div>
          <motion.ul layout className="rows">
            <AnimatePresence initial={false}>
              {session.map(({ id, qty }) => {
                const c = db.byId.get(id)!
                return (
                  <motion.li key={id} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} className="row">
                    <span className="row-art">
                      <img src={cardImage(c)} alt="" />
                    </span>
                    <div className="row-body">
                      <p className="row-name">{c.name}</p>
                      <p className="row-meta">
                        <span>{c.code}</span>
                        <span>+{qty}</span>
                      </p>
                    </div>
                    <button type="button" className="link-more" onClick={() => add(c, -1)} aria-label={`Togli una copia di ${c.name}`}>
                      Annulla 1
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </motion.ul>
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mazzo: precostruiti conosciuti oppure lista incollata

function AddDeck() {
  const db = useDb()
  const decks = useVault((s) => s.decks)
  const setDeckOwned = useVault((s) => s.setDeckOwned)
  const saveDeck = useVault((s) => s.saveDeck)
  const addMany = useVault((s) => s.addMany)
  const navigate = useNavigate()
  const [presets, setPresets] = useState<{ name: string }[]>([])
  const [text, setText] = useState('')
  const [deckName, setDeckName] = useState('')
  const [makeDeck, setMakeDeck] = useState(true)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    fetch(asset('data/decks.json'))
      .then((r) => r.json())
      .then(setPresets)
  }, [])

  const lines = useMemo(() => (text.trim() ? parseList(text, db) : []), [text, db])
  const matched = lines.filter((l) => l.card)
  const missing = lines.filter((l) => !l.card)
  const copies = matched.reduce((a, l) => a + l.qty, 0)

  function importList() {
    if (!matched.length) return
    if (makeDeck) {
      const deck = deckFromLines(lines, deckName.trim() || 'Mazzo importato', db)
      saveDeck(deck)
      setDeckOwned(deck, true)
      const issues = validateDeck(deck, db).length
      setDone(`Aggiunte ${copies} carte e creato il mazzo “${deck.name}”${issues ? ` (${issues} cose da completare, per esempio le rune)` : ''}.`)
      setText('')
      setTimeout(() => navigate(`/mazzi/${deck.id}`), 1200)
    } else {
      addMany(linesToCounts(lines))
      setDone(`Aggiunte ${copies} carte alla collezione.`)
      setText('')
    }
  }

  return (
    <div className="add-deck">
      <section className="section">
        <h2>Mazzi precostruiti</h2>
        <p className="muted picker-help">Un tocco e tutte le carte della scatola (Legend, campi e rune compresi) entrano nella collezione.</p>
        <div className="preset-list">
          {presets.map((p) => {
            const id = `preset-${p.name.toLowerCase()}`
            const deck = decks.find((d) => d.id === id)
            const official = presetToDeck(p as never, db)
            const champ = official.championId ? db.byId.get(official.championId) : undefined
            const added = !!deck?.addedToCollection
            return (
              <div key={id} className={`preset${added ? ' preset-on' : ''}`}>
                {champ && <img src={cardImage(champ)} alt="" loading="lazy" />}
                <div className="preset-body">
                  <strong>{p.name}</strong>
                  <span className="tiny">{added ? 'Già nella collezione' : 'Non ancora aggiunto'}</span>
                </div>
                {added ? (
                  <button type="button" className="link-more" onClick={() => deck && confirm(`Togliere dalla collezione le carte del mazzo ${p.name}?`) && setDeckOwned(deck, false)}>
                    Togli
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    onClick={() => {
                      if (!deck) saveDeck({ ...official, updatedAt: Date.now() })
                      setDeckOwned({ ...official, id }, true)
                    }}
                  >
                    Ho questo mazzo
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="section">
        <h2>Un altro mazzo: incolla la lista</h2>
        <p className="muted picker-help">
          Copia la lista dal sito di Riot o dalla scatola, una carta per riga: “3 Shadow Assassin”, “3x Shadow Assassin” o solo il nome.
        </p>
        <textarea
          className="list-input"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setDone(null)
          }}
          placeholder={'Legend:\nMaster of Shadows\nMain Deck:\n3 Shadow Assassin\n2 Twilight Step\n…'}
          rows={8}
          aria-label="Lista delle carte"
        />
        <AnimatePresence>
          {done && (
            <motion.p className="import-done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              ✓ {done}
            </motion.p>
          )}
        </AnimatePresence>

        {lines.length > 0 && (
          <div className="import-preview">
            <p>
              <strong className="ok">{matched.length} righe riconosciute</strong> ({copies} carte)
              {missing.length > 0 && (
                <>
                  , <strong className="todo">{missing.length} non riconosciute</strong>
                </>
              )}
            </p>
            {missing.length > 0 && (
              <>
                <p className="tiny">Non sono nomi di carte: se è un errore di battitura correggilo nella lista, se è un titolo puoi ignorarlo.</p>
                <ul className="import-missing">
                  {missing.map((l, i) => (
                    <li key={i}>“{l.raw}”</li>
                  ))}
                </ul>
              </>
            )}
            <label className="import-option">
              <input type="checkbox" checked={makeDeck} onChange={(e) => setMakeDeck(e.target.checked)} />
              Crea anche il mazzo nel deck builder
            </label>
            {makeDeck && (
              <input className="deck-name-input" value={deckName} onChange={(e) => setDeckName(e.target.value)} placeholder="Nome del mazzo" aria-label="Nome del mazzo" />
            )}
            <button type="button" className="btn btn-primary" onClick={importList} disabled={!matched.length}>
              Aggiungi {copies} carte alla collezione
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
