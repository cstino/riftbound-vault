import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { asset, cardImage } from '../lib/data'
import { useDb } from '../lib/useDb'
import { useGame } from '../lib/gameStore'
import { Match, deckToSpec } from '../lib/game'
import { bfName, friendlyAt, kw, might, unitsAt } from '../lib/game/engine'
import { checkAssignment, lethalFor, type CombatUnit } from '../lib/combat'
import type { ActionOpt, Decision, Game, LocId, Obj, PID } from '../lib/game/types'
import { RuleQuote } from '../components/Explainer'
import { DomainIcon } from '../components/Icons'
import { CardText } from '../components/CardText'
import { Summon, isBigPlay } from '../components/Summon'
import { TokenCard } from '../components/TokenCard'
import { useVault } from '../lib/store'
import './game.css'

/** Da che parte del tavolo si guarda: il giocatore di questo dispositivo e come chiamare l'avversario. */
export interface Seat {
  me: PID
  /** "il PC" oppure il nome dell'avversario online. */
  name: string
  /** Nome corto per le etichette: "PC" o il nome. */
  short: string
  /** "del PC" oppure "di Marco". */
  of: string
}
export const PC_SEAT: Seat = { me: 0, name: 'il PC', short: 'PC', of: 'del PC' }
const SeatContext = createContext<Seat>(PC_SEAT)
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
/** Tavolo da computer: schermo largo e abbastanza alto (stessa condizione di game.css). */
const WIDE = '(min-width: 1100px) and (min-height: 640px)'
/** Larghezza della colonna laterale con la cronaca (game.css, --side-w). */
const SIDE_W = 340
/** Larghezza della barra delle azioni a sinistra della mano (game.css, --bar-w). */
const BAR_W = 300
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches)
  useEffect(() => {
    const mq = window.matchMedia(WIDE)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

/** ME e OPP dal punto di vista di chi guarda. */
function useSeat() {
  const seat = useContext(SeatContext)
  return { ...seat, ME: seat.me, OPP: (seat.me === 0 ? 1 : 0) as PID }
}

export function GameBoard() {
  const match = useGame((s) => s.match)
  const version = useGame((s) => s.version)
  const bump = useGame((s) => s.bump)
  useAiRunner(match, version, bump)
  if (!match) return <Navigate to="/playground/partita" replace />
  return (
    <Board
      match={match}
      version={version}
      seat={PC_SEAT}
      exitTo="/playground/partita"
      onAnswer={(a) => {
        match.next(a)
        bump()
      }}
      renderOver={(g, onReview) => <GameOver g={g} onReview={onReview} />}
    />
  )
}

/** Fa giocare il PC un passo alla volta, con una pausa sulle azioni perché si possano seguire. */
function useAiRunner(match: Match | null, version: number, bump: () => void) {
  useEffect(() => {
    const d = match?.pending
    if (!match || !d || match.isHuman(d)) return
    // dopo una carta giocata dal PC si aspetta di più, per lasciarla vedere (Spotlight)
    const last = match.g.log[match.g.log.length - 1]
    // dopo un'evocazione si aspetta che finisca (Summon, circa 2,9 s)
    const big = !!last?.card && last.played != null && isBigPlay(last.card)
    const delay = big ? 3000 : last?.player === 1 && last.card ? 1700 : d.type === 'act' ? 650 : 280
    const t = setTimeout(() => {
      match.next(match.aiAnswer(d))
      bump()
    }, delay)
    return () => clearTimeout(t)
  }, [match, version, bump])
}

type Sheet = { kind: 'obj'; uid: number } | { kind: 'bf'; loc: LocId } | { kind: 'acts' } | { kind: 'log' } | { kind: 'trash'; p: PID } | { kind: 'rule'; n: string } | null

export interface BoardProps {
  match: Match
  version: number
  seat: Seat
  exitTo: string
  onAnswer: (a: Parameters<Match['next']>[0]) => void
  renderOver: (g: Game, onReview: () => void) => ReactNode
  /** Riga in più sopra il tavolo (stato della connessione nelle partite online). */
  notice?: ReactNode
}

export function Board(props: BoardProps) {
  return (
    <SeatContext.Provider value={props.seat}>
      <BoardInner {...props} />
    </SeatContext.Provider>
  )
}

function BoardInner({ match, version, exitTo, onAnswer, renderOver, notice }: BoardProps) {
  const { ME, OPP } = useSeat()
  const g = match.g
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
    setSheet(null)
    onAnswer(a)
  }

  const actions = mine && d?.type === 'act' ? d.actions : []
  const actionsFor = (uid: number) => actions.filter((a) => a.uid === uid)
  const end = actions.find((a) => a.kind === 'end' || a.kind === 'pass')
  const move = actions.find((a) => a.kind === 'move')
  const modal = mine && d && d.type !== 'act' && g.winner === null ? d : null
  const openObj = (uid: number) => setSheet({ kind: 'obj', uid })

  return (
    <div className="table" style={{ '--back-main': `url(${new URL(asset('backs/main.webp'), window.location.href).href})` } as React.CSSProperties}>
      <div className="table-corner">
        <Link to={exitTo} className="corner-btn" aria-label="Esci dalla partita">
          ✕
        </Link>
        {notice}
        <button type="button" className="corner-btn corner-log" onClick={() => setSheet({ kind: 'log' })}>
          Cronaca
        </button>
      </div>
      <OppHand n={g.players[OPP].hand.length} />
      <PlayerStrip g={g} p={OPP} onTrash={() => setSheet({ kind: 'trash', p: OPP })} onObj={openObj} actionsFor={actionsFor} />
      <BaseRow g={g} p={OPP} onObj={openObj} actionsFor={actionsFor} />
      <div className="bfs">
        {g.bfs.map((b) => (
          <BattlefieldTile key={b.loc} g={g} loc={b.loc} onObj={openObj} onBf={() => setSheet({ kind: 'bf', loc: b.loc })} actionsFor={actionsFor} />
        ))}
      </div>
      <BaseRow g={g} p={ME} onObj={openObj} actionsFor={actionsFor} />
      <PlayerStrip g={g} p={ME} onTrash={() => setSheet({ kind: 'trash', p: ME })} onObj={openObj} actionsFor={actionsFor} />
      <div className="controls">
        <div className="actionbar">
          <EndButton action={end} onClick={() => end && answer(end.id)} waiting={!!d && !mine && g.winner === null} />
          {(move || actions.length > 1) && (
            <div className="actionbar-pills">
              {move && (
                <motion.button type="button" className="act-pill act-pill-move" onClick={() => answer(move.id)} whileTap={{ scale: 0.94 }} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}>
                  <PillIcon kind="move" />
                  Muovi
                </motion.button>
              )}
              {actions.length > 1 && (
                <motion.button type="button" className="act-pill" onClick={() => setSheet({ kind: 'acts' })} whileTap={{ scale: 0.94 }} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}>
                  <PillIcon kind="acts" />
                  Azioni
                  <span className="act-pill-count">{actions.length - 1}</span>
                </motion.button>
              )}
            </div>
          )}
        </div>
        <Banner g={g} d={d} mine={mine} onLog={() => setSheet({ kind: 'log' })} />
      </div>
      <aside className="table-side" aria-label="Cronaca della partita">
        <h2>Cronaca</h2>
        <LiveLog g={g} onRule={(n) => setSheet({ kind: 'rule', n })} />
      </aside>
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
            {sheet.kind === 'bf' && <BfSheet g={g} loc={sheet.loc} />}
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
      <Summon g={g} />
      {g.winner !== null && !reviewing && renderOver(g, () => setReviewing(true))}
    </div>
  )
}

