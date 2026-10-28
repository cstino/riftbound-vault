import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useDb } from '../lib/useDb'
import { useVault } from '../lib/store'
import { isBasePrinting, rarityRank, SET_ORDER, cardImage } from '../lib/data'
import { validateDeck } from '../lib/deck'
import { GLOSSARY_BY_ID } from '../data/glossary'
import { LEARN } from '../data/learn'
import { Coverflow } from '../components/Coverflow'
import { keywordIdsIn } from '../components/CardText'
import { useSheet } from '../components/sheetStore'
import './home.css'

export function Home() {
  const db = useDb()
  const owned = useVault((s) => s.owned)
  const decks = useVault((s) => s.decks)
  const openSheet = useSheet((s) => s.open)
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const ownedCards = useMemo(
    () => Object.keys(owned).map((id) => db.byId.get(id)).filter((c) => c != null),
    [owned, db],
  )
  const best = useMemo(
    () => [...ownedCards].sort((a, b) => rarityRank(b) - rarityRank(a) || (b.energy ?? 0) - (a.energy ?? 0)).slice(0, 10),
    [ownedCards],
  )
  const copies = Object.values(owned).reduce((a, b) => a + b, 0)

  const sets = useMemo(() => {
    return SET_ORDER.map((code) => {
      const base = db.cards.filter((c) => c.set === code && isBasePrinting(c) && /^\d+$/.test(c.number))
      const have = base.filter((c) => owned[c.id]).length
      return { code, name: base[0]?.set_name ?? code, total: base.length, have }
    }).filter((s) => s.have > 0)
  }, [db, owned])

  // La parola chiave che compare su più carte della tua collezione
  const spotlight = useMemo(() => {
    const count = new Map<string, number>()
    for (const c of ownedCards) for (const id of keywordIdsIn(c.text)) count.set(id, (count.get(id) ?? 0) + 1)
    const [id, n] = [...count.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    return id ? { entry: GLOSSARY_BY_ID[id], n: n! } : null
  }, [ownedCards])

  return (
    <div className="home">
      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          navigate(`/collezione?q=${encodeURIComponent(q)}&tutte=1`)
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca tra 1.408 carte" aria-label="Cerca carte" />
        <button className="search-dot" aria-label="Cerca">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m20 20-4.6-4.6" />
          </svg>
        </button>
      </form>

      <header className="home-head">
        <h1>La tua collezione</h1>
        <p className="muted">
          {copies} copie, {ownedCards.length} carte diverse
        </p>
      </header>

      <Coverflow cards={best} caption={(c) => `${c.rarity} · ${c.set_name} ${c.number}/${c.set_size}`} />

      <section className="section">
        <div className="section-head">
          <h2>Set</h2>
          <Link to="/collezione">Apri la collezione</Link>
        </div>
        <div className="set-grid">
          {sets.map((s, i) => (
            <Link key={s.code} to={`/collezione?set=${s.code}`} className="set-tile">
              <span className="set-code">{s.code}</span>
              <span className="set-name">{s.name}</span>
              <span className="set-bar" aria-hidden>
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: s.have / s.total }}
                  transition={{ delay: 0.15 + i * 0.06, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
              </span>
              <span className="set-count">
                {s.have} / {s.total}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {spotlight && (
        <section className="section">
          <button type="button" className="spotlight" onClick={() => openSheet(spotlight.entry.id)}>
            <span className={`kw kw-${spotlight.entry.id}`}>{spotlight.entry.term}</span>
            <span className="spotlight-text">
              <strong>Compare su {spotlight.n} delle tue carte.</strong> {spotlight.entry.short}
            </span>
            <span className="spotlight-cta">Come funziona</span>
          </button>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>I tuoi mazzi</h2>
          <Link to="/mazzi">Tutti</Link>
        </div>
        <div className="rail">
          {decks.slice(0, 8).map((d) => {
            const legend = d.legendId ? db.byId.get(d.legendId) : undefined
            const champ = d.championId ? db.byId.get(d.championId) : undefined
            const legal = validateDeck(d, db).length === 0
            return (
              <Link key={d.id} to={`/mazzi/${d.id}`} className="deck-chip">
                {champ && <img src={cardImage(champ)} alt="" loading="lazy" />}
                <span className="deck-chip-body">
                  <strong>{d.name}</strong>
                  <span>{legend?.domains.join(' / ') ?? 'Da completare'}</span>
                  <span className={legal ? 'ok' : 'todo'}>{legal ? 'Pronto da giocare' : 'Da completare'}</span>
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Prima partita?</h2>
          <Link to="/impara">Guida completa</Link>
        </div>
        <ol className="learn-steps">
          {LEARN.slice(0, 4).map((ch) => (
            <li key={ch.id}>
              <Link to={`/impara/guida/${ch.id}`}>
                <strong>{ch.title}</strong>
                <span>{ch.lead}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
