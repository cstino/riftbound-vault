import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useDb } from '../lib/useDb'
import { useVault } from '../lib/store'
import { cardImage } from '../lib/data'
import { countOf, emptyDeck, validateDeck } from '../lib/deck'
import { DomainIcon } from '../components/Icons'
import { ownedCoverage } from './deckUtils'
import './decks.css'

export function Decks() {
  const db = useDb()
  const decks = useVault((s) => s.decks)
  const owned = useVault((s) => s.owned)
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
        <button className="btn btn-primary" onClick={create}>
          Nuovo mazzo
        </button>
      </header>

      <div className="deck-list">
        {decks.map((d, i) => {
          const legend = d.legendId ? db.byId.get(d.legendId) : undefined
          const champ = d.championId ? db.byId.get(d.championId) : undefined
          const issues = validateDeck(d, db)
          const cov = ownedCoverage(d, db, owned, decks)
          return (
            <motion.div key={d.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.05 }}>
              <Link to={`/mazzi/${d.id}`} className="deck-card">
                <div className="deck-card-art">
                  {champ ? <img src={cardImage(champ)} alt="" loading="lazy" /> : <span className="deck-card-placeholder">?</span>}
                </div>
                <div className="deck-card-body">
                  <div className="deck-card-title">
                    <h2>{d.name}</h2>
                    {d.preset && <span className="tiny">Precostruito</span>}
                  </div>
                  <p className="muted">{legend ? legend.name : 'Legend da scegliere'}</p>
                  <p className="deck-card-domains">
                    {legend?.domains.map((dm) => (
                      <DomainIcon key={dm} domain={dm} size={20} />
                    ))}
                  </p>
                  <p className="deck-card-stats">
                    <span>{countOf(d.main)} carte</span>
                    <span className={issues.length ? 'todo' : 'ok'}>{issues.length ? `${issues.length} da sistemare` : 'Legale'}</span>
                    <span>
                      Possiedi {cov.have}/{cov.need}
                    </span>
                  </p>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
