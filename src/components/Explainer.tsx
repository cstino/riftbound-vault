import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useLocation } from 'react-router-dom'
import { GLOSSARY_BY_ID } from '../data/glossary'
import { loadRules, rulesUnder, cardImage } from '../lib/data'
import type { RuleEntry } from '../lib/types'
import { useDb } from '../lib/useDb'
import './explainer.css'

const KIND_LABEL = { keyword: 'Parola chiave', action: 'Azione di gioco', concept: 'Concetto' } as const

export function RuleQuote({ refs }: { refs: string[] }) {
  const [data, setData] = useState<{ updated: string; rules: RuleEntry[] } | null>(null)
  useEffect(() => {
    loadRules().then(setData)
  }, [])
  if (!data) return <p className="rule-loading">Carico le regole…</p>
  return (
    <div className="rule-quote" lang="en">
      {refs.map((ref) => (
        <div key={ref} className="rule-block">
          {rulesUnder(data.rules, ref).map((r) => (
            <p key={r.n} style={{ paddingLeft: `${Math.max(0, r.n.split('.').length - 1) * 10}px` }}>
              <span className="rule-n">{r.n}</span> {r.t}
            </p>
          ))}
        </div>
      ))}
      <p className="rule-source">Riftbound Core Rules, aggiornamento {data.updated}</p>
    </div>
  )
}

export function Explainer({ id, headingLevel = 3 }: { id: string; headingLevel?: 2 | 3 }) {
  const g = GLOSSARY_BY_ID[id]
  const db = useDb()
  const location = useLocation()
  const [showRule, setShowRule] = useState(false)
  if (!g) return null
  const H = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <article className="explainer">
      <header>
        <span className={`explainer-chip kw kw-${g.id}`}>{g.term}</span>
        <span className="explainer-kind">{KIND_LABEL[g.kind]}</span>
      </header>
      <H className="explainer-short">{g.short}</H>
      <ul className="explainer-how">
        {g.how.map((h, i) => (
          <li key={i}>{h}</li>
        ))}
      </ul>
      {g.example && (
        <div className="explainer-example">
          <div className="explainer-example-cards">
            {g.example.cards.map((cid) => {
              const c = db.byId.get(cid)
              if (!c) return null
              return (
                <Link key={cid} to={`/carta/${cid}`} state={{ background: location.state?.background ?? location }}>
                  <img src={cardImage(c)} alt={c.name} loading="lazy" />
                </Link>
              )
            })}
          </div>
          <div>
            <p className="explainer-example-label">Esempio pratico</p>
            <p>{g.example.text}</p>
          </div>
        </div>
      )}
      <button type="button" className="explainer-rule-toggle" aria-expanded={showRule} onClick={() => setShowRule((v) => !v)}>
        {showRule ? 'Nascondi la regola ufficiale' : `Leggi la regola ufficiale (${g.rules.join(', ')})`}
      </button>
      <AnimatePresence initial={false}>
        {showRule && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <RuleQuote refs={g.rules} />
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  )
}
