import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { LEARN } from '../data/learn'
import { GLOSSARY } from '../data/glossary'
import './learn.css'
import './quiz.css'

const KIND_TITLE = { keyword: 'Parole chiave', action: 'Azioni di gioco', concept: 'Concetti' } as const

export function Learn() {
  const [q, setQ] = useState('')
  const entries = useMemo(() => {
    const n = q.trim().toLowerCase()
    return GLOSSARY.filter((g) => !n || g.term.toLowerCase().includes(n) || g.short.toLowerCase().includes(n))
  }, [q])

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Impara a giocare</h1>
          <p>Tutto è tratto dal Core Rules ufficiale: ogni spiegazione indica la regola da cui viene.</p>
        </div>
      </header>

      <Link to="/impara/quiz" className="quiz-entry">
        <span>
          <strong>Mettiti alla prova</strong>
          <span className="muted">Quiz sulle regole ufficiali, con spiegazione dopo ogni risposta.</span>
        </span>
        <span className="btn btn-primary btn-small">Inizia</span>
      </Link>

      <section>
        <ol className="chapters">
          {LEARN.map((ch, i) => (
            <motion.li key={ch.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Link to={`/impara/guida/${ch.id}`} className="chapter">
                <span className="chapter-n">{i + 1}</span>
                <span className="chapter-body">
                  <strong>{ch.title}</strong>
                  <span>{ch.lead}</span>
                </span>
              </Link>
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Glossario</h2>
          <span className="tiny">{GLOSSARY.length} voci</span>
        </div>
        <div className="search" style={{ marginBottom: 14 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca una parola (es. Hidden, Tank)" aria-label="Cerca nel glossario" />
        </div>
        {(['keyword', 'action', 'concept'] as const).map((kind) => {
          const list = entries.filter((g) => g.kind === kind)
          if (!list.length) return null
          return (
            <div key={kind} className="gloss-group">
              <h3>{KIND_TITLE[kind]}</h3>
              <div className="gloss-grid">
                {list.map((g) => (
                  <Link key={g.id} to={`/impara/parola/${g.id}`} className="gloss-item">
                    <span className={`kw kw-${g.id}`}>{g.term}</span>
                    <span>{g.short}</span>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
