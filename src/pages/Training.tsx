import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDb } from '../lib/useDb'
import { cardImage } from '../lib/data'
import {
  type CombatResolution,
  type CombatUnit,
  type Role,
  checkAssignment,
  lethalFor,
  mightIn,
  resolveCombat,
  totalDamage,
  unitFromCard,
} from '../lib/combat'
import { LESSONS, TRAINING_POOL, type TrainingLesson } from '../data/training'
import { RuleQuote } from '../components/Explainer'
import { MightGlyph } from '../components/Icons'
import './training.css'

const DONE_KEY = 'rv-training-done'
const VICTORY = 8

function readDone(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function markDone(id: string) {
  try {
    const d = new Set(readDone())
    d.add(id)
    localStorage.setItem(DONE_KEY, JSON.stringify([...d]))
  } catch {
    /* progresso non salvato */
  }
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

/** Combattimento casuale con le carte dell'allenamento. */
function randomLesson(): TrainingLesson {
  const n = (max: number) => 1 + Math.floor(Math.random() * max)
  const unit = () => ({ card: pick(TRAINING_POOL), stunned: Math.random() < 0.1, damage: Math.random() < 0.15 ? n(3) : undefined })
  const points = Math.floor(Math.random() * 8)
  return {
    id: `libero-${Date.now()}`,
    title: 'Allenamento libero',
    goal: 'Assegna i danni nel modo migliore che le regole permettono.',
    hint: 'Ricorda: Tank per primi, danni letali per intero prima di passare alla prossima unità, niente danni in eccesso finché le altre non sono letali.',
    rules: ['467.2.c', '815.1.b'],
    attackers: Array.from({ length: n(3) }, () => ({ card: pick(TRAINING_POOL), stunned: false })),
    defenders: Array.from({ length: n(3) }, unit),
    points,
    scoredOthers: points === 7 ? (Math.random() < 0.5 ? 1 : 0) : 0,
  }
}

export function Training() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [free, setFree] = useState<TrainingLesson | null>(() => (id === 'libero' ? randomLesson() : null))
  const done = readDone()

  if (free) {
    return <Arena key={free.id} lesson={free} onNext={() => setFree(randomLesson())} nextLabel="Nuovo combattimento" />
  }
  const lesson = LESSONS.find((l) => l.id === id)
  if (lesson) {
    const i = LESSONS.indexOf(lesson)
    const next = LESSONS[i + 1]
    return (
      <Arena
        key={lesson.id}
        lesson={lesson}
        index={i}
        onNext={() => navigate(next ? `/impara/allenamento/${next.id}` : '/impara/allenamento')}
        nextLabel={next ? 'Prossima lezione' : 'Torna alle lezioni'}
      />
    )
  }

  return (
    <div className="training">
      <Link to="/impara" className="link-more">
        ← Impara
      </Link>
      <header className="training-head">
        <h1>Allenamento</h1>
        <p className="muted">
          Combattimenti con carte vere. Tu attacchi e assegni i danni, il PC difende seguendo le regole. Alla fine vedi ogni passaggio con la regola che lo decide.
        </p>
      </header>
      <ol className="lessons">
        {LESSONS.map((l, i) => (
          <motion.li key={l.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Link to={`/impara/allenamento/${l.id}`} className={`lesson${done.includes(l.id) ? ' lesson-done' : ''}`}>
              <span className="lesson-n">{done.includes(l.id) ? '✓' : i + 1}</span>
              <span className="lesson-body">
                <strong>{l.title}</strong>
                <span>{l.goal}</span>
              </span>
            </Link>
          </motion.li>
        ))}
      </ol>
      <button type="button" className="btn btn-primary training-free" onClick={() => setFree(randomLesson())}>
        Allenamento libero: combattimenti a caso
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Arena({ lesson, index, onNext, nextLabel }: { lesson: TrainingLesson; index?: number; onNext: () => void; nextLabel: string }) {
  const db = useDb()
  const units = useMemo(() => {
    let i = 0
    const mk = (u: TrainingLesson['attackers'][number]) => {
      const card = db.cards.find((c) => c.name === u.card && !c.alt_art)!
      return unitFromCard(card, `u${i++}`, { stunned: u.stunned, damage: u.damage })
    }
    return { attackers: lesson.attackers.map(mk), defenders: lesson.defenders.map(mk) }
  }, [lesson, db])
  const { attackers, defenders } = units
  const total = totalDamage(attackers, 'attacker')
  const [assign, setAssign] = useState<Record<string, number>>({})
  const [issues, setIssues] = useState<ReturnType<typeof checkAssignment>>([])
  const [result, setResult] = useState<CombatResolution | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [shake, setShake] = useState(0)
  const used = Object.values(assign).reduce((a, b) => a + b, 0)

  const change = (uid: string, d: number) => {
    if (result) return
    setIssues([])
    setAssign((a) => {
      const next = Math.max(0, (a[uid] ?? 0) + d)
      if (d > 0 && used >= total) return a
      return { ...a, [uid]: next }
    })
  }

  function confirmAssign() {
    const found = checkAssignment(total, defenders, 'defender', assign)
    if (found.length) {
      setIssues(found)
      setShake((s) => s + 1)
      return
    }
    const r = resolveCombat(attackers, defenders, assign, { points: lesson.points, victory: VICTORY, battlefields: 2, scoredOthers: lesson.scoredOthers })
    setResult(r)
    if (index != null) markDone(lesson.id)
  }

  function retry() {
    setAssign({})
    setIssues([])
    setResult(null)
  }

  return (
    <div className="training">
      <div className="arena-top">
        <Link to="/impara/allenamento" className="link-more">
          ← Lezioni
        </Link>
        {index != null && (
          <span className="tiny">
            Lezione {index + 1} di {LESSONS.length}
          </span>
        )}
      </div>
      <h1 className="arena-title">{lesson.title}</h1>
      <p className="muted">{lesson.goal}</p>

      <div className="arena-score">
        <span>
          Punti <strong>{lesson.points}</strong>/{VICTORY}
        </span>
        <span>Altro campo: {lesson.scoredOthers ? 'già segnato in questo turno' : 'non ancora segnato in questo turno'}</span>
      </div>

      <section className="arena-side">
        <p className="arena-label">Difensori del PC · controllano il campo</p>
        <div className="arena-row">
          {defenders.map((u) => (
            <UnitTile
              key={u.uid}
              u={u}
              role="defender"
              assigned={(result ? result.attackerAssign : assign)[u.uid] ?? 0}
              dead={result?.deadDefenders.includes(u.uid)}
              onChange={result ? undefined : (d) => change(u.uid, d)}
              canAdd={used < total}
            />
          ))}
        </div>
      </section>

      <div className="arena-vs" aria-hidden>
        <span>VS</span>
      </div>

      <section className="arena-side">
        <p className="arena-label">Le tue unità · attaccano</p>
        <div className="arena-row">
          {attackers.map((u) => (
            <UnitTile key={u.uid} u={u} role="attacker" assigned={result?.defenderAssign[u.uid] ?? 0} dead={result?.deadAttackers.includes(u.uid)} />
          ))}
        </div>
      </section>

      {!result ? (
        <motion.div className="arena-panel" key={shake} animate={shake ? { x: [0, -8, 7, -4, 0] } : undefined} transition={{ duration: 0.35 }}>
          <div className="pool">
            <span>
              Danni da assegnare: <strong>{total - used}</strong> su {total}
            </span>
            <span className="pool-bar">
              <motion.span animate={{ scaleX: total ? used / total : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }} />
            </span>
          </div>
          <AnimatePresence>
            {issues.length > 0 && (
              <motion.ul className="arena-issues" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                {issues.map((i) => (
                  <li key={i.rule + i.text}>
                    <RuleLine rule={i.rule} text={i.text} />
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
          <div className="arena-actions">
            <button type="button" className="btn" onClick={() => setShowHint((v) => !v)}>
              Suggerimento
            </button>
            <button type="button" className="btn btn-primary" onClick={confirmAssign}>
              Conferma i danni
            </button>
          </div>
          <AnimatePresence>
            {showHint && (
              <motion.p className="arena-hint" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {lesson.hint}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      ) : (
        <Outcome result={result} onRetry={retry} onNext={onNext} nextLabel={nextLabel} />
      )}
    </div>
  )
}

function UnitTile({
  u,
  role,
  assigned,
  dead,
  onChange,
  canAdd,
}: {
  u: CombatUnit
  role: Role
  assigned: number
  dead?: boolean
  onChange?: (d: number) => void
  canAdd?: boolean
}) {
  const m = mightIn(u, role)
  const bonus = role === 'attacker' ? u.assault : u.shield
  const lethal = lethalFor(u, role)
  return (
    <motion.div className={`unit${dead ? ' unit-dead' : ''}`} layout animate={dead ? { opacity: 0.55, scale: 0.94, rotate: role === 'defender' ? -3 : 3 } : { opacity: 1, scale: 1, rotate: 0 }}>
      <div className="unit-art">
        <img src={cardImage(u.card)} alt={u.card.name} />
        <span className="unit-might">
          <MightGlyph size={13} /> {m}
          {bonus > 0 && <small>+{bonus}</small>}
        </span>
        <AnimatePresence>
          {assigned > 0 && (
            <motion.span key={assigned} className="unit-dmg" initial={{ scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
              −{assigned}
            </motion.span>
          )}
        </AnimatePresence>
        {dead && <span className="unit-dead-tag">Muore</span>}
      </div>
      <p className="unit-name">{u.card.name}</p>
      <div className="unit-tags">
        {u.tank && <span className="kw kw-tank">Tank</span>}
        {u.backline && <span className="kw kw-backline">Backline</span>}
        {role === 'attacker' && u.assault > 0 && <span className="kw kw-assault">Assault {u.assault}</span>}
        {role === 'defender' && u.shield > 0 && <span className="kw kw-shield">Shield {u.shield}</span>}
        {u.stunned && <span className="kw kw-stun">Stordita</span>}
        {(u.damage ?? 0) > 0 && <span className="unit-pre">già {u.damage} danni</span>}
      </div>
      {onChange && (
        <div className="unit-step">
          <button type="button" onClick={() => onChange(-1)} disabled={assigned === 0} aria-label={`Togli un danno a ${u.card.name}`}>
            −
          </button>
          <span className={assigned >= lethal ? 'ok' : ''}>
            {assigned}/{lethal}
          </span>
          <button type="button" onClick={() => onChange(1)} disabled={!canAdd} aria-label={`Assegna un danno a ${u.card.name}`}>
            +
          </button>
        </div>
      )}
    </motion.div>
  )
}

function RuleLine({ rule, text }: { rule: string; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <p>{text}</p>
      <button type="button" className="rule-chip" onClick={() => setOpen((v) => !v)}>
        Regola {rule}
      </button>
      {open && <RuleQuote refs={[rule]} />}
    </>
  )
}

function Outcome({ result, onRetry, onNext, nextLabel }: { result: CombatResolution; onRetry: () => void; onNext: () => void; nextLabel: string }) {
  const o = result.outcome
  const banner =
    o.kind === 'conquer'
      ? o.wins
        ? { tone: 'win', title: 'Vittoria!', text: 'Conquisti il campo e raggiungi 8 punti.' }
        : o.gainPoint
          ? { tone: 'good', title: 'Conquista! +1 punto', text: 'Il campo è tuo.' }
          : { tone: 'mid', title: 'Conquista, ma niente punto', text: 'Il campo è tuo, ma al posto del punto finale peschi una carta.' }
      : o.kind === 'no-result'
        ? { tone: 'mid', title: 'Nessun vincitore', text: 'I tuoi attaccanti tornano alla base. Il campo resta al PC.' }
        : o.kind === 'defender-holds'
          ? { tone: 'bad', title: 'Il PC difende il campo', text: 'Le tue unità sono state eliminate.' }
          : { tone: 'mid', title: 'Campo senza controllo', text: 'Sono morte tutte le unità: il campo non è più di nessuno.' }
  return (
    <div className="outcome">
      <motion.div className={`outcome-banner tone-${banner.tone}`} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.25 }}>
        <strong>{banner.title}</strong>
        <span>{banner.text}</span>
      </motion.div>
      <ol className="outcome-steps">
        {result.steps.map((s, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 + i * 0.12 }}>
            <RuleLine rule={s.rule} text={s.text} />
          </motion.li>
        ))}
      </ol>
      <div className="arena-actions">
        <button type="button" className="btn" onClick={onRetry}>
          Riprova
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {nextLabel}
        </button>
      </div>
    </div>
  )
}
