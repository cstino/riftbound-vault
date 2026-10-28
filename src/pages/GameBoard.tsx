import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { cardImage } from '../lib/data'
import { useDb } from '../lib/useDb'
import { useGame } from '../lib/gameStore'
import { Match, deckToSpec } from '../lib/game'
import { bfName, friendlyAt, kw, might, unitsAt } from '../lib/game/engine'
import { checkAssignment, lethalFor, type CombatUnit } from '../lib/combat'
import type { ActionOpt, Decision, Game, LocId, Obj, PID } from '../lib/game/types'
import { RuleQuote } from '../components/Explainer'
import { DomainIcon } from '../components/Icons'
import { CardText } from '../components/CardText'
import { useVault } from '../lib/store'
import './game.css'

const ME: PID = 0
const OPP: PID = 1

export function GameBoard() {
  const match = useGame((s) => s.match)
  const version = useGame((s) => s.version)
  const bump = useGame((s) => s.bump)
  useAiRunner(match, version, bump)
  if (!match) return <Navigate to="/playground/partita" replace />
  return <Board match={match} version={version} />
}

/** Fa giocare il PC un passo alla volta, con una pausa sulle azioni perché si possano seguire. */
function useAiRunner(match: Match | null, version: number, bump: () => void) {
  useEffect(() => {
    const d = match?.pending
    if (!match || !d || match.isHuman(d)) return
    // dopo una carta giocata dal PC si aspetta di più, per lasciarla vedere (Spotlight)
    const last = match.g.log[match.g.log.length - 1]
    const delay = last?.player === OPP && last.card ? 1700 : d.type === 'act' ? 650 : 280
    const t = setTimeout(() => {
      match.next(match.aiAnswer(d))
      bump()
    }, delay)
    return () => clearTimeout(t)
  }, [match, version, bump])
}

type Sheet = { kind: 'obj'; uid: number } | { kind: 'acts' } | { kind: 'log' } | { kind: 'trash'; p: PID } | { kind: 'rule'; n: string } | null