/** Mostra in grande ogni carta che il PC gioca o usa, come nei giochi di carte digitali. */
function Spotlight({ g }: { g: Game }) {
  const { OPP } = useSeat()
  const seen = useRef(g.log.length)
  const [shown, setShown] = useState<{ key: number; entry: Game['log'][number] } | null>(null)
  const n = g.log.length
  useEffect(() => {
    const fresh = g.log.slice(seen.current).map((entry, i) => ({ key: seen.current + i, entry }))
    seen.current = g.log.length
    // le carte importanti hanno già l'evocazione (Summon)
    const hit = fresh.filter((x) => x.entry.player === OPP && x.entry.card && !x.entry.card.id.startsWith('token') && !(x.entry.played != null && isBigPlay(x.entry.card))).pop()
    if (hit) setShown(hit)
  }, [n, g])
  // il timer dipende solo dalla carta mostrata: nuove righe della cronaca non lo annullano
  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(null), 2600)
    return () => clearTimeout(t)
  }, [shown])
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
          <small>Tocca per chiudere</small>
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

/** Riquadro a forma di carta per le zone del giocatore (Legend, Campione, Mazzo, Trash). */
function Tile({ label, onClick, actionable, dim, glow, children }: { label: string; onClick?: () => void; actionable?: boolean; dim?: boolean; glow?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" className={`tile${actionable ? ' is-actionable' : ''}${dim ? ' tile-dim' : ''}${glow ? ' tile-glow' : ''}`} onClick={onClick} disabled={!onClick}>
      <span className="tile-card">{children}</span>
      <span className="tile-label">{label}</span>
    </button>
  )
}

