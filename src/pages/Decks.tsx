import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useDb } from '../lib/useDb'
import { useVault } from '../lib/store'
import { cardImage } from '../lib/data'
import { countOf, deckOverall, emptyDeck, validateDeck } from '../lib/deck'
import { useMeta } from '../lib/useMeta'
import { DomainIcon } from '../components/Icons'
import { deckColors } from '../components/DeckRoster'
import { useTilt } from '../lib/useTilt'
import type { Deck } from '../lib/types'
import { ownedCoverage } from './deckUtils'
import './decks.css'

export function Decks() {
  const decks = useVault((s) => s.decks)
  const saveDeck = useVault((s) => s.saveDeck)
  const navigate = useNavigate()

  function create() {
    const d = emptyDeck('Nuovo mazzo')
    saveDeck(d)
    navigate(`/mazzi/${d.id}`)
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Deck</h1>
          <p>{decks.length} mazzi. Ogni mazzo viene controllato con le regole di costruzione ufficiali.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-primary" onClick={create}>
            Nuovo mazzo
          </button>
          <Link className="btn" to="/mazzi/auto">
            Costruisci in automatico
          </Link>
        </div>
      </header>

      <div className="deck-list">
        {decks.map((d, i) => (
          <motion.div key={d.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.05, ease: [0.22, 1, 0.36, 1] }}>
            <DeckCard deck={d} />
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/** Copertina di un mazzo: illustrazione del campione, overall, Legend, domini e tre indicatori. */
function DeckCard({ deck }: { deck: Deck }) {
  const db = useDb()
  const decks = useVault((s) => s.decks)
  const owned = useVault((s) => s.owned)
  const meta = useMeta()
  const tilt = useTilt(6)
  const { legend, doms, c1, c2 } = deckColors(deck, db)
  const champ = deck.championId ? db.byId.get(deck.championId) : undefined
  const issues = validateDeck(deck, db)
  const cov = ownedCoverage(deck, db, owned, decks)
  const ovr = meta ? deckOverall(deck, db, meta) : null
  const n = countOf(deck.main)
  const title = legend?.name.split(' - ')[1] ?? legend?.name
  return (
    <motion.div className="deck-card-wrap" style={tilt.style} {...tilt.handlers} whileHover={{ y: -6 }}>
      <Link to={`/mazzi/${deck.id}`} className="deck-card" style={{ ['--c1' as string]: c1, ['--c2' as string]: c2 }}>
        <span className="deck-card-art">
          {champ ? <img src={cardImage(champ)} alt="" loading="lazy" draggable={false} /> : <span className="deck-card-placeholder">?</span>}
        </span>
        <motion.span className="deck-card-shine" style={{ background: tilt.shine }} aria-hidden />
        {deck.preset && <span className="deck-card-chip">Precostruito</span>}
        {ovr && (
          <span className="deck-card-ovr" title={`Overall: ${Math.round(ovr.expected * 100)}% di vittorie attese nei tornei`}>
            <strong>{ovr.overall}</strong>
            <small>OVR</small>
          </span>
        )}
        <span className="deck-card-body">
          <span className="deck-card-name">{deck.name}</span>
          <span className="deck-card-legend">
            {doms.map((dm) => (
              <DomainIcon key={dm} domain={dm} size={16} />
            ))}
            <span>{title ?? 'Legend da scegliere'}</span>
          </span>
          <span className="deck-card-stats">
            <span className={n === 40 ? 'stat' : 'stat stat-warn'}>{n}/40 carte</span>
            <span className={issues.length ? 'stat stat-warn' : 'stat stat-ok'}>{issues.length ? `${issues.length} da sistemare` : 'Legale'}</span>
          </span>
          <span className="deck-card-own" title={`Possiedi ${cov.have} carte su ${cov.need}`}>
            <span className="deck-card-own-bar">
              <span style={{ width: `${cov.need ? (100 * cov.have) / cov.need : 0}%` }} />
            </span>
            <span className="tiny">
              Possiedi {cov.have}/{cov.need}
            </span>
          </span>
        </span>
      </Link>
    </motion.div>
  )
}