function Board({ match, version }: { match: Match; version: number }) {
  const g = match.g
  const bump = useGame((s) => s.bump)
  const d = match.pending
  const mine = !!d && match.isHuman(d)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [reviewing, setReviewing] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [peek, setPeek] = useState(false)
  useEffect(() => setReviewing(false), [g])
  useEffect(() => {
    setPeek(false)
    setPicked(null)
  }, [d])
  // Il tavolo occupa lo schermo: niente scorrimento della pagina
  useEffect(() => {
    window.scrollTo(0, 0)
    document.body.classList.add('no-scroll')
    return () => document.body.classList.remove('no-scroll')
  }, [])
  void version

  const answer = (a: Parameters<Match['next']>[0]) => {
    match.next(a)
    setSheet(null)
    bump()
  }

  const actions = mine && d?.type === 'act' ? d.actions : []
  const actionsFor = (uid: number) => actions.filter((a) => a.uid === uid)
  const end = actions.find((a) => a.kind === 'end' || a.kind === 'pass')
  const move = actions.find((a) => a.kind === 'move')
  const modal = mine && d && d.type !== 'act' && g.winner === null ? d : null
  const openObj = (uid: number) => setSheet({ kind: 'obj', uid })

  return (
    <div className="table">
      <div className="table-corner">
        <Link to="/playground/partita" className="corner-btn" aria-label="Esci dalla partita">
          ✕
        </Link>
        <button type="button" className="corner-btn" onClick={() => setSheet({ kind: 'log' })}>
          Cronaca
        </button>
      </div>
      <OppHand n={g.players[OPP].hand.length} />
      <PlayerStrip g={g} p={OPP} onTrash={() => setSheet({ kind: 'trash', p: OPP })} onObj={openObj} actionsFor={actionsFor} />
      <BaseRow g={g} p={OPP} onObj={openObj} actionsFor={actionsFor} />
      <div className="bfs">
        {g.bfs.map((b) => (
          <BattlefieldTile key={b.loc} g={g} loc={b.loc} onObj={openObj} actionsFor={actionsFor} />
        ))}
      </div>
      <BaseRow g={g} p={ME} onObj={openObj} actionsFor={actionsFor} />
      <PlayerStrip g={g} p={ME} onTrash={() => setSheet({ kind: 'trash', p: ME })} onObj={openObj} actionsFor={actionsFor} />
      <div className="controls">
        <Banner g={g} d={d} mine={mine} onLog={() => setSheet({ kind: 'log' })} />
        <div className="controls-btns">
          {move && (
            <button type="button" className="pill pill-move" onClick={() => answer(move.id)}>
              Muovi
            </button>
          )}
          {actions.length > 1 && (
            <button type="button" className="pill" onClick={() => setSheet({ kind: 'acts' })}>
              Azioni {actions.length - 1}
            </button>
          )}
          <EndButton action={end} onClick={() => end && answer(end.id)} waiting={!!d && !mine && g.winner === null} />
        </div>
      </div>
      <ChainBar g={g} />
      <FanHand g={g} actionsFor={actionsFor} picked={picked} setPicked={setPicked} onDetails={openObj} run={(a) => answer(a.id)} />

      <AnimatePresence>
        {modal && !peek && (
          <motion.div key="modal" className="modal-root" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="modal-scrim" />
            <motion.div className="modal" initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
              <button type="button" className="modal-peek" onClick={() => setPeek(true)}>
                Guarda il tavolo
              </button>
              {modal.type === 'choose' ? <ChoosePanel g={g} d={modal} answer={answer} /> : modal.type === 'assign' ? <AssignPanel g={g} d={modal} answer={answer} /> : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {modal && peek && (
        <button type="button" className="peek-back" onClick={() => setPeek(false)}>
          Torna alla scelta
        </button>
      )}

      <AnimatePresence>
        {sheet && (
          <SheetFrame key="sheet" onClose={() => setSheet(null)}>
            {sheet.kind === 'obj' && <ObjSheet g={g} uid={sheet.uid} actions={actionsFor(sheet.uid)} run={(a) => answer(a.id)} />}
            {sheet.kind === 'acts' && (
              <div className="sheet-body">
                <h2>Cosa puoi fare adesso</h2>
                <div className="obj-actions">
                  {actions
                    .filter((a) => a !== end)
                    .map((a) => (
                      <button key={a.id} type="button" className={`act act-${a.kind}`} onClick={() => answer(a.id)}>
                        {a.label}
                      </button>
                    ))}
                </div>
              </div>
            )}
            {sheet.kind === 'log' && <LogSheet g={g} onRule={(n) => setSheet({ kind: 'rule', n })} />}
            {sheet.kind === 'trash' && <TrashSheet g={g} p={sheet.p} onObj={openObj} />}
            {sheet.kind === 'rule' && (
              <div className="sheet-body">
                <button type="button" className="link-more" onClick={() => setSheet({ kind: 'log' })}>
                  ← Cronaca
                </button>
                <RuleQuote refs={[sheet.n]} />
              </div>
            )}
          </SheetFrame>
        )}
      </AnimatePresence>
      <Spotlight g={g} />
      {g.winner !== null && !reviewing && <GameOver g={g} onReview={() => setReviewing(true)} />}
    </div>
  )
}

/** Mostra in grande ogni carta che il PC gioca o usa, come nei giochi di carte digitali. */
function Spotlight({ g }: { g: Game }) {
  const seen = useRef(g.log.length)
  const [shown, setShown] = useState<{ key: number; entry: Game['log'][number] } | null>(null)
  const n = g.log.length
  useEffect(() => {
    const fresh = g.log.slice(seen.current).map((entry, i) => ({ key: seen.current + i, entry }))
    seen.current = g.log.length
    const hit = fresh.filter((x) => x.entry.player === OPP && x.entry.card && !x.entry.card.id.startsWith('token')).pop()
    if (!hit) return
    setShown(hit)
    const t = setTimeout(() => setShown(null), 1800)
    return () => clearTimeout(t)
  }, [n, g])
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.key}
          role="button"
          className="pc-play"
          onClick={() => setShown(null)}
          initial={{ opacity: 0, scale: 0.5, y: -120, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 40 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        >
          <img src={cardImage(shown.entry.card!)} alt={shown.entry.card!.name} />
          <span>{shown.entry.text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------- parti del tavolo

function Pips({ n, max }: { n: number; max: number }) {
  return (
    <span className="pips" aria-label={`${n} punti su ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <motion.span key={i} className={i < n ? 'pip pip-on' : 'pip'} animate={i < n ? { scale: [1.6, 1] } : {}} transition={{ duration: 0.4 }} />
      ))}
      <strong>{n}</strong>
    </span>
  )
}

function PlayerStrip({ g, p, onTrash, onObj, actionsFor }: { g: Game; p: PID; onTrash: () => void; onObj: (uid: number) => void; actionsFor: (uid: number) => ActionOpt[] }) {
  const pl = g.players[p]
  const legend = g.objs.get(pl.legend)!
  const runes = pl.runes.map((u) => g.objs.get(u)!)
  const champ = pl.champion !== null ? g.objs.get(pl.champion) : undefined
  return (
    <div className={`strip strip-${p === ME ? 'me' : 'opp'}${g.turnPlayer === p ? ' strip-turn' : ''}`}>
      <button type="button" className={`strip-legend${legend.exhausted ? ' is-exhausted' : ''}${legend.empowered ? ' is-empowered' : ''}${actionsFor(legend.uid).length ? ' is-actionable' : ''}`} onClick={() => onObj(legend.uid)}>
        <img src={cardImage(legend.card)} alt={legend.card.name} />
      </button>
      <div className="strip-main">
        <div className="strip-line">
          <strong>{p === ME ? 'Tu' : 'PC'}</strong>
          <span className="tiny strip-deck">{pl.deckName}</span>
          <Pips n={pl.points} max={g.victory} />
        </div>
        <div className="strip-line">
          <span className="runes" aria-label="Rune">
            {runes.map((r) => (
              <span key={r.uid} className={`rune${r.exhausted ? ' rune-off' : ''}`} title={r.card.name}>
                <DomainIcon domain={r.card.domains[0]} size={14} />
              </span>
            ))}
            {pl.pool.energy > 0 && <span className="pool">+{pl.pool.energy}</span>}
          </span>
          <span className="strip-counts tiny">
            <span>Mazzo {pl.deck.length}</span>
            <button type="button" onClick={onTrash}>
              Trash {pl.trash.length}
            </button>
            {champ && (
              <button type="button" className={actionsFor(champ.uid).length ? 'champ-ready' : ''} onClick={() => onObj(champ.uid)}>
                Campione
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}

function UnitChip({ g, o, onObj, actionable }: { g: Game; o: Obj; onObj: (uid: number) => void; actionable?: boolean }) {
  const m = might(g, o)
  const k = kw(g, o)
  const base = o.card.might ?? 0
  return (
    <motion.button
      layout
      layoutId={`obj-${o.card.id}-${o.uid}`}
      type="button"
      className={`unit-chip${o.exhausted ? ' is-exhausted' : ''}${o.empowered ? ' is-empowered' : ''}${o.controller === ME ? ' is-mine' : ' is-theirs'}${actionable ? ' is-actionable' : ''}`}
      onClick={() => onObj(o.uid)}
      initial={{ opacity: 0, scale: 0.6, y: o.controller === ME ? 30 : -30 }}
      animate={{ opacity: 1, scale: 1, y: 0, rotate: o.exhausted ? 8 : 0 }}
      exit={{ opacity: 0, scale: 0.4 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
    >
      {o.token ? <span className="token-face">{o.card.name}</span> : <img src={cardImage(o.card)} alt={o.card.name} loading="lazy" />}
      <span className={`chip-might${m > base ? ' up' : m < base ? ' down' : ''}`}>{m}</span>
      {o.damage > 0 && <span className="chip-dmg">-{o.damage}</span>}
      <span className="chip-flags">
        {o.stunned && <span title="Stordita">STUN</span>}
        {k.tank && <span title="Tank">TANK</span>}
        {o.role === 'attacker' && <span title="Attaccante">ATK</span>}
        {o.role === 'defender' && <span title="Difensore">DEF</span>}
        {o.attachedTo === null && g.objs.size > 0 && [...g.objs.values()].some((x) => x.attachedTo === o.uid) && <span>EQUIP</span>}
      </span>
    </motion.button>
  )
}

function BaseRow({ g, p, onObj, actionsFor }: { g: Game; p: PID; onObj: (uid: number) => void; actionsFor: (uid: number) => ActionOpt[] }) {
  const loc: LocId = p === 0 ? 'base0' : 'base1'
  const list = [...g.objs.values()].filter((o) => o.zone === 'board' && o.loc === loc)
  return (
    <div className={`base base-${p === ME ? 'me' : 'opp'}`}>
      <span className="base-label">{p === ME ? 'La tua base' : 'Base del PC'}</span>
      <div className="base-units">
        <AnimatePresence>
          {list.map((o) => (
            <UnitChip key={o.uid} g={g} o={o} onObj={onObj} actionable={actionsFor(o.uid).length > 0} />
          ))}
        </AnimatePresence>
        {!list.length && <span className="tiny board-empty">vuota</span>}
      </div>
    </div>
  )
}

function BattlefieldTile({ g, loc, onObj, actionsFor }: { g: Game; loc: LocId; onObj: (uid: number) => void; actionsFor: (uid: number) => ActionOpt[] }) {
  const bf = g.bfs.find((b) => b.loc === loc)!
  const sd = g.showdown?.loc === loc ? g.showdown : null
  const them = friendlyAt(g, OPP, loc)
  const us = friendlyAt(g, ME, loc)
  const gear = [...g.objs.values()].filter((o) => o.zone === 'board' && o.loc === loc && !/Unit/.test(o.card.type))
  const face = bf.facedown !== null ? g.objs.get(bf.facedown) : undefined
  const owner = bf.controller === ME ? 'me' : bf.controller === OPP ? 'opp' : 'none'
  return (
    <div className={`bf bf-${owner}${sd ? ' bf-live' : ''}`}>
      <img className="bf-art" src={cardImage(bf.card)} alt="" />
      <div className="bf-head">
        <strong>{bfName(g, loc)}</strong>
        <span className="tiny">{bf.controller === null ? 'libero' : bf.controller === ME ? 'tuo' : 'del PC'}</span>
      </div>
      {sd && <span className="bf-live-tag">{sd.combat ? 'Combattimento' : 'Showdown'}</span>}
      <div className="bf-row bf-row-opp">
        <AnimatePresence>
          {them.map((o) => (
            <UnitChip key={o.uid} g={g} o={o} onObj={onObj} />
          ))}
        </AnimatePresence>
      </div>
      <div className="bf-row bf-row-me">
        <AnimatePresence>
          {us.map((o) => (
            <UnitChip key={o.uid} g={g} o={o} onObj={onObj} actionable={actionsFor(o.uid).length > 0} />
          ))}
        </AnimatePresence>
      </div>
      {(face || gear.length > 0) && (
        <div className="bf-extra tiny">
          {face && (
            <button type="button" className={`facedown${actionsFor(face.uid).length ? ' is-actionable' : ''}`} onClick={() => (face.controller === ME ? onObj(face.uid) : undefined)}>
              {face.controller === ME ? `Nascosta: ${face.card.name}` : 'Carta nascosta del PC'}
            </button>
          )}
          {gear.map((o) => (
            <button key={o.uid} type="button" onClick={() => onObj(o.uid)}>
              {o.card.name}
            </button>
          ))}
        </div>
      )}
      {unitsAt(g, loc).length === 0 && !face && <span className="bf-empty tiny">nessuna unità</span>}
    </div>
  )
}

/** Mano a ventaglio: tocca una carta per sollevarla e vedere cosa puoi farci. */
function FanHand({
  g,
  actionsFor,
  picked,
  setPicked,
  onDetails,
  run,
}: {
  g: Game
  actionsFor: (uid: number) => ActionOpt[]
  picked: number | null
  setPicked: (uid: number | null) => void
  onDetails: (uid: number) => void
  run: (a: ActionOpt) => void
}) {
  const cards = g.players[ME].hand.map((u) => g.objs.get(u)!)
  const [width, setWidth] = useState(() => Math.min(window.innerWidth, 760))
  useEffect(() => {
    const on = () => setWidth(Math.min(window.innerWidth, 760))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const n = cards.length
  const cardW = 76
  const step = n > 1 ? Math.min(54, (width - 28 - cardW) / (n - 1)) : 0
  const spread = Math.min(5, 34 / Math.max(1, n))
  const sel = picked !== null ? cards.find((o) => o.uid === picked) : undefined
  const selActs = sel ? actionsFor(sel.uid) : []
  return (
    <div className="fan" aria-label="La tua mano">
      <AnimatePresence>
        {sel && (
          <motion.div key="fan-acts" className="fan-actions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {selActs.map((a) => (
              <button key={a.id} type="button" className="btn btn-primary btn-small" onClick={() => run(a)}>
                {a.label.replace(` ${sel.card.name}`, '')}
              </button>
            ))}
            <button type="button" className="btn btn-small" onClick={() => onDetails(sel.uid)}>
              Dettagli
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {sel && <button type="button" className="fan-scrim" aria-label="Rimetti la carta" onClick={() => setPicked(null)} />}
      <AnimatePresence initial={false}>
        {cards.map((o, i) => {
          const c = i - (n - 1) / 2
          const up = o.uid === picked
          return (
            <motion.button
              key={o.uid}
              type="button"
              className={`fan-card${actionsFor(o.uid).length ? ' is-actionable' : ''}${up ? ' fan-up' : ''}`}
              style={{ zIndex: up ? 50 : i + 1 }}
              onClick={() => setPicked(up ? null : o.uid)}
              initial={{ opacity: 0, y: 160, x: 120, rotate: 20 }}
              animate={up ? { opacity: 1, x: 0, y: -150, rotate: 0, scale: 1.9 } : { opacity: 1, x: c * step, y: Math.abs(c) * Math.abs(c) * 1.4, rotate: c * spread, scale: 1 }}
              exit={{ opacity: 0, y: -260, scale: 1.3 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            >
              <img src={cardImage(o.card)} alt={o.card.name} />
            </motion.button>
          )
        })}
      </AnimatePresence>
      {!n && <span className="tiny board-empty fan-empty">Mano vuota</span>}
    </div>
  )
}

/** Mano dell'avversario: solo il dorso delle carte (128.4). */
function OppHand({ n }: { n: number }) {
  return (
    <div className="opp-hand" aria-label={`Il PC ha ${n} carte in mano`}>
      {Array.from({ length: n }, (_, i) => {
        const c = i - (n - 1) / 2
        return <motion.span key={i} className="card-back" initial={false} animate={{ x: c * 16, rotate: -c * 4, y: Math.abs(c) * Math.abs(c) * 0.8 }} />
      })}
    </div>
  )
}

function ChainBar({ g }: { g: Game }) {
  if (!g.chain.length) return null
  return (
    <div className="chain-bar">
      <span className="tiny">Catena</span>
      {g.chain.map((c, i) => (
        <motion.span key={c.id} className={`chain-item chain-${c.controller === ME ? 'me' : 'opp'}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          {c.label}
          {i === g.chain.length - 1 && <em> · si risolve per prima</em>}
        </motion.span>
      ))}
    </div>
  )
}

/** Cosa sta succedendo: la richiesta del momento e l'ultima riga della cronaca. */
function Banner({ g, d, mine, onLog }: { g: Game; d: Decision | null; mine: boolean; onLog: () => void }) {
  let title = ''
  if (g.winner !== null) title = 'Partita finita'
  else if (d && !mine) title = 'Il PC sta giocando…'
  else if (d?.type === 'act')
    title =
      d.context === 'main'
        ? 'Tocca a te'
        : d.context === 'chain'
          ? `Rispondi a ${g.chain[g.chain.length - 1]?.label ?? ''}? Solo Reaction`
          : `${g.showdown?.combat ? 'Combattimento' : 'Showdown'}: hai il focus (Action o Reaction)`
  else if (d) title = 'Fai la tua scelta'
  const last = g.log[g.log.length - 1]
  return (
    <button type="button" className={`banner${mine ? ' banner-mine' : ''}`} onClick={onLog}>
      <strong>
        <small>T{g.turn}</small> {title}
      </strong>
      <AnimatePresence mode="popLayout" initial={false}>
        {last && (
          <motion.span key={g.log.length} className="tiny" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {last.text}
            {last.rule && ` · ${last.rule}`}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

/** Il pulsante grande in basso a destra, come nei giochi di carte digitali. */
function EndButton({ action, onClick, waiting }: { action?: ActionOpt; onClick: () => void; waiting: boolean }) {
  return (
    <motion.button
      type="button"
      className={`end-btn${action ? ' end-on' : ''}`}
      disabled={!action}
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      animate={action ? { boxShadow: ['0 0 0 0 rgb(255 62 165 / 0.7)', '0 0 0 12px rgb(255 62 165 / 0)'] } : {}}
      transition={{ duration: 1.4, repeat: action ? Infinity : 0 }}
    >
      {waiting ? (
        <span className="thinking" aria-label="Il PC sta giocando">
          <i />
          <i />
          <i />
        </span>
      ) : (
        (action?.label ?? '—')
      )}
    </motion.button>
  )
}

function ChoosePanel({ g, d, answer }: { g: Game; d: Extract<Decision, { type: 'choose' }>; answer: (a: number[] | null) => void }) {
  const [sel, setSel] = useState<number[]>([])
  const single = d.max === 1 && d.min === 1
  useEffect(() => setSel([]), [d])
  const toggle = (i: number) => {
    if (single) return answer([i])
    setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : s.length < d.max ? [...s, i] : s))
  }
  return (
    <motion.div className="decide decide-choose" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <div className="decide-head">
        <strong>{d.title}</strong>
        {d.rule && <span className="tiny">Regola {d.rule}</span>}
      </div>
      <div className="options">
        {d.options.map((o, i) => {
          const obj = o.uid != null ? g.objs.get(o.uid) : undefined
          return (
            <button key={i} type="button" className={`option${sel.includes(i) ? ' option-on' : ''}`} onClick={() => toggle(i)}>
              {obj && !obj.token && <img src={cardImage(obj.card)} alt="" />}
              <span>
                <strong>{o.label}</strong>
                {o.detail && <span className="tiny">{o.detail}</span>}
              </span>
            </button>
          )
        })}
      </div>
      <div className="decide-row">
        {d.cancel && (
          <button type="button" className="btn" onClick={() => answer(null)}>
            Annulla
          </button>
        )}
        {!single && (
          <button type="button" className="btn btn-primary" disabled={sel.length < d.min} onClick={() => answer(sel)}>
            {sel.length ? `Conferma (${sel.length})` : d.min === 0 ? 'Nessuna' : 'Conferma'}
          </button>
        )}
      </div>
    </motion.div>
  )
}

function AssignPanel({ g, d, answer }: { g: Game; d: Extract<Decision, { type: 'assign' }>; answer: (a: Record<string, number>) => void }) {
  const [assign, setAssign] = useState<Record<string, number>>({})
  const used = Object.values(assign).reduce((a, b) => a + b, 0)
  const issues = useMemo(() => (used === d.total ? checkAssignment(d.total, d.targets, d.role, assign) : []), [assign, used, d])
  const change = (u: CombatUnit, n: number) => setAssign((a) => ({ ...a, [u.uid]: Math.max(0, Math.min((a[u.uid] ?? 0) + n, (a[u.uid] ?? 0) + d.total - used)) }))
  return (
    <motion.div className="decide decide-choose" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <div className="decide-head">
        <strong>
          Assegna {d.total} danni ({d.total - used} da assegnare)
        </strong>
        <span className="tiny">Tank per primi, danni letali per intero prima di passare all’unità successiva (467.2.c).</span>
      </div>
      <div className="assign">
        {d.targets.map((u) => {
          const o = g.objs.get(Number(u.uid))
          const lethal = lethalFor(u, d.role)
          const a = assign[u.uid] ?? 0
          return (
            <div key={u.uid} className={`assign-row${a >= lethal ? ' assign-lethal' : ''}`}>
              {o && !o.token && <img src={cardImage(o.card)} alt="" />}
              <span>
                <strong>{u.card.name}</strong>
                <span className="tiny">
                  letali: {lethal}
                  {u.tank ? ' · Tank' : ''}
                </span>
              </span>
              <span className="assign-step">
                <button type="button" onClick={() => change(u, -1)} disabled={!a}>
                  −
                </button>
                <b>{a}</b>
                <button type="button" onClick={() => change(u, 1)} disabled={used >= d.total}>
                  +
                </button>
              </span>
            </div>
          )
        })}
      </div>
      {issues.map((i) => (
        <p key={i.rule} className="assign-issue">
          {i.text} <small>({i.rule})</small>
        </p>
      ))}
      <button type="button" className="btn btn-primary decide-end" disabled={used !== d.total || issues.length > 0} onClick={() => answer(assign)}>
        Conferma i danni
      </button>
    </motion.div>
  )
}

// ---------------------------------------------------------------- fogli

function SheetFrame({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div className="sheet-root" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" className="sheet-scrim" aria-label="Chiudi" onClick={onClose} />
      <motion.div className="sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 360, damping: 34 }}>
        <span className="sheet-grip" aria-hidden />
        {children}
      </motion.div>
    </motion.div>
  )
}

function ObjSheet({ g, uid, actions, run }: { g: Game; uid: number; actions: ActionOpt[]; run: (a: ActionOpt) => void }) {
  const location = useLocation()
  const o = g.objs.get(uid)
  if (!o) return <p className="sheet-body muted">Questa carta non è più qui.</p>
  const hiddenFromMe = o.controller !== ME && (o.zone === 'facedown' || o.zone === 'hand')
  if (hiddenFromMe) return <p className="sheet-body muted">Carta coperta del PC.</p>
  const onBoard = o.zone === 'board' && /Unit/.test(o.card.type)
  const k = onBoard ? kw(g, o) : null
  const state = [
    o.exhausted && 'esausta',
    o.stunned && 'stordita',
    o.empowered && 'Empowered',
    o.damage > 0 && `${o.damage} danni`,
    o.prevent > 0 && `previene ${o.prevent}`,
    o.role === 'attacker' && 'attaccante',
    o.role === 'defender' && 'difensore',
  ].filter(Boolean)
  return (
    <div className="sheet-body obj-sheet">
      {o.token ? <span className="token-face token-big">{o.card.name}</span> : <img className="obj-img" src={cardImage(o.card)} alt={o.card.name} />}
      <div className="obj-info">
        <h2>{o.card.name}</h2>
        {onBoard && (
          <p className="obj-might">
            Might attuale <strong>{might(g, o)}</strong>
            {k && (k.assault || k.shield || k.tank || k.ganking || k.deflect) ? (
              <span className="tiny">
                {' '}
                · {[k.assault && `Assault ${k.assault}`, k.shield && `Shield ${k.shield}`, k.tank && 'Tank', k.ganking && 'Ganking', k.deflect && `Deflect ${k.deflect}`].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </p>
        )}
        {state.length > 0 && <p className="tiny">{state.join(' · ')}</p>}
        {o.mods.length > 0 && <p className="tiny">In questo turno: {o.mods.map((m) => m.source).join(', ')}</p>}
        {o.card.text && (
          <div className="obj-text">
            <CardText html={o.card.text} />
          </div>
        )}
        {actions.length > 0 && (
          <div className="obj-actions">
            {actions.map((a) => (
              <button key={a.id} type="button" className="btn btn-primary" onClick={() => run(a)}>
                {a.label}
              </button>
            ))}
          </div>
        )}
        {!o.token && (
          <Link to={`/carta/${o.card.id}`} state={{ background: location }} className="link-more">
            Scheda completa →
          </Link>
        )}
      </div>
    </div>
  )
}

function LogSheet({ g, onRule }: { g: Game; onRule: (n: string) => void }) {
  const ref = useRef<HTMLOListElement>(null)
  useEffect(() => {
    ref.current?.lastElementChild?.scrollIntoView({ block: 'end' })
  }, [])
  return (
    <div className="sheet-body">
      <h2>Cronaca della partita</h2>
      <p className="tiny muted">Tocca il numero di una regola per leggerla nel Core Rules.</p>
      <ol className="log" ref={ref}>
        {g.log.map((l, i) => (
          <li key={i} className={l.player === ME ? 'log-me' : l.player === OPP ? 'log-opp' : ''}>
            <span className="log-turn">T{l.turn}</span>
            <span>{l.text}</span>
            {l.rule && (
              <button type="button" className="log-rule" onClick={() => onRule(l.rule!)}>
                {l.rule}
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

function TrashSheet({ g, p, onObj }: { g: Game; p: PID; onObj: (uid: number) => void }) {
  const pl = g.players[p]
  const list = [...pl.trash].reverse().map((u) => g.objs.get(u)!)
  const ban = pl.banish.map((u) => g.objs.get(u)!)
  return (
    <div className="sheet-body">
      <h2>Trash {p === ME ? 'tuo' : 'del PC'}</h2>
      <div className="pile">
        {list.map((o) => (
          <button key={o.uid} type="button" onClick={() => onObj(o.uid)}>
            <img src={cardImage(o.card)} alt={o.card.name} />
          </button>
        ))}
        {!list.length && <p className="muted">Vuoto.</p>}
      </div>
      {ban.length > 0 && (
        <>
          <h3>Esiliate</h3>
          <p className="tiny muted">{ban.map((o) => o.card.name).join(' · ')}</p>
        </>
      )}
    </div>
  )
}

function GameOver({ g, onReview }: { g: Game; onReview: () => void }) {
  const db = useDb()
  const navigate = useNavigate()
  const start = useGame((s) => s.start)
  const chosen = useGame((s) => s.decks)
  const decks = useVault((s) => s.decks)
  const won = g.winner === ME
  function rematch() {
    const find = (id: string) => decks.find((d) => d.id === id)
    const a = chosen && find(chosen.mine)
    const b = chosen && find(chosen.pc)
    if (!a || !b || !chosen) return navigate('/playground/partita')
    const m = new Match([deckToSpec(a, db), deckToSpec(b, db)], ['Giocatore', 'PC'], 0)
    m.next()
    start(m, chosen)
  }
  const canRematch = !!chosen && decks.some((d) => d.id === chosen.mine) && decks.some((d) => d.id === chosen.pc)
  return (
    <motion.div className="gameover" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className={`gameover-card ${won ? 'won' : 'lost'}`} initial={{ scale: 0.7, y: 40 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
        <span className="tiny">Turno {g.turn}</span>
        <h2>{won ? 'Hai vinto!' : 'Ha vinto il PC'}</h2>
        <p>
          {g.players[ME].points} – {g.players[OPP].points}
        </p>
        <div className="decide-row">
          {canRematch && (
            <button type="button" className="btn btn-primary" onClick={rematch}>
              Rivincita
            </button>
          )}
          <Link to="/playground/partita" className="btn">
            Cambia mazzi
          </Link>
        </div>
        <button type="button" className="link-more" onClick={onReview}>
          Rivedi il tavolo e la cronaca
        </button>
      </motion.div>
    </motion.div>
  )
}