function PlayerStrip({ g, p, onTrash, onObj, actionsFor }: { g: Game; p: PID; onTrash: () => void; onObj: (uid: number) => void; actionsFor: (uid: number) => ActionOpt[] }) {
  const { ME, short: themShort } = useSeat()
  const pl = g.players[p]
  const legend = g.objs.get(pl.legend)!
  const runes = pl.runes.map((u) => g.objs.get(u)!)
  const champ = pl.champion !== null ? g.objs.get(pl.champion) : undefined
  const top = pl.trash.length ? g.objs.get(pl.trash[pl.trash.length - 1]) : undefined
  return (
    <div className={`mat mat-${p === ME ? 'me' : 'opp'}${g.turnPlayer === p ? ' mat-turn' : ''}`}>
      <Tile label="Legend" onClick={() => onObj(legend.uid)} actionable={actionsFor(legend.uid).length > 0} dim={legend.exhausted} glow={legend.empowered}>
        <img src={cardImage(legend.card)} alt={legend.card.name} />
      </Tile>
      <Tile label="Campione" onClick={champ ? () => onObj(champ.uid) : undefined} actionable={!!champ && actionsFor(champ.uid).length > 0}>
        {champ ? <img src={cardImage(champ.card)} alt={champ.card.name} /> : <span className="tile-empty">in gioco</span>}
      </Tile>
      <div className="mat-mid">
        <div className="mat-line">
          <strong>{p === ME ? 'Tu' : themShort}</strong>
          <span className="tiny strip-deck">{pl.deckName}</span>
          {pl.xp > 0 && (
            <span className="tiny strip-xp" title="XP (728)">
              {pl.xp} XP
            </span>
          )}
        </div>
        <Pips n={pl.points} max={g.victory} />
        <span className="runes" aria-label="Rune">
          <span className="rune-deck" title="Rune ancora nel mazzo delle rune" style={{ backgroundImage: `url(${asset('backs/rune.webp')})` }}>
            {pl.runeDeck.length}
          </span>
          {runes.map((r) => (
            <span
              key={r.uid}
              className={`rune${r.exhausted ? ' rune-off' : ''}`}
              style={{ ['--dc' as string]: `var(--${r.card.domains[0].toLowerCase()})` }}
              title={`${r.card.name}${r.exhausted ? ' (esausta)' : ''}`}
            >
              <DomainIcon domain={r.card.domains[0]} size={12} />
            </span>
          ))}
          {pl.pool.energy > 0 && <span className="pool">+{pl.pool.energy}</span>}
          {(pl.pool.any ?? 0) > 0 && (
            <span className="pool" title="Power di qualsiasi dominio in riserva">
              +{pl.pool.any} Power
            </span>
          )}
        </span>
      </div>
      <Tile label={`Mazzo ${pl.deck.length}`}>
        <span className="card-back tile-back" />
      </Tile>
      <Tile label={`Trash ${pl.trash.length}`} onClick={onTrash}>
        {top ? <img src={cardImage(top.card)} alt={top.card.name} /> : <span className="tile-empty">vuoto</span>}
      </Tile>
    </div>
  )
}

