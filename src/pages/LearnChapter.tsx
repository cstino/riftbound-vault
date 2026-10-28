import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LEARN } from '../data/learn'
import { GLOSSARY_BY_ID } from '../data/glossary'
import { RuleQuote } from '../components/Explainer'
import { useSheet } from '../components/sheetStore'
import './learn.css'

export function LearnChapterPage() {
  const { id } = useParams<{ id: string }>()
  const index = LEARN.findIndex((c) => c.id === id)
  const ch = LEARN[index]
  const [openRule, setOpenRule] = useState<string | null>(null)
  const openSheet = useSheet((s) => s.open)
  if (!ch) return <p className="empty">Capitolo non trovato.</p>
  const next = LEARN[index + 1]

  return (
    <article className="chapter-page">
      <Link to="/impara" className="link-more">
        ← Impara
      </Link>
      <p className="chapter-kicker">Capitolo {index + 1} di {LEARN.length}</p>
      <h1>{ch.title}</h1>
      <p className="chapter-lead">{ch.lead}</p>

      <ul className="points">
        {ch.points.map((p, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
            <p>{p.text}</p>
            {p.rule && (
              <>
                <button type="button" className="rule-chip" aria-expanded={openRule === p.rule} onClick={() => setOpenRule(openRule === p.rule ? null : p.rule!)}>
                  Regola {p.rule}
                </button>
                <AnimatePresence initial={false}>
                  {openRule === p.rule && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                      <RuleQuote refs={[p.rule]} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </motion.li>
        ))}
      </ul>

      {ch.related && (
        <section className="section">
          <h2>Approfondisci</h2>
          <div className="chips" style={{ marginTop: 10 }}>
            {ch.related.map((r) => (
              <button key={r} type="button" className={`kw kw-${r}`} onClick={() => openSheet(r)}>
                {GLOSSARY_BY_ID[r]?.term}
              </button>
            ))}
          </div>
        </section>
      )}

      {next && (
        <Link to={`/impara/guida/${next.id}`} className="next-chapter">
          <span className="tiny">Prossimo capitolo</span>
          <strong>{next.title}</strong>
        </Link>
      )}
    </article>
  )
}
