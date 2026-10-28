import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
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
  if (!match) return <Navigate to="/impara/partita" replace />
  return <Board match={match} version={version} />
}

/** Fa giocare il PC un passo alla volta, con una pausa sulle azioni perché si possano seguire. */
function useAiRunner(match: Match | null, version: number, bump: () => void) {
  useEffect(() => {
    const d = match?.pending
    if (!match || !d || match.isHuman(d)) return
    const delay = d.type === 'act' ? 650 : 280
    const t = setTimeout(() => {
      match.next(match.aiAnswer(d))
      bump()
    }, delay)
    return () => clearTimeout(t)
  }, [match, version, bump])
}

type Sheet = { kind: 'obj'; uid: number } | { kind: 'log' } | { kind: 'trash'; p: PID } | { kind: 'rule'; n: string } | null

function Board({ match, version }: { match: Match; version: number }) {
  const g = match.g
  const bump = useGame((s) => s.bump)
  const d = match.pending
  const mine = !!d && match.isHuman(d)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [reviewing, setReviewing] = useState(false)
  useEffect(() => setReviewing(false), [g])
  void version
  useEffect(() => window.scrollTo(0, 0), [g])

  const answer = (a: Parameters<Match['next']>[0]) => {
    match.next(a)
    setSheet(null)
    bump()
  }

  const actions = mine && d?.type === 'act' ? d.actions : []
  const actionsFor = (uid: number) => actions.filter((a) => a.uid === uid)

  return (
    <div className="game">
      <TopBar g={g} onLog={() => setSheet({ kind: 'log' })} />
      <PlayerStrip g={g} p={OPP} onTrash={() => setSheet({ kind: 'trash', p: OPP })} onObj={(uid) => setSheet({ kind: 'obj', uid })} />
      <BaseRow g={g} p={OPP} onObj={(uid) => setSheet({ kind: 'obj', uid })} actionsFor={actionsFor} />
      <div className="bfs">
        {g.bfs.map((b) => (
          <BattlefieldTile key={b.loc} g={g} loc={b.loc} onObj={(uid) => setSheet({ kind: 'obj', uid })} actionsFor={actionsFor} />
        ))}
      </div>
      <BaseRow g={g} p={ME} onObj={(uid) => setSheet({ kind: 'obj', uid })} actionsFor={actionsFor} />
      <PlayerStrip g={g} p={ME} onTrash={() => setSheet({ kind: 'trash', p: ME })} onObj={(uid) => setSheet({ kind: 'obj', uid })} />
      <LogTicker g={g} onOpen={() => setSheet({ kind: 'log' })} />
      <Dock>
        <ChainBar g={g} />
        {!(mine && d?.type !== 'act') && <Hand g={g} actionsFor={actionsFor} onObj={(uid) => setSheet({ kind: 'obj', uid })} />}
        <DecisionPanel g={g} d={d} mine={mine} answer={answer} onObj={(uid) => setSheet({ kind: 'obj', uid })} />
      </Dock>

      <AnimatePresence>
        {sheet && (
          <SheetFrame key="sheet" onClose={() => setSheet(null)}>
            {sheet.kind === 'obj' && <ObjSheet g={g} uid={sheet.uid} actions={actionsFor(sheet.uid)} run={(a) => answer(a.id)} />}
            {sheet.kind === 'log' && <LogSheet g={g} onRule={(n) => setSheet({ kind: 'rule', n })} />}
            {sheet.kind === 'trash' && <TrashSheet g={g} p={sheet.p} onObj={(uid) => setSheet({ kind: 'obj', uid })} />}
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
      {g.winner !== null && !reviewing && <GameOver g={g} onReview={() => setReviewing(true)} />}
    </div>
  )
}

// ---------------------------------------------------------------- parti del tavolo

function TopBar({ g, onLog }: { g: Game; onLog: () => void }) {
  const phase: Record<Game['phase'], string> = {
    setup: 'Preparazione',
    awaken: 'Risveglio',
    beginning: 'Inizio',
    channel: 'Canalizzazione',
    draw: 'Pesca',
    main: 'Fase principale',
    ending: 'Fine turno',
    over: 'Partita finita',
  }
  return (
    <div className="game-top">
      <Link to="/impara/partita" className="link-more">
        ← Esci
      </Link>
      <span className="game-turn">
        Turno {g.turn} · {g.turnPlayer === ME ? 'tuo' : 'del PC'} · {g.showdown ? (g.showdown.combat ? 'Combattimento' : 'Showdown') : phase[g.phase]}
      </span>
      <button type="button" className="link-more" onClick={onLog}>
        Cronaca
      </button>
    </div>
  )
}

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

function PlayerStrip({ g, p, onTrash, onObj }: { g: Game; p: PID; onTrash: () => void; onObj: (uid: number) => void }) {
  const pl = g.players[p]
  const legend = g.objs.get(pl.legend)!
  const runes = pl.runes.map((u) => g.objs.get(u)!)
  const champ = pl.champion !== null ? g.objs.get(pl.champion) : undefined
  return (
    <div className={`strip strip-${p === ME ? 'me' : 'opp'}${g.turnPlayer === p ? ' strip-turn' : ''}`}>
      <button type="button" className={`strip-legend${legend.exhausted ? ' is-exhausted' : ''}${legend.empowered ? ' is-empowered' : ''}`} onClick={() => onObj(legend.uid)}>
        <img src={cardImage(legend.card)} alt={legend.card.name} />
      </button>
      <div className="strip-main">
        <div className="strip-line">
          <strong>{p === ME ? 'Tu' : 'PC'}</strong>
          <span className="tiny">{pl.deckName}</span>
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
            {p === OPP && <span>Mano {pl.hand.length}</span>}
            <span>Mazzo {pl.deck.length}</span>
            <button type="button" onClick={onTrash}>
              Trash {pl.trash.length}
            </button>
            {champ && (
              <button type="button" onClick={() => onObj(champ.uid)}>
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

function Hand({ g, actionsFor, onObj }: { g: Game; actionsFor: (uid: number) => ActionOpt[]; onObj: (uid: number) => void }) {
  const pl = g.players[ME]
  const cards = pl.hand.map((u) => g.objs.get(u)!)
  return (
    <div className="hand" aria-label="La tua mano">
      <AnimatePresence initial={false}>
        {cards.map((o, i) => (
          <motion.button
            key={o.uid}
            layout
            type="button"
            className={`hand-card${actionsFor(o.uid).length ? ' is-actionable' : ''}`}
            onClick={() => onObj(o.uid)}
            initial={{ opacity: 0, y: 60, rotate: 6 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -80, scale: 0.7 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26, delay: Math.min(i, 6) * 0.02 }}
          >
            <img src={cardImage(o.card)} alt={o.card.name} />
          </motion.button>
        ))}
      </AnimatePresence>
      {!cards.length && <span className="tiny board-empty">Mano vuota</span>}
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

function LogTicker({ g, onOpen }: { g: Game; onOpen: () => void }) {
  const last = g.log.slice(-2)
  return (
    <button type="button" className="ticker" onClick={onOpen}>
      <AnimatePresence initial={false} mode="popLayout">
        {last.map((l, i) => (
          <motion.span key={g.log.length - last.length + i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {l.text}
            {l.rule && <small> · {l.rule}</small>}
          </motion.span>
        ))}
      </AnimatePresence>
    </button>
  )
}

// ---------------------------------------------------------------- decisioni

function DecisionPanel({ g, d, mine, answer, onObj }: { g: Game; d: Decision | null; mine: boolean; answer: (a: Parameters<Match['next']>[0]) => void; onObj: (uid: number) => void }) {
  if (!d || g.winner !== null) return null
  if (!mine) {
    return (
      <div className="decide decide-wait">
        <span className="thinking" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        Il PC sta giocando…
      </div>
    )
  }
  if (d.type === 'act') return <ActPanel g={g} d={d} answer={answer} onObj={onObj} />
  if (d.type === 'choose') return <ChoosePanel g={g} d={d} answer={answer} />
  return <AssignPanel g={g} d={d} answer={answer} />
}

function ActPanel({ g, d, answer }: { g: Game; d: Extract<Decision, { type: 'act' }>; answer: (a: string) => void; onObj: (uid: number) => void }) {
  const end = d.actions.find((a) => a.kind === 'end' || a.kind === 'pass')!
  const others = d.actions.filter((a) => a !== end)
  const title =
    d.context === 'main'
      ? 'Tocca a te'
      : d.context === 'chain'
        ? `Vuoi rispondere a ${g.chain[g.chain.length - 1]?.label ?? ''}?`
        : `${g.showdown?.combat ? 'Combattimento' : 'Showdown'} a ${g.showdown ? bfName(g, g.showdown.loc) : ''}: hai il focus`
  const hint =
    d.context === 'main'
      ? 'Tocca una carta o un’unità che brilla, oppure scegli qui sotto.'
      : d.context === 'chain'
        ? 'Puoi giocare solo carte con Reaction (309.1.a).'
        : 'Puoi giocare carte con Action o Reaction (308.1.a). Se passate entrambi, lo showdown finisce.'
  return (
    <motion.div className="decide" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <div className="decide-head">
        <strong>{title}</strong>
        <span className="tiny">{hint}</span>
      </div>
      {others.length > 0 && (
        <div className="decide-actions">
          {others.map((a) => (
            <button key={a.id} type="button" className={`act act-${a.kind}`} onClick={() => answer(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="btn btn-primary decide-end" onClick={() => answer(end.id)}>
        {end.label}
      </button>
    </motion.div>
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
          <Link to={`/carta/${o.card.id}`} className="link-more">
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

/** Barra in basso con catena, mano e decisione; il tavolo lascia spazio per la sua altezza. */
function Dock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="dock" ref={ref}>
      {children}
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
    if (!a || !b || !chosen) return navigate('/impara/partita')
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
          <Link to="/impara/partita" className="btn">
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