function UnitChip({ g, o, onObj, actionable }: { g: Game; o: Obj; onObj: (uid: number) => void; actionable?: boolean }) {
  const db = useDb()
  const { ME } = useSeat()
  const m = might(g, o)
  const k = kw(g, o)
  const base = o.card.might ?? 0
  return (
    <motion.button
      layout
      layoutId={`obj-${o.card.id}-${o.uid}`}
      data-uid={o.uid}
      type="button"
      className={`unit-chip${o.exhausted ? ' is-exhausted' : ''}${o.empowered ? ' is-empowered' : ''}${o.controller === ME ? ' is-mine' : ' is-theirs'}${actionable ? ' is-actionable' : ''}`}
      onClick={() => onObj(o.uid)}
      initial={{ opacity: 0, scale: 0.6, y: o.controller === ME ? 30 : -30 }}
      animate={{ opacity: 1, scale: 1, y: 0, rotate: o.exhausted ? 8 : 0 }}
      exit={{ opacity: 0, scale: 0.4 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
    >
      {o.token ? <TokenCard card={o.card} db={db} /> : <img src={cardImage(o.card)} alt={o.card.name} loading="lazy" />}
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
  const { ME, of: themOf } = useSeat()
  const loc: LocId = p === 0 ? 'base0' : 'base1'
  const list = [...g.objs.values()].filter((o) => o.zone === 'board' && o.loc === loc)
  return (
    <div className={`base base-${p === ME ? 'me' : 'opp'}`}>
      <span className="base-label">{p === ME ? 'La tua base' : `Base ${themOf}`}</span>
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

function BattlefieldTile({ g, loc, onObj, onBf, actionsFor }: { g: Game; loc: LocId; onObj: (uid: number) => void; onBf: () => void; actionsFor: (uid: number) => ActionOpt[] }) {
  const { ME, OPP, of: themOf } = useSeat()
  const bf = g.bfs.find((b) => b.loc === loc)!
  const sd = g.showdown?.loc === loc ? g.showdown : null
  const them = friendlyAt(g, OPP, loc)
  const us = friendlyAt(g, ME, loc)
  const gear = [...g.objs.values()].filter((o) => o.zone === 'board' && o.loc === loc && !/Unit/.test(o.card.type))
  const faces = bf.facedown.map((u) => g.objs.get(u)!)
  const owner = bf.controller === ME ? 'me' : bf.controller === OPP ? 'opp' : 'none'
  return (
    <div className={`bf bf-${owner}${sd ? ' bf-live' : ''}`}>
      <img className="bf-art" src={cardImage(bf.card)} alt="" />
      <button type="button" className="bf-head" onClick={onBf}>
        <strong>{bfName(g, loc)}</strong>
        <span className="tiny">{bf.controller === null ? 'libero' : bf.controller === ME ? 'tuo' : themOf} · dettagli</span>
      </button>
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
      {(faces.length > 0 || gear.length > 0) && (
        <div className="bf-extra tiny">
          {faces.map((face) => (
            <button key={face.uid} type="button" className={`facedown${actionsFor(face.uid).length ? ' is-actionable' : ''}`} onClick={() => (face.controller === ME ? onObj(face.uid) : undefined)}>
              <span className="card-back facedown-back" aria-hidden />
              {face.controller === ME ? `Nascosta: ${face.card.name}` : `Carta nascosta ${themOf}`}
            </button>
          ))}
          {gear.map((o) => (
            <button key={o.uid} type="button" data-uid={o.uid} onClick={() => onObj(o.uid)}>
              {o.card.name}
            </button>
          ))}
        </div>
      )}
      {unitsAt(g, loc).length === 0 && !faces.length && <span className="bf-empty tiny">nessuna unità</span>}
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
  const { ME } = useSeat()
  const cards = g.players[ME].hand.map((u) => g.objs.get(u)!)
  const wide = useWide()
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const on = () => setWidth(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const n = cards.length
  // sul computer la mano sta nella colonna del tavolo, a sinistra della cronaca
  const room = wide ? Math.min(width - SIDE_W - BAR_W - 80, 1100) : Math.min(width, 760)
  const cardW = wide ? Math.min(128, Math.max(80, window.innerHeight * 0.12)) : 76
  const step = n > 1 ? Math.min(wide ? 90 : 54, (room - 28 - cardW) / (n - 1)) : 0
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
              onClick={() => onDetails(o.uid)}
              initial={{ opacity: 0, y: 160, x: 120, rotate: 20 }}
              animate={up ? { opacity: 1, x: 0, y: wide ? -230 : -150, rotate: 0, scale: wide ? 2.1 : 1.9 } : { opacity: 1, x: c * step, y: Math.abs(c) * Math.abs(c) * 1.4, rotate: c * spread, scale: 1 }}
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
  const { name: them } = useSeat()
  return (
    <div className="opp-hand" aria-label={`${cap(them)} ha ${n} carte in mano`}>
      {Array.from({ length: n }, (_, i) => {
        const c = i - (n - 1) / 2
        return <motion.span key={i} className="card-back" initial={false} animate={{ x: c * 16, rotate: -c * 4, y: Math.abs(c) * Math.abs(c) * 0.8 }} />
      })}
    </div>
  )
}

function ChainBar({ g }: { g: Game }) {
  const { ME } = useSeat()
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
  const { name: them } = useSeat()
  let title = ''
  if (g.winner !== null) title = 'Partita finita'
  else if (d && !mine) title = `${cap(them)} sta giocando…`
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

/** Il pulsante grande della barra delle azioni: anello luminoso che gira quando tocca a te. */
function EndButton({ action, onClick, waiting }: { action?: ActionOpt; onClick: () => void; waiting: boolean }) {
  const { name: them } = useSeat()
  return (
    <motion.button type="button" className={`end-btn${action ? ' end-on' : ''}${waiting ? ' end-wait' : ''}`} disabled={!action} onClick={onClick} whileTap={{ scale: 0.92 }} whileHover={action ? { scale: 1.05 } : undefined}>
      <span className="end-ring" aria-hidden />
      <span className="end-core">
        {waiting ? (
          <span className="thinking" aria-label={`${cap(them)} sta giocando`}>
            <i />
            <i />
            <i />
          </span>
        ) : (
          (action?.label ?? '—')
        )}
      </span>
    </motion.button>
  )
}

function PillIcon({ kind }: { kind: 'move' | 'acts' }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'move' ? <path d="M4 12h13M13 6l6 6-6 6" /> : <path d="M12 3l2.2 5.3L20 9l-4.3 3.8L17 19l-5-3-5 3 1.3-6.2L4 9l5.8-.7z" />}
    </svg>
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
  const db = useDb()
  const { ME, of: themOf } = useSeat()
  const location = useLocation()
  const o = g.objs.get(uid)
  if (!o) return <p className="sheet-body muted">Questa carta non è più qui.</p>
  const hiddenFromMe = o.controller !== ME && (o.zone === 'facedown' || o.zone === 'hand')
  if (hiddenFromMe) return <p className="sheet-body muted">Carta coperta {themOf}.</p>
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
      {o.token ? <TokenCard card={o.card} db={db} big /> : <img className="obj-img" src={cardImage(o.card)} alt={o.card.name} />}
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
                {a.label.replace(` ${o.card.name}`, '')}
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

function BfSheet({ g, loc }: { g: Game; loc: LocId }) {
  const { ME, name: them, short: themShort } = useSeat()
  const location = useLocation()
  const bf = g.bfs.find((b) => b.loc === loc)!
  const units = unitsAt(g, loc)
  const who = (p: PID | null) => (p === null ? 'nessuno' : p === ME ? 'tu' : them)
  return (
    <div className="sheet-body bf-sheet">
      <img className="bf-sheet-img" src={cardImage(bf.card)} alt={bf.card.name} />
      <h2>{bf.card.name}</h2>
      <p className="tiny">
        Portato da {bf.owner === ME ? 'te' : them} · controllato da {who(bf.controller)}
        {g.showdown?.loc === loc ? ` · ${g.showdown.combat ? 'combattimento' : 'showdown'} in corso` : ''}
      </p>
      {bf.card.text && (
        <div className="obj-text">
          <CardText html={bf.card.text} />
        </div>
      )}
      <p className="tiny">
        Unità qui: {units.length ? units.map((u) => `${u.card.name} (${u.controller === ME ? 'tua' : themShort}, ${might(g, u)})`).join(' · ') : 'nessuna'}
      </p>
      <p className="tiny muted">
        Chi controlla un campo all’inizio del proprio turno lo tiene e guadagna 1 punto (471.2); chi ne prende il controllo lo conquista e guadagna 1 punto (471.1).
      </p>
      <Link to={`/carta/${bf.card.id}`} state={{ background: location }} className="link-more">
        Scheda completa →
      </Link>
    </div>
  )
}

/** Cronaca nella colonna laterale del computer: le ultime righe, sempre in fondo. */
function LiveLog({ g, onRule }: { g: Game; onRule: (n: string) => void }) {
  const { ME, OPP } = useSeat()
  const ref = useRef<HTMLOListElement>(null)
  const n = g.log.length
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [n])
  return (
    <ol className="log live-log" ref={ref}>
      {g.log.slice(-80).map((l, i) => (
        <li key={n - 80 + i} className={l.player === ME ? 'log-me' : l.player === OPP ? 'log-opp' : ''}>
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
  )
}

function LogSheet({ g, onRule }: { g: Game; onRule: (n: string) => void }) {
  const { ME, OPP } = useSeat()
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
  const { ME, of: themOf } = useSeat()
  const pl = g.players[p]
  const list = [...pl.trash].reverse().map((u) => g.objs.get(u)!)
  const ban = pl.banish.map((u) => g.objs.get(u)!)
  return (
    <div className="sheet-body">
      <h2>Trash {p === ME ? 'tuo' : themOf}</h2>
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
  const { ME, OPP } = useSeat()
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
    const m = new Match([deckToSpec(a, db), deckToSpec(b, db)], ['Giocatore', 'PC'], 0, undefined, chosen.bf === null ? [null, null] : [chosen.bf, null])
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


