import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { GLOSSARY_BY_ID } from '../data/glossary'
import { Explainer } from '../components/Explainer'
import { CardThumb } from '../components/CardThumb'
import { keywordIdsIn } from '../components/CardText'
import { useDb } from '../lib/useDb'
import { useVault } from '../lib/store'
import { sortCards } from '../lib/data'
import './learn.css'

export function GlossaryPage() {
  const { id = '' } = useParams<{ id: string }>()
  const db = useDb()
  const owned = useVault((s) => s.owned)
  const entry = GLOSSARY_BY_ID[id]
  const mine = useMemo(
    () => Object.keys(owned).map((cid) => db.byId.get(cid)).filter((c) => c && keywordIdsIn(c.text).includes(id)).sort((a, b) => sortCards(a!, b!)),
    [owned, db, id],
  )
  if (!entry) return <p className="empty">Voce non trovata.</p>
  return (
    <article className="chapter-page">
      <Link to="/impara" className="link-more">
        ← Glossario
      </Link>
      <h1 style={{ margin: '14px 0 18px' }}>{entry.term}</h1>
      <div className="panel">
        <Explainer id={id} headingLevel={2} />
      </div>
      {mine.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Le tue carte con {entry.term}</h2>
            <span className="tiny">{mine.length}</span>
          </div>
          <div className="card-grid">
            {mine.map((c) => (
              <CardThumb key={c!.id} card={c!} qty={owned[c!.id]} />
            ))}
          </div>
        </section>
      )}
    </article>
  )
}
