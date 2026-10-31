import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDb } from '../lib/useDb'
import { useAuth } from '../lib/auth'
import { cardImage } from '../lib/data'
import { OnlineGame, cancelMatch, createMatch, deckProblems, joinMatch, myMatches, type MatchRow } from '../lib/onlineMatch'
import type { Game } from '../lib/game/types'
import { askConfirm } from '../components/ConfirmDialog'
import { useDeckChoices } from './PlayVsPc'
import { Board, type Seat } from './GameBoard'
import './game.css'
import './online.css'

const nameOf = (email: string) => email.split('@')[0]

/** Partite online: crea una stanza o entra con il codice che ti dà l'avversario. */
export function OnlineLobby() {
  const db = useDb()
  const { userId, email } = useAuth()
  const navigate = useNavigate()
  const decks = useDeckChoices()
  const [deckId, setDeckId] = useState<string | null>(null)
  const [bf, setBf] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mine, setMine] = useState<MatchRow[]>([])

  useEffect(() => {
    myMatches(userId).then(setMine).catch(() => setMine([]))
  }, [userId])

  // solo i mazzi legali con tutte le carte nel motore
  const usable = useMemo(() => decks.map((d) => ({ deck: d, problems: deckProblems(d, db) })).filter((x) => !x.problems.length).map((x) => x.deck), [decks, db])
  const deck = usable.find((d) => d.id === deckId) ?? null
  const fields = deck ? deck.battlefields.map((id) => db.byId.get(id)).filter((c) => c != null) : []

  async function go(fn: () => Promise<MatchRow>) {
    setBusy(true)
    setError(null)
    try {
      const row = await fn()
      navigate(`/playground/online/${row.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup online">
      <Link to="/playground" className="link-more">
        ← Playground
      </Link>
      <header className="setup-head">
        <h1>Partita online</h1>
        <p className="muted">
          Contro un altro giocatore, con le regole del Core Rules. Ogni mossa dell’avversario viene ricontrollata dal motore sul tuo dispositivo: una mossa fuori regolamento ferma la partita.
        </p>
      </header>

      {mine.length > 0 && (
        <section className="section">
          <h2>Le tue partite aperte</h2>
          <ul className="online-open">
            {mine.map((m) => (
              <li key={m.id}>
                <Link to={`/playground/online/${m.id}`} className="online-open-row">
                  <strong>{m.host === userId ? (m.guest_name ?? 'in attesa…') : m.host_name}</strong>
                  <span className="tiny muted">
                    {m.status === 'waiting' ? `codice ${m.code}` : 'in corso'} · {new Date(m.created_at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="link-more">Riprendi →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2>1. Il tuo mazzo</h2>
        {usable.length === 0 && <p className="switch-none">Nessun mazzo legale con tutte le carte nel motore di gioco.</p>}
        <div className="auto-pick">
          {usable.map((d) => {
            const champ = d.championId ? db.byId.get(d.championId) : undefined
            return (
              <motion.button
                key={d.id}
                type="button"
                className={`auto-pick-item${d.id === deckId ? ' auto-pick-on' : ''}`}
                onClick={() => {
                  setDeckId(d.id)
                  setBf(null)
                }}
                whileTap={{ scale: 0.95 }}
                aria-pressed={d.id === deckId}
              >
                {champ && <img src={cardImage(champ)} alt="" loading="lazy" />}
                <span>{d.name}</span>
              </motion.button>
            )
          })}
        </div>
      </section>

      {deck && (
        <section className="section">
          <h2>2. Il tuo campo</h2>
          <div className="online-fields">
            <button type="button" className={`online-field${bf === null ? ' on' : ''}`} onClick={() => setBf(null)}>
              A caso <span className="tiny muted">(487.5)</span>
            </button>
            {fields.map((c, i) => (
              <button key={c.id} type="button" className={`online-field${bf === i ? ' on' : ''}`} onClick={() => setBf(i)}>
                <img src={cardImage(c)} alt="" />
                {c.name}
              </button>
            ))}
          </div>
          <p className="tiny muted">Scegliere il campo è la regola del Match (488.5); “a caso” è quella del Duel (487.5).</p>
        </section>
      )}

      {deck && (
        <section className="section online-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => go(() => createMatch(deck, bf, nameOf(email)))}>
            Crea una partita
          </button>
          <div className="online-join">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Codice" maxLength={6} aria-label="Codice della partita" autoCapitalize="characters" />
            <button type="button" className="btn" disabled={busy || code.trim().length !== 6} onClick={() => go(() => joinMatch(code, deck, bf, nameOf(email), userId))}>
              Entra
            </button>
          </div>
        </section>
      )}
      {error && <p className="assign-issue">{error}</p>}
    </div>
  )
}

/** Stanza della partita: attesa dell'avversario, poi il tavolo. */
export function OnlineRoom() {
  const { id = '' } = useParams()
  const db = useDb()
  const { userId } = useAuth()
  const [, setTick] = useState(0)
  const [game, setGame] = useState<OnlineGame | null>(null)

  useEffect(() => {
    const g = new OnlineGame(id, userId, db, () => setTick((t) => t + 1))
    setGame(g)
    g.start()
    return () => g.stop()
  }, [id, userId, db])

  if (!game) return null
  const st = game.state
  if (st.kind === 'loading') return <p className="online-wait muted">Collegamento alla partita…</p>
  if (st.kind === 'error')
    return (
      <div className="online-wait">
        <h1>Partita fermata</h1>
        <p className="assign-issue">{st.text}</p>
        <Link to="/playground/online" className="btn">
          Torna alle partite online
        </Link>
      </div>
    )
  if (st.kind === 'waiting') {
    const row = st.row
    const host = row.host === userId
    return (
      <div className="online-wait">
        <Link to="/playground/online" className="link-more">
          ← Partite online
        </Link>
        {row.status === 'over' ? (
          <h1>Partita chiusa</h1>
        ) : host && row.status === 'waiting' ? (
          <>
            <p className="muted">Dai questo codice al tuo avversario:</p>
            <motion.p className="online-code" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              {row.code}
            </motion.p>
            <p className="tiny muted">La partita parte appena entra. Puoi chiudere questa pagina: la ritrovi in “Le tue partite aperte”.</p>
            <button
              type="button"
              className="link-more"
              onClick={async () => {
                if (await askConfirm({ title: 'Annullare la partita?', message: 'Il codice non sarà più valido.', confirmLabel: 'Annulla la partita', danger: true })) {
                  await cancelMatch(row.id)
                  void game.sync()
                }
              }}
            >
              Annulla la partita
            </button>
          </>
        ) : (
          <p className="muted">Preparazione della partita…</p>
        )}
      </div>
    )
  }
  return <OnlineTable game={game} />
}

function OnlineTable({ game }: { game: OnlineGame }) {
  const match = game.match!
  const opp = game.oppName
  const seat: Seat = { me: game.me, name: opp, short: opp, of: `di ${opp}` }
  const waiting = !game.myTurn && match.g.winner === null
  return (
    <Board
      match={match}
      version={game.applied}
      seat={seat}
      exitTo="/playground/online"
      onAnswer={(a) => game.answer(a ?? null)}
      notice={
        <div className="online-bar tiny">
          <span>{game.pendingSend ? 'Invio della mossa…' : waiting ? `Tocca a ${opp}` : match.g.winner === null ? 'Tocca a te' : 'Partita finita'}</span>
          {match.g.winner === null && (
            <button
              type="button"
              className="link-more"
              onClick={async () => {
                if (await askConfirm({ title: 'Abbandonare la partita?', message: `La vittoria va a ${opp}.`, confirmLabel: 'Abbandona', danger: true })) void game.resign()
              }}
            >
              Abbandona
            </button>
          )}
        </div>
      }
      renderOver={(g, onReview) => <OnlineOver g={g} game={game} onReview={onReview} />}
    />
  )
}

function OnlineOver({ g, game, onReview }: { g: Game; game: OnlineGame; onReview: () => void }) {
  const won = g.winner === game.me
  const opp = game.oppName
  const me = game.me
  return (
    <motion.div className="gameover" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className={`gameover-card ${won ? 'won' : 'lost'}`} initial={{ scale: 0.7, y: 40 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
        <span className="tiny">Turno {g.turn}</span>
        <h2>{won ? 'Hai vinto!' : `Ha vinto ${opp}`}</h2>
        {game.resigned !== null && <p className="tiny">{game.resigned === me ? 'Hai abbandonato.' : `${opp} ha abbandonato.`}</p>}
        <p>
          {g.players[me].points} – {g.players[me === 0 ? 1 : 0].points}
        </p>
        <div className="decide-row">
          <Link to="/playground/online" className="btn btn-primary">
            Nuova partita
          </Link>
        </div>
        <button type="button" className="link-more" onClick={onReview}>
          Rivedi il tavolo e la cronaca
        </button>
      </motion.div>
    </motion.div>
  )
}
