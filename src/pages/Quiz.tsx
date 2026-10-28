import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import { QUIZ, QUIZ_CATEGORIES, type QuizCategory, type QuizQuestion } from '../data/quiz'
import { RuleQuote } from '../components/Explainer'
import './quiz.css'

const LENGTH = 10
const BEST_KEY = 'rv-quiz-best'

type Filter = QuizCategory | 'tutte'

interface Round {
  q: QuizQuestion
  order: number[]
  picked: number | null
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

function readBest(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function newRounds(filter: Filter): Round[] {
  const pool = QUIZ.filter((q) => filter === 'tutte' || q.category === filter)
  return shuffle(pool)
    .slice(0, LENGTH)
    .map((q) => ({ q, order: shuffle(q.options.map((_, i) => i)), picked: null }))
}

export function Quiz() {
  const [filter, setFilter] = useState<Filter>('tutte')
  const [rounds, setRounds] = useState<Round[] | null>(null)
  const [index, setIndex] = useState(0)
  const [best, setBest] = useState(readBest)

  function start(f = filter) {
    setRounds(newRounds(f))
    setIndex(0)
  }

  if (!rounds) {
    return (
      <div className="quiz">
        <Link to="/impara" className="link-more">
          ← Impara
        </Link>
        <header className="quiz-head">
          <h1>Mettiti alla prova</h1>
          <p className="muted">
            {LENGTH} domande sulle regole ufficiali. Dopo ogni risposta trovi la spiegazione e il testo della regola.
          </p>
        </header>
        <div className="quiz-cats">
          {[{ id: 'tutte' as const, label: 'Tutti gli argomenti' }, ...QUIZ_CATEGORIES].map((c) => {
            const n = c.id === 'tutte' ? QUIZ.length : QUIZ.filter((q) => q.category === c.id).length
            return (
              <button key={c.id} type="button" className="quiz-cat" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
                <strong>{c.label}</strong>
                <span className="tiny">
                  {n} domande{best[c.id] != null ? ` · record ${best[c.id]}/${Math.min(LENGTH, n)}` : ''}
                </span>
              </button>
            )
          })}
        </div>
        <button type="button" className="btn btn-primary quiz-start" onClick={() => start()}>
          Inizia il quiz
        </button>
      </div>
    )
  }

  const done = index >= rounds.length
  if (done) {
    const score = rounds.filter((r) => r.picked === r.q.answer).length
    return (
      <Result
        rounds={rounds}
        score={score}
        filter={filter}
        prevBest={best[filter]}
        onSave={(s) => {
          const next = { ...best, [filter]: Math.max(best[filter] ?? 0, s) }
          setBest(next)
          try {
            localStorage.setItem(BEST_KEY, JSON.stringify(next))
          } catch {
            /* il record non viene salvato */
          }
        }}
        onAgain={() => start()}
        onMenu={() => setRounds(null)}
      />
    )
  }

  const r = rounds[index]
  const answered = r.picked != null
  const pick = (i: number) => {
    if (answered) return
    setRounds(rounds.map((x, k) => (k === index ? { ...x, picked: i } : x)))
  }

  return (
    <div className="quiz">
      <div className="quiz-top">
        <button type="button" className="link-more" onClick={() => setRounds(null)}>
          ← Esci
        </button>
        <span className="tiny">
          Domanda {index + 1} di {rounds.length}
        </span>
      </div>
      <div className="quiz-progress" aria-hidden>
        <motion.span animate={{ scaleX: (index + (answered ? 1 : 0)) / rounds.length }} transition={{ type: 'spring', stiffness: 200, damping: 26 }} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={r.q.id}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="quiz-cat-label">{QUIZ_CATEGORIES.find((c) => c.id === r.q.category)?.label}</p>
          <h2 className="quiz-q">{r.q.q}</h2>
          <div className="quiz-options">
            {r.order.map((oi, k) => (
              <Option
                key={oi}
                label={String.fromCharCode(65 + k)}
                text={r.q.options[oi]}
                state={!answered ? 'idle' : oi === r.q.answer ? 'right' : oi === r.picked ? 'wrong' : 'off'}
                onPick={() => pick(oi)}
              />
            ))}
          </div>

          <AnimatePresence>
            {answered && <Feedback q={r.q} right={r.picked === r.q.answer} onNext={() => setIndex(index + 1)} last={index === rounds.length - 1} />}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Option({ label, text, state, onPick }: { label: string; text: string; state: 'idle' | 'right' | 'wrong' | 'off'; onPick: () => void }) {
  const reduce = useReducedMotion()
  return (
    <motion.button
      type="button"
      className={`quiz-opt quiz-opt-${state}`}
      onClick={onPick}
      disabled={state !== 'idle'}
      whileTap={state === 'idle' ? { scale: 0.97 } : undefined}
      animate={
        reduce
          ? undefined
          : state === 'wrong'
            ? { x: [0, -9, 8, -5, 3, 0] }
            : state === 'right'
              ? { scale: [1, 1.04, 1] }
              : { x: 0, scale: 1 }
      }
      transition={{ duration: state === 'wrong' ? 0.38 : 0.3 }}
    >
      <span className="quiz-opt-letter">{state === 'right' ? '✓' : state === 'wrong' ? '✕' : label}</span>
      <span>{text}</span>
    </motion.button>
  )
}

function Feedback({ q, right, onNext, last }: { q: QuizQuestion; right: boolean; onNext: () => void; last: boolean }) {
  const [showRule, setShowRule] = useState(false)
  return (
    <motion.div
      className={`quiz-feedback ${right ? 'is-right' : 'is-wrong'}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
    >
      <p className="quiz-verdict">{right ? 'Giusto!' : 'Non proprio.'}</p>
      <p>{q.explain}</p>
      <button type="button" className="explainer-rule-toggle" aria-expanded={showRule} onClick={() => setShowRule((v) => !v)}>
        {showRule ? 'Nascondi la regola' : `Leggi la regola ufficiale (${q.rules.join(', ')})`}
      </button>
      <AnimatePresence initial={false}>
        {showRule && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <RuleQuote refs={q.rules} />
          </motion.div>
        )}
      </AnimatePresence>
      <button type="button" className="btn btn-primary quiz-next" onClick={onNext}>
        {last ? 'Vedi il risultato' : 'Avanti'}
      </button>
    </motion.div>
  )
}

function Result({
  rounds,
  score,
  filter,
  prevBest,
  onSave,
  onAgain,
  onMenu,
}: {
  rounds: Round[]
  score: number
  filter: Filter
  prevBest?: number
  onSave: (s: number) => void
  onAgain: () => void
  onMenu: () => void
}) {
  // salva il record quando compare il risultato (onSave tiene il massimo, ripeterlo non cambia nulla)
  useEffect(() => onSave(score), []) // eslint-disable-line react-hooks/exhaustive-deps
  const wrong = rounds.filter((r) => r.picked !== r.q.answer)
  const pct = score / rounds.length
  const record = prevBest == null || score > prevBest
  const R = 54
  const C = 2 * Math.PI * R
  const message =
    pct === 1 ? 'Perfetto: conosci queste regole alla perfezione.' : pct >= 0.7 ? 'Ottimo lavoro: ripassa solo gli errori qui sotto.' : pct >= 0.4 ? 'Buon inizio: rileggi le spiegazioni degli errori.' : 'Riparti dalla guida: poi riprova.'

  return (
    <div className="quiz">
      <div className="quiz-result">
        <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden>
          <circle cx="70" cy="70" r={R} className="ring-bg" />
          <motion.circle
            cx="70"
            cy="70"
            r={R}
            className="ring-fg"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - pct) }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          />
        </svg>
        <div className="quiz-score">
          <strong>
            {score}/{rounds.length}
          </strong>
          {record && score > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.1, type: 'spring', stiffness: 300, damping: 14 }} className="quiz-record">
              Nuovo record
            </motion.span>
          )}
        </div>
        <p className="muted">{message}</p>
        <p className="tiny">{filter === 'tutte' ? 'Tutti gli argomenti' : QUIZ_CATEGORIES.find((c) => c.id === filter)?.label}</p>
        <div className="quiz-result-actions">
          <button type="button" className="btn btn-primary" onClick={onAgain}>
            Altre {rounds.length} domande
          </button>
          <button type="button" className="btn" onClick={onMenu}>
            Cambia argomento
          </button>
        </div>
      </div>

      {wrong.length > 0 && (
        <section className="section">
          <h2>Da ripassare</h2>
          <ul className="quiz-review">
            {wrong.map((r) => (
              <li key={r.q.id}>
                <p className="quiz-review-q">{r.q.q}</p>
                <p className="ok">✓ {r.q.options[r.q.answer]}</p>
                <p className="muted">{r.q.explain}</p>
                <p className="tiny">Regola {r.q.rules.join(', ')}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
