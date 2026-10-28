// Motore di partita 1v1 (Duel, 487) secondo il Core Rules (2026-10-09).
// Il flusso della partita è un generatore: ogni volta che un giocatore deve decidere, il motore
// restituisce una Decision e riprende con la risposta. Le regole applicate sono citate nel codice
// e nel registro della partita.
import type { Card, Domain } from '../types'
import { DOMAINS } from '../types'
import { autoAssign, checkAssignment, totalDamage, type CombatUnit, type Role } from '../combat'
import { implOf, type AbilityDef, type Cost, type Ctx, type Keywords, type TrigDef } from './registry'
import type {
  ActionOpt,
  Answer,
  Battlefield,
  ChoiceOpt,
  Decision,
  Game,
  Gen,
  LocId,
  Obj,
  PID,
  PlayerState,
  Zone,
} from './types'

// ---------------------------------------------------------------- utilità

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const other = (p: PID): PID => (p === 0 ? 1 : 0)
export const baseOf = (p: PID): LocId => (p === 0 ? 'base0' : 'base1')
export const isBf = (l: LocId | null): l is 'bf0' | 'bf1' => l === 'bf0' || l === 'bf1'
export const isUnit = (o: Obj) => /Unit/.test(o.card.type)
export const isGear = (o: Obj) => /Gear/.test(o.card.type)
export const isSpell = (o: Obj) => /Spell/.test(o.card.type)
export const get = (g: Game, uid: number) => g.objs.get(uid)
/** L'oggetto esiste ancora sulla board (un cambio di zona lo rende un oggetto nuovo, 359.3.e.4). */
export const alive = (g: Game, o: Obj) => g.objs.get(o.uid) === o && o.zone === 'board'
export const bfAt = (g: Game, loc: LocId) => g.bfs.find((b) => b.loc === loc) as Battlefield
export const board = (g: Game) => [...g.objs.values()].filter((o) => o.zone === 'board')
export const units = (g: Game) => board(g).filter(isUnit)
export const unitsAt = (g: Game, loc: LocId | null) => units(g).filter((o) => o.loc === loc)
export const friendlyAt = (g: Game, p: PID, loc: LocId | null) => unitsAt(g, loc).filter((o) => o.controller === p)
/** Nome di un campo; se i due campi hanno lo stesso nome si aggiunge chi l'ha portato. */
export function bfName(g: Game, loc: LocId): string {
  const bf = bfAt(g, loc)
  const twin = g.bfs.some((b) => b !== bf && b.card.name === bf.card.name)
  return twin ? `${bf.card.name} (di ${g.players[bf.owner].name})` : bf.card.name
}
const baseOwner = (loc: LocId): PID => (loc === 'base0' ? 0 : 1)
/** Nome di una posizione per le scelte del giocatore `viewer`. */
export const locName = (g: Game, loc: LocId | null, viewer?: PID) =>
  loc == null ? '—' : isBf(loc) ? bfName(g, loc) : viewer === baseOwner(loc) ? 'La tua base' : `Base di ${g.players[baseOwner(loc)].name}`
/** Posizione nel registro della partita, valido per entrambi i giocatori. */
export const inLoc = (g: Game, loc: LocId | null) =>
  loc == null ? '' : isBf(loc) ? `a ${bfName(g, loc)}` : `nella base di ${g.players[baseOwner(loc)].name}`

export function log(g: Game, text: string, rule?: string, player?: PID, card?: Card) {
  g.log.push({ turn: g.turn, text, rule, player, card })
}

const pname = (g: Game, p: PID) => g.players[p].name

function shuffle<T>(g: Game, a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(g.rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------------------------------------------------------------- creazione

export interface DeckSpec {
  name: string
  legend: Card
  champion: Card
  main: Card[]
  runes: Card[]
  battlefields: Card[]
}

const TOKEN_TYPE = 'Token Unit'

export function tokenCard(name: string, might: number, tags: string[], text: string): Card {
  return {
    id: `token-${name.toLowerCase().replace(/\s+/g, '-')}`,
    code: '',
    set: '',
    set_name: '',
    number: '',
    set_size: null,
    name,
    short_name: name,
    type: TOKEN_TYPE,
    rarity: null,
    domains: [],
    energy: null,
    power: null,
    might,
    tags,
    text,
    artist: null,
    alt_art: false,
    signature: false,
    image_url: '',
    image_file: '',
  }
}

function newObj(g: Game, card: Card, owner: PID, zone: Zone, token = false): Obj {
  const o: Obj = {
    uid: g.nextUid++,
    card,
    owner,
    controller: owner,
    zone,
    loc: null,
    token,
    exhausted: false,
    damage: 0,
    prevent: 0,
    stunned: false,
    empowered: false,
    attachedTo: null,
    mods: [],
    moves: 0,
    hiddenTurn: 0,
    role: null,
    inCombat: false,
  }
  g.objs.set(o.uid, o)
  return o
}

export function createGame(specs: [DeckSpec, DeckSpec], names: [string, string], seed = Date.now()): Game {
  const g: Game = {
    seed,
    rand: mulberry32(seed),
    turn: 1,
    turnPlayer: 0,
    first: 0,
    phase: 'setup',
    players: [null, null] as unknown as [PlayerState, PlayerState],
    bfs: [],
    objs: new Map(),
    nextUid: 1,
    chain: [],
    showdown: null,
    triggers: [],
    log: [],
    winner: null,
    victory: 8, // 487.3
  }
  for (const p of [0, 1] as PID[]) {
    const s = specs[p]
    const legend = newObj(g, s.legend, p, 'legend') // 111
    const champ = newObj(g, s.champion, p, 'champion') // 112
    const deck = shuffle(g, s.main.map((c) => newObj(g, c, p, 'deck').uid)) // 114
    const runeDeck = shuffle(g, s.runes.map((c) => newObj(g, c, p, 'runeDeck').uid))
    g.players[p] = {
      id: p,
      name: names[p],
      deckName: s.name,
      legend: legend.uid,
      champion: champ.uid,
      deck,
      hand: [],
      trash: [],
      banish: [],
      runeDeck,
      runes: [],
      pool: { energy: 0, power: {} },
      points: 0,
      scored: [],
      played: 0,
    }
    // 487.5: ogni giocatore sceglie a caso uno dei suoi tre campi
    const bf = s.battlefields[Math.floor(g.rand() * s.battlefields.length)]
    g.bfs.push({ loc: p === 0 ? 'bf0' : 'bf1', card: bf, owner: p, controller: null, contested: null, facedown: null })
  }
  g.first = g.rand() < 0.5 ? 0 : 1 // 115
  g.turnPlayer = g.first
  return g
}

/** Crea una carta direttamente in una zona (solo per i test e per preparare scenari). */
export function spawn(g: Game, card: Card, owner: PID, zone: Zone, loc: LocId | null = null): Obj {
  const o = newObj(g, card, owner, zone)
  o.loc = loc
  const list = listFor(g, o, zone)
  if (list) list.push(o.uid)
  if (zone === 'facedown' && loc) bfAt(g, loc).facedown = o.uid
  return o
}

// ---------------------------------------------------------------- zone

function listFor(g: Game, o: Obj, zone: Zone): number[] | null {
  const pl = g.players[o.owner]
  switch (zone) {
    case 'deck':
      return pl.deck
    case 'hand':
      return pl.hand
    case 'trash':
      return pl.trash
    case 'banish':
      return pl.banish
    case 'runeDeck':
      return pl.runeDeck
    case 'runes':
      return pl.runes
    default:
      return null
  }
}

/**
 * Sposta una carta in un'altra zona. Cambiare zona crea un oggetto nuovo (359.3.e.4) e azzera
 * danni e stati; i token fuori dalla board o dalla catena smettono di esistere (186.1).
 */
export function moveZone(g: Game, o: Obj, zone: Zone, opts: { loc?: LocId | null; bottom?: boolean } = {}): Obj {
  const from = listFor(g, o, o.zone)
  if (from) from.splice(from.indexOf(o.uid), 1)
  if (o.zone === 'champion') g.players[o.owner].champion = null
  if (o.zone === 'facedown' && o.loc) bfAt(g, o.loc).facedown = null
  for (const gear of board(g).filter((x) => x.attachedTo === o.uid)) gear.attachedTo = null // 436.4.b
  g.objs.delete(o.uid)
  if (o.token && zone !== 'board' && zone !== 'chain') {
    o.zone = 'gone'
    return o
  }
  const n: Obj = {
    ...o,
    uid: g.nextUid++,
    zone,
    loc: opts.loc ?? null,
    controller: o.owner,
    exhausted: false,
    damage: 0,
    prevent: 0,
    stunned: false,
    empowered: false,
    attachedTo: null,
    mods: [],
    moves: 0,
    role: null,
    inCombat: false,
  }
  g.objs.set(n.uid, n)
  const to = listFor(g, n, zone)
  if (to) {
    if (zone === 'deck' && !opts.bottom) to.unshift(n.uid)
    else to.push(n.uid)
  }
  return n
}

// ---------------------------------------------------------------- scelte

export function* choose(
  _g: Game,
  player: PID,
  title: string,
  options: ChoiceOpt[],
  min = 1,
  max = 1,
  extra: { cancel?: boolean; rule?: string } = {},
): Gen<number[] | null> {
  if (options.length === 0) return min === 0 ? [] : null
  const ans: Answer = yield { type: 'choose', player, title, options, min, max, ...extra }
  if (ans == null) return null
  const picks = ans as number[]
  return picks
}

export function* yesNo(g: Game, p: PID, title: string, aiYes = true, extra: { cancel?: boolean; rule?: string } = {}): Gen<boolean | null> {
  const r = yield* choose(g, p, title, [
    { label: 'Sì', ai: aiYes ? 1 : 0 },
    { label: 'No', ai: aiYes ? 0 : 1 },
  ], 1, 1, extra)
  return r == null ? null : r[0] === 0
}

/** Nome visibile di un oggetto: le carte coperte restano nascoste all'avversario (128.4). */
export const label = (o: Obj) => o.card.name

export function unitOption(g: Game, o: Obj, ai = 0, viewer?: PID): ChoiceOpt {
  return { label: o.card.name, uid: o.uid, detail: `${might(g, o)} Might · ${locName(g, o.loc, viewer)}`, ai }
}

// ---------------------------------------------------------------- azioni base

export function gainPoints(g: Game, p: PID, n: number, rule: string, why: string) {
  g.players[p].points += n
  log(g, `${pname(g, p)} guadagna ${n} punt${n === 1 ? 'o' : 'i'} (${why}).`, rule, p)
}

function* burnOut(g: Game, p: PID): Gen {
  const pl = g.players[p]
  // 432.2.b: ricicla il trash nel mazzo, in ordine casuale (417.5)
  for (const uid of shuffle(g, [...pl.trash])) moveZone(g, g.objs.get(uid)!, 'deck', { bottom: true })
  log(g, `${pname(g, p)} non ha più carte: Burn Out. Il trash torna nel mazzo e l’avversario guadagna 1 punto.`, '432.2', p)
  gainPoints(g, other(p), 1, '432.2.c', 'Burn Out dell’avversario')
}

export function* draw(g: Game, p: PID, n = 1): Gen {
  const pl = g.players[p]
  for (let i = 0; i < n; i++) {
    if (!pl.deck.length) yield* burnOut(g, p) // 414.4
    if (!pl.deck.length) continue
    moveZone(g, g.objs.get(pl.deck[0])!, 'hand')
  }
}

/** Burn: dalla cima del mazzo al trash (441). */
export function* burn(g: Game, p: PID, n: number): Gen<Obj[]> {
  const pl = g.players[p]
  const out: Obj[] = []
  for (let i = 0; i < n; i++) {
    if (!pl.deck.length) yield* burnOut(g, p) // 441.4
    if (!pl.deck.length) continue
    out.push(moveZone(g, g.objs.get(pl.deck[0])!, 'trash'))
  }
  if (out.length) log(g, `${pname(g, p)} manda nel trash ${out.map((o) => o.card.name).join(', ')} (Burn ${n}).`, '441', p)
  return out
}

/** Scarta: il giocatore sceglie le carte (423.1.a); se non bastano, scarta quelle che ha (423.4). */
export function* discard(g: Game, p: PID, n: number, filter: (o: Obj) => boolean = () => true, title?: string): Gen<Obj[]> {
  const pl = g.players[p]
  const cands = pl.hand.map((u) => g.objs.get(u)!).filter(filter)
  const k = Math.min(n, cands.length)
  if (!k) return []
  const picks = yield* choose(
    g,
    p,
    title ?? `Scegli ${k === 1 ? 'la carta da scartare' : `${k} carte da scartare`}`,
    cands.map((o) => ({ label: o.card.name, uid: o.uid, ai: -cardValue(o) })),
    k,
    k,
    { rule: '423' },
  )
  const out = (picks ?? []).map((i) => moveZone(g, cands[i], 'trash'))
  log(g, `${pname(g, p)} scarta ${out.map((o) => o.card.name).join(', ')}.`, '423', p)
  return out
}

/** Stima grezza del valore di una carta, usata solo dal PC per scegliere. */
export function cardValue(o: Obj) {
  return (o.card.energy ?? 0) + (o.card.power ?? 0) * 1.5 + (o.card.might ?? 0) * 0.5
}

export function* banish(g: Game, o: Obj, responsible: PID): Gen<Obj> {
  const owned = !o.token && o.owner === responsible
  const wasCard = !o.token
  const n = moveZone(g, o, 'banish')
  log(g, `${o.card.name} viene esiliata.`, '428', responsible)
  if (owned && wasCard) {
    // "When you banish a card you own" (legend di Zed)
    const legend = g.objs.get(g.players[responsible].legend)!
    const def = implOf(legend.card.name).banishOwn
    if (def) queueTrig(g, def, legend, responsible)
  }
  return n
}

export function* kill(g: Game, list: Obj[], why: string, rule = '429'): Gen {
  if (!list.length) return
  // 808.1.d.2: i Deathknell vanno in attesa prima che la carta lasci la board
  for (const o of list) {
    const def = implOf(o.card.name).deathknell
    if (def && (!def.when || def.when(g, o))) {
      const others = friendlyAt(g, o.controller, o.loc).filter((x) => x !== o)
      queueTrig(g, def, { ...o }, o.controller, { alone: others.length === 0 })
    }
  }
  log(g, `Muo${list.length > 1 ? 'iono' : 're'}: ${list.map((o) => o.card.name).join(', ')} (${why}).`, rule)
  for (const o of list) moveZone(g, o, 'trash')
}

export function* returnToHand(g: Game, o: Obj) {
  log(g, `${o.card.name} torna nella mano del proprietario.`)
  moveZone(g, o, 'hand')
}

/** Infligge danni: la prevenzione li riduce (438.2). */
export function deal(g: Game, o: Obj, n: number, source: string) {
  if (n <= 0 || !alive(g, o)) return 0
  const prevented = Math.min(o.prevent, n)
  o.prevent -= prevented
  const dealt = n - prevented
  if (dealt > 0) o.damage += dealt
  log(g, `${source} infligge ${dealt} a ${o.card.name}${prevented ? ` (${prevented} prevenuti)` : ''}.`, prevented ? '438.2' : '418')
  return dealt
}

export function empower(g: Game, o: Obj) {
  if (o.empowered) return // 442.1.c
  o.empowered = true
  log(g, `${o.card.name} diventa Empowered.`, '442', o.controller)
  const def = implOf(o.card.name).empowered
  if (def) queueTrig(g, def, o, o.controller)
}

export function stun(g: Game, o: Obj) {
  if (o.stunned) return // 424.1.a.1
  o.stunned = true
  log(g, `${o.card.name} è stordita: non infligge danni in combattimento.`, '424.1.b', o.controller)
}

export function addMod(o: Obj, mod: Obj['mods'][number]) {
  o.mods.push(mod)
}

/** Gioca un token unità (180-187): entra esausto, come ogni unità (143.4). */
export function* playToken(g: Game, p: PID, card: Card, loc: LocId): Gen<Obj> {
  const o = newObj(g, card, p, 'board', true)
  o.loc = loc
  o.exhausted = true
  applyContested(g, o)
  log(g, `${pname(g, p)} gioca un token ${card.name} (${card.might} Might) ${inLoc(g, loc)}.`, '185.2', p)
  return o
}

// ---------------------------------------------------------------- caratteristiche

export function kw(g: Game, o: Obj): Keywords {
  const impl = implOf(o.card.name)
  const s = impl.static ?? {}
  const k: Keywords = {
    assault: s.assault ?? 0,
    shield: s.shield ?? 0,
    tank: !!s.tank,
    backline: !!s.backline,
    ganking: !!s.ganking,
    deflect: s.deflect ?? 0,
  }
  const d = impl.keywords?.(g, o) ?? {}
  k.assault += d.assault ?? 0 // 807.2: i valori si sommano
  k.shield += d.shield ?? 0 // 814.2
  k.deflect += d.deflect ?? 0 // 809.2
  k.tank ||= !!d.tank
  k.ganking ||= !!d.ganking
  k.backline ||= !!d.backline
  for (const m of o.mods) {
    k.assault += m.assault ?? 0
    k.shield += m.shield ?? 0
    k.tank ||= !!m.tank
  }
  return k
}

/** Might effettiva (143.2.a): base, modifiche, equipaggiamento (716), passive e ruolo in combattimento. */
export function might(g: Game, o: Obj) {
  let base = o.card.might ?? 0
  for (const m of o.mods) if (m.baseMight !== undefined) base = m.baseMight
  let v = base
  for (const m of o.mods) v += m.might ?? 0
  v += implOf(o.card.name).might?.(g, o) ?? 0
  for (const gear of board(g)) if (gear.attachedTo === o.uid) v += gear.card.might ?? 0
  if (isBf(o.loc)) v += implOf(bfAt(g, o.loc).card.name).bfMight?.(g, o) ?? 0
  const k = kw(g, o)
  if (o.role === 'attacker') v += k.assault // 807.1.c
  if (o.role === 'defender') v += k.shield // 814.1.c
  return v
}

/** Può essere scelto da una magia o abilità del giocatore `chooser`. */
export function targetable(_g: Game, chooser: PID, o: Obj) {
  return !(o.controller !== chooser && o.mods.some((m) => m.untargetable))
}

/** Costo aggiuntivo di Deflect per chi sceglie un'unità avversaria (809.1.c). */
export const deflectCost = (g: Game, chooser: PID, o: Obj) => (o.controller !== chooser ? kw(g, o).deflect : 0)

/**
 * Sceglie un'unità come bersaglio, tenendo conto di Deflect: le opzioni che non si possono pagare
 * vengono escluse e il costo in più si aggiunge a ctx.extraPower.
 */
export function* chooseUnit(
  g: Game,
  ctx: Ctx,
  title: string,
  filter: (o: Obj) => boolean,
  aiScore: (o: Obj) => number,
  opts: { cancel?: boolean; baseCost?: Cost; rule?: string } = {},
): Gen<Obj | null> {
  const base = opts.baseCost ?? { energy: 0, power: [] }
  const cands = units(g).filter(
    (o) =>
      filter(o) &&
      targetable(g, ctx.p, o) &&
      (!ctx.hiddenAt || !isBf(o.loc) || o.loc === ctx.hiddenAt || ctx.data.__noHiddenRestriction) &&
      canPay(g, ctx.p, withAny(base, ctx.extraPower + deflectCost(g, ctx.p, o))),
  )
  const r = yield* choose(g, ctx.p, title, cands.map((o) => unitOption(g, o, aiScore(o), ctx.p)), 1, 1, { cancel: opts.cancel, rule: opts.rule })
  if (!r) return null
  const o = cands[r[0]]
  const extra = deflectCost(g, ctx.p, o)
  if (extra) {
    ctx.extraPower += extra
    log(g, `${o.card.name} ha Deflect: chi lo sceglie paga ${extra} Power in più.`, '809.1.c', ctx.p)
  }
  return o
}

// ---------------------------------------------------------------- risorse

const ANY: Domain[] = [...DOMAINS]

export const withAny = (c: Cost, n: number): Cost => ({ energy: c.energy, power: [...c.power, ...Array(n).fill(ANY)] })

interface PowerSource {
  kind: 'pool' | 'rune'
  domain: Domain
  uid?: number
  exhausted?: boolean
}

function powerSources(g: Game, p: PID): PowerSource[] {
  const pl = g.players[p]
  const out: PowerSource[] = []
  for (const d of DOMAINS) for (let i = 0; i < (pl.pool.power[d] ?? 0); i++) out.push({ kind: 'pool', domain: d })
  const runes = pl.runes.map((u) => g.objs.get(u)!)
  // Le rune già esaurite si riciclano per prime: hanno già dato la loro energia
  for (const r of [...runes.filter((r) => r.exhausted), ...runes.filter((r) => !r.exhausted)])
    out.push({ kind: 'rune', domain: r.card.domains[0], uid: r.uid, exhausted: r.exhausted })
  return out
}

/** Abbina ogni simbolo di Power a una fonte (pool o runa da riciclare). */
function matchPower(sources: PowerSource[], need: Domain[][]): number[] | null {
  const order = need.map((d, i) => ({ d, i })).sort((a, b) => a.d.length - b.d.length)
  const used = new Set<number>()
  const out: number[] = Array(need.length).fill(-1)
  const go = (k: number): boolean => {
    if (k === order.length) return true
    for (let s = 0; s < sources.length; s++) {
      if (used.has(s) || !order[k].d.includes(sources[s].domain)) continue
      used.add(s)
      out[order[k].i] = s
      if (go(k + 1)) return true
      used.delete(s)
    }
    return false
  }
  return go(0) ? out : null
}

export function canPay(g: Game, p: PID, c: Cost) {
  const pl = g.players[p]
  const ready = pl.runes.filter((u) => !g.objs.get(u)!.exhausted).length
  if (c.energy > pl.pool.energy + ready) return false
  return matchPower(powerSources(g, p), c.power) !== null
}

/**
 * Paga un costo: prima la riserva (166), poi le rune: si esauriscono per l'energia (164.2.a)
 * e si riciclano per la Power del loro dominio (164.2.b).
 */
export function pay(g: Game, p: PID, c: Cost) {
  const pl = g.players[p]
  const sources = powerSources(g, p)
  const match = matchPower(sources, c.power)
  if (!match) throw new Error('costo non pagabile')
  const recycle = new Set(match.map((i) => sources[i]).filter((s) => s.kind === 'rune').map((s) => s.uid!))
  let e = c.energy
  const fromPool = Math.min(pl.pool.energy, e)
  pl.pool.energy -= fromPool
  e -= fromPool
  const ready = pl.runes.map((u) => g.objs.get(u)!).filter((r) => !r.exhausted)
  ready.sort((a, b) => Number(recycle.has(b.uid)) - Number(recycle.has(a.uid)))
  const tapped = ready.slice(0, e)
  for (const r of tapped) r.exhausted = true
  for (const i of match) {
    const s = sources[i]
    if (s.kind === 'pool') pl.pool.power[s.domain] = (pl.pool.power[s.domain] ?? 0) - 1
  }
  const recycled: string[] = []
  for (const uid of recycle) {
    const r = g.objs.get(uid)!
    recycled.push(r.card.domains[0])
    moveZone(g, r, 'runeDeck', { bottom: true }) // 417.1.b
  }
  const parts = []
  if (c.energy) parts.push(`${c.energy} energia${tapped.length ? ` (esaurisce ${tapped.length} rune)` : ''}`)
  if (recycled.length) parts.push(`Power ${recycled.join(', ')} (ricicla ${recycled.length} rune)`)
  if (parts.length) log(g, `${pname(g, p)} paga ${parts.join(' e ')}.`, recycled.length ? '164.2.b' : '164.2.a', p)
}

export function addEnergy(g: Game, p: PID, n: number, why: string) {
  g.players[p].pool.energy += n
  log(g, `${pname(g, p)} aggiunge ${n} energia alla riserva (${why}).`, '430', p)
}

function emptyPools(g: Game, rule: string) {
  for (const pl of g.players) {
    if (pl.pool.energy || Object.values(pl.pool.power).some(Boolean)) log(g, `La riserva di ${pl.name} si svuota.`, rule, pl.id)
    pl.pool = { energy: 0, power: {} }
  }
}

// ---------------------------------------------------------------- controllo e movimento

function applyContested(g: Game, o: Obj) {
  if (!isBf(o.loc)) return
  const bf = bfAt(g, o.loc)
  // 190.3.a.1
  if (bf.contested === null && bf.controller !== o.controller) bf.contested = o.controller
}

export function* moveUnits(g: Game, list: Obj[], dest: LocId, how: string, rule = '448'): Gen {
  const moved: Obj[] = []
  for (const o of list) {
    if (!alive(g, o) || o.loc === dest) continue
    o.loc = dest
    o.moves++
    for (const gear of board(g)) if (gear.attachedTo === o.uid) gear.loc = dest // 435.4: non è un movimento
    applyContested(g, o)
    moved.push(o)
  }
  if (!moved.length) return
  log(g, `${moved.map((o) => o.card.name).join(', ')} si sposta${moved.length > 1 ? 'no' : ''} ${inLoc(g, dest)} (${how}).`, rule, moved[0].controller)
  for (const o of moved) {
    const def = implOf(o.card.name).move
    if (def) queueTrig(g, def, o, o.controller)
  }
}

export function recall(g: Game, o: Obj, rule: string) {
  o.loc = baseOf(o.controller) // 457: non è un movimento
  for (const gear of board(g)) if (gear.attachedTo === o.uid) gear.loc = o.loc
  log(g, `${o.card.name} torna nella base.`, rule, o.controller)
}

/** Destinazioni del movimento standard (144.4). */
export function standardDests(g: Game, o: Obj): LocId[] {
  const bfs = g.bfs.map((b) => b.loc)
  if (!isBf(o.loc)) return bfs
  const out: LocId[] = [baseOf(o.controller)]
  if (kw(g, o).ganking) out.push(...bfs.filter((l) => l !== o.loc)) // 810.1.b
  return out
}

/** Destinazioni valide per un movimento causato da un effetto (355.4.a). */
export function effectDests(g: Game, o: Obj): LocId[] {
  return ([baseOf(o.controller), ...g.bfs.map((b) => b.loc)] as LocId[]).filter((l) => l !== o.loc)
}

// ---------------------------------------------------------------- trigger e catena

export function queueTrig(g: Game, def: TrigDef, self: Obj, controller: PID, data: Record<string, unknown> = {}) {
  if (def.when && !def.when(g, self)) return
  const hiddenAt = (data.hiddenAt as LocId | null | undefined) ?? null
  const ctx: Ctx = { self, p: controller, hiddenAt, paid: !!data.paid, data: { ...data }, extraPower: 0 }
  g.triggers.push({
    controller,
    label: `${self.card.name}: ${def.label}`,
    source: self.uid,
    prepare: def.prepare ? () => def.prepare!(g, ctx) : undefined,
    resolve: () => def.resolve(g, ctx),
  })
}

let chainIds = 1

/** Mette sulla catena i trigger in attesa: prima quelli del giocatore di turno (383.3.d.1). */
function* finalizeTriggers(g: Game): Gen {
  while (g.triggers.length) {
    const tp = g.turnPlayer
    const idx = g.triggers.findIndex((t) => t.controller === tp)
    const t = g.triggers.splice(idx >= 0 ? idx : 0, 1)[0]
    if (t.prepare) {
      const ok = yield* t.prepare()
      if (!ok) continue // 383.3.a.2
    }
    g.chain.push({ id: chainIds++, controller: t.controller, kind: 'trigger', label: t.label, resolve: t.resolve })
    log(g, `Si attiva ${t.label}.`, '383.3', t.controller)
  }
}

function* priorityRound(g: Game): Gen {
  let p = g.chain[g.chain.length - 1].controller // 337.4
  let passes = 0
  while (passes < 2 && g.winner === null) {
    const acts = available(g, p)
    let chosen: ActionOpt | undefined
    if (acts.length) {
      const ans = yield { type: 'act', player: p, context: 'chain', actions: [...acts, passOpt()] }
      chosen = acts.find((a) => a.id === ans)
    }
    if (!chosen) {
      passes++ // 338.1.b
      p = other(p)
      continue
    }
    const ok = yield* chosen.run()
    if (!ok) continue
    yield* finalizeTriggers(g)
    passes = 0
    p = g.chain.length ? g.chain[g.chain.length - 1].controller : p
    if (!g.chain.length) return
  }
  if (g.winner !== null) return
  // 340.1: si risolve l'elemento più recente
  const item = g.chain.pop()!
  log(g, `Si risolve ${item.label}.`, '340.1', item.controller)
  yield* item.resolve()
  if (item.card) {
    const c = g.objs.get(item.card)
    if (c && c.zone === 'chain') {
      if (item.flow) yield* banish(g, c, item.controller) // 829.1.b.1
      else moveZone(g, c, 'trash') // 359.3.d
    }
  }
}

const passOpt = (): ActionOpt => ({ id: 'pass', label: 'Passa', kind: 'pass', run: function* () { return true } })

/** Gestisce cleanup, trigger e catena finché lo stato torna aperto (334-340). */
export function* settle(g: Game): Gen {
  for (let guard = 0; guard < 500 && g.winner === null; guard++) {
    yield* cleanup(g)
    if (g.winner !== null) return
    if (g.triggers.length) {
      yield* finalizeTriggers(g)
      continue
    }
    if (g.chain.length) {
      yield* priorityRound(g)
      continue
    }
    return
  }
}

// ---------------------------------------------------------------- cleanup (318-323)

function checkWin(g: Game) {
  const [a, b] = [g.players[0].points, g.players[1].points]
  for (const p of [0, 1] as PID[]) {
    const mine = p === 0 ? a : b
    const theirs = p === 0 ? b : a
    if (mine >= g.victory && mine > theirs) {
      g.winner = p
      g.phase = 'over'
      log(g, `${pname(g, p)} ha ${mine} punti e vince la partita!`, '323.1', p)
      return true
    }
  }
  return false
}

export function* cleanup(g: Game): Gen {
  for (let guard = 0; guard < 50; guard++) {
    if (checkWin(g)) return // 323.1
    const sd = g.showdown
    // 323.2: designazioni di attaccante e difensore
    if (sd?.combat) {
      for (const o of units(g)) {
        if (o.loc === sd.loc) {
          const role: Role = o.controller === sd.attacker ? 'attacker' : 'defender'
          if (o.role !== role) {
            const first = !o.inCombat
            o.role = role
            o.inCombat = true
            if (first) fireRoleTrigger(g, o)
          }
        } else if (o.role) o.role = null
      }
    }
    // 323.4: muoiono le unità con danni letali (142.4.b)
    const lethal = units(g).filter((o) => o.damage > 0 && o.damage >= might(g, o))
    if (lethal.length) {
      yield* kill(g, lethal, 'danni letali', '323.4')
      continue
    }
    let changed = false
    const open = g.chain.length === 0 && g.triggers.length === 0
    // 323.5: si perde il controllo dei campi senza proprie unità
    for (const bf of g.bfs) {
      if (open && bf.controller !== null && !friendlyAt(g, bf.controller, bf.loc).length && sd?.loc !== bf.loc) {
        log(g, `${pname(g, bf.controller)} non ha più unità a ${bfName(g, bf.loc)} e ne perde il controllo.`, '323.5')
        bf.controller = null
        changed = true
      }
    }
    // 323.6: richiamo dell'equipaggiamento non attaccato; via le carte nascoste in campi non controllati
    for (const o of board(g)) {
      if (isGear(o) && isBf(o.loc) && o.attachedTo === null) {
        recall(g, o, '323.6')
        changed = true
      }
    }
    for (const bf of g.bfs) {
      if (bf.facedown !== null) {
        const f = g.objs.get(bf.facedown)!
        if (bf.controller !== f.controller) {
          log(g, `La carta nascosta a ${bfName(g, bf.loc)} va nel trash: il campo non è più di chi l’ha nascosta.`, '323.6.a')
          moveZone(g, f, 'trash')
          changed = true
        }
      }
    }
    // 323.10: si toglie lo stato Contested se chi l'ha applicato non ha più unità lì
    for (const bf of g.bfs) {
      if (bf.contested !== null && sd?.loc !== bf.loc && !friendlyAt(g, bf.contested, bf.loc).length) {
        bf.contested = null
        changed = true
      }
      if (bf.contested === null && sd?.loc !== bf.loc) {
        const intruder = unitsAt(g, bf.loc).find((o) => o.controller !== bf.controller)
        if (intruder) {
          bf.contested = intruder.controller // 323.10.a
          changed = true
        }
      }
    }
    // 323.11-12: in stato Neutral Open si apre un combattimento o uno showdown
    if (!sd && open && g.winner === null) {
      const staged = g.bfs.filter((b) => b.contested !== null)
      const combat = staged.find((b) => friendlyAt(g, other(b.contested!), b.loc).length > 0)
      const show = staged.find((b) => friendlyAt(g, b.contested!, b.loc).length > 0)
      const at = combat ?? show
      if (at) {
        yield* runShowdown(g, at.loc, !!combat)
        changed = true
      }
    }
    if (!changed) return
  }
}

function fireRoleTrigger(g: Game, o: Obj) {
  const def = o.role === 'attacker' ? implOf(o.card.name).attack : undefined
  if (def) queueTrig(g, def, o, o.controller) // 383.4.e
}

// ---------------------------------------------------------------- showdown e combattimento

function* runShowdown(g: Game, loc: LocId, combat: boolean): Gen {
  const bf = bfAt(g, loc)
  const focus = bf.contested! // 345
  g.showdown = { loc, combat: false, focus, attacker: null, defender: null }
  if (combat) yield* startCombat(g)
  else log(g, `Showdown a ${bfName(g, bf.loc)}: ${pname(g, focus)} ha il focus.`, '344.2', focus)
  yield* settle(g)
  let p = focus
  let passes = 0
  while (passes < 2 && g.winner === null) {
    const sd = g.showdown!
    if (!sd.combat && friendlyAt(g, other(sd.focus), loc).length && friendlyAt(g, sd.focus, loc).length) {
      yield* startCombat(g) // 323.13
      yield* settle(g)
    }
    sd.focus = p
    const acts = available(g, p)
    let chosen: ActionOpt | undefined
    if (acts.length) {
      const ans = yield { type: 'act', player: p, context: 'showdown', actions: [...acts, passOpt()] }
      chosen = acts.find((a) => a.id === ans)
    }
    if (!chosen) {
      passes++ // 347.2
      p = other(p)
      continue
    }
    const ok = yield* chosen.run()
    if (!ok) continue
    yield* settle(g)
    passes = 0
    p = other(p) // 346: chiusa la catena, il focus passa
  }
  if (g.winner !== null) return
  if (g.showdown!.combat) {
    yield* combatResolution(g)
    return
  }
  // 348.2: fine di uno showdown senza combattimento
  const present = new Set(unitsAt(g, loc).map((o) => o.controller))
  if (present.size === 1) {
    const p1 = [...present][0]
    if (bf.controller !== p1) {
      bf.controller = p1
      log(g, `${pname(g, p1)} prende il controllo di ${bfName(g, bf.loc)}.`, '348.2.a', p1)
      bf.contested = null
      g.showdown = null
      yield* scoreBf(g, p1, loc, 'conquer')
    }
  }
  bf.contested = null
  g.showdown = null
}

function* startCombat(g: Game): Gen {
  const sd = g.showdown!
  const bf = bfAt(g, sd.loc)
  sd.combat = true
  sd.attacker = bf.contested! // il giocatore che ha applicato Contested attacca
  sd.defender = other(sd.attacker)
  log(g, `Combattimento a ${bfName(g, bf.loc)}: attacca ${pname(g, sd.attacker)}, difende ${pname(g, sd.defender)}.`, '466.2', sd.attacker)
  // 466.2.b: effetti di inizio combattimento
  implOf(bf.card.name).bfCombatStart?.(g, sd.loc)
  // 466.2.c: designazioni
  for (const o of unitsAt(g, sd.loc)) {
    o.role = o.controller === sd.attacker ? 'attacker' : 'defender'
    o.inCombat = true
  }
  for (const o of unitsAt(g, sd.loc)) fireRoleTrigger(g, o)
}

export function toCombatUnit(g: Game, o: Obj): CombatUnit {
  const k = kw(g, o)
  const silent = !!implOf(o.card.name).noCombatDamage?.(g, o)
  return {
    uid: String(o.uid),
    card: o.card,
    might: Math.max(0, might(g, o)),
    assault: 0,
    shield: 0,
    tank: k.tank,
    backline: k.backline,
    // non contribuisce ai danni: stordita (424.1.b) o per una sua abilità
    stunned: o.stunned || silent,
    // la prevenzione alza la soglia letale (438.5.a)
    damage: o.damage - o.prevent,
  }
}

function* assignDamage(g: Game, p: PID, total: number, targets: Obj[], role: Role): Gen<Record<string, number>> {
  const cus = targets.map((o) => toCombatUnit(g, o))
  if (total <= 0) return {}
  if (cus.length === 1) return { [cus[0].uid]: total }
  for (let tries = 0; tries < 20; tries++) {
    const ans = (yield { type: 'assign', player: p, total, targets: cus, role }) as Record<string, number> | null
    if (ans && !checkAssignment(total, cus, role, ans).length) return ans
  }
  return autoAssign(total, cus, role)
}

function* combatResolution(g: Game): Gen {
  const sd = g.showdown!
  const loc = sd.loc
  const bf = bfAt(g, loc)
  const atkP = sd.attacker!
  const defP = sd.defender!
  const atk = friendlyAt(g, atkP, loc)
  const def = friendlyAt(g, defP, loc)
  if (atk.length && def.length) {
    // 467.2: somma della Might e assegnazione, prima l'attaccante
    const aTot = totalDamage(atk.map((o) => toCombatUnit(g, o)), 'attacker')
    const dTot = totalDamage(def.map((o) => toCombatUnit(g, o)), 'defender')
    log(g, `Danni di combattimento: gli attaccanti sommano ${aTot}, i difensori ${dTot}.`, '467.2', atkP)
    const aAssign = yield* assignDamage(g, atkP, aTot, def, 'defender')
    const dAssign = yield* assignDamage(g, defP, dTot, atk, 'attacker')
    // 467.2.d: i danni assegnati vengono inflitti insieme
    for (const o of def) deal(g, o, aAssign[String(o.uid)] ?? 0, 'Il combattimento')
    for (const o of atk) deal(g, o, dAssign[String(o.uid)] ?? 0, 'Il combattimento')
  }
  // 468.1: cleanup di combattimento
  const lethal = units(g).filter((o) => o.damage > 0 && o.damage >= might(g, o))
  if (lethal.length) yield* kill(g, lethal, 'danni letali', '323.4')
  for (const o of units(g)) o.damage = 0 // 468.1.a.1
  if (friendlyAt(g, defP, loc).length) for (const o of friendlyAt(g, atkP, loc)) recall(g, o, '468.1.a.2')
  yield* settle(g)
  if (g.winner !== null) return
  // 468.3-468.5: risultato e controllo
  const present = new Set(unitsAt(g, loc).map((o) => o.controller))
  bf.contested = null
  if (present.size === 1) {
    const p = [...present][0]
    if (bf.controller !== p) {
      bf.controller = p
      log(g, `${pname(g, p)} prende il controllo di ${bfName(g, bf.loc)}.`, '468.5', p)
      yield* scoreBf(g, p, loc, 'conquer') // 468.5.d
    } else log(g, `${bfName(g, bf.loc)} resta a ${pname(g, p)}.`, '468.5', p)
  } else if (present.size === 0) {
    bf.controller = null
    log(g, `Nessuna unità resta a ${bfName(g, bf.loc)}: il campo non è più controllato.`, '468.5.b')
  } else log(g, 'Restano unità di entrambi: nessun risultato.', '468.3.d')
  yield* settle(g)
  // 468.7: fine del combattimento
  for (const o of units(g)) {
    if (o.inCombat) {
      const def = implOf(o.card.name).combatEnd
      if (def) queueTrig(g, def, o, o.controller)
    }
    o.role = null
    o.inCombat = false
  }
  g.showdown = null
  log(g, 'Il combattimento finisce.', '468.7')
}

// ---------------------------------------------------------------- punteggio (469-474)

export function* scoreBf(g: Game, p: PID, loc: LocId, how: 'conquer' | 'hold'): Gen {
  const pl = g.players[p]
  const bf = bfAt(g, loc)
  if (pl.scored.includes(loc)) return // 472
  pl.scored.push(loc)
  if (how === 'hold') gainPoints(g, p, 1, '471.2', `tiene ${bfName(g, bf.loc)}`)
  else if (pl.points >= g.victory - 1 && pl.scored.length < g.bfs.length) {
    log(g, `Sarebbe il punto finale, ma ${pname(g, p)} non ha segnato su tutti i campi in questo turno: pesca 1 invece.`, '473.1.b.1', p)
    yield* draw(g, p, 1)
  } else gainPoints(g, p, 1, how === 'conquer' ? '471.1' : '471.2', `conquista ${bfName(g, bf.loc)}`)
  // 473.2: effetti di conquista o di tenuta
  for (const o of friendlyAt(g, p, loc)) {
    const def = how === 'conquer' ? implOf(o.card.name).conquer : implOf(o.card.name).hold
    if (def) queueTrig(g, def, o, p)
  }
  const bdef = how === 'conquer' ? implOf(bf.card.name).bfConquer : implOf(bf.card.name).bfHold
  if (bdef) {
    const pseudo: Obj = { ...(g.objs.get(g.players[p].legend) as Obj), card: bf.card, controller: p }
    queueTrig(g, bdef, pseudo, p)
  }
}

// ---------------------------------------------------------------- costi delle carte

export function baseCost(o: Obj, src: PlaySource): Cost {
  if (src === 'facedown') return { energy: 0, power: [] } // 811.1.b: ignora il costo base
  if (src === 'trash') return implOf(o.card.name).flow ?? { energy: 0, power: [] }
  const domains = o.card.domains.filter((d) => (DOMAINS as string[]).includes(d))
  return { energy: o.card.energy ?? 0, power: Array(o.card.power ?? 0).fill(domains.length ? domains : ANY) }
}

export function totalCost(g: Game, p: PID, o: Obj, src: PlaySource, ctx: Pick<Ctx, 'paid' | 'extraPower'>): Cost {
  const impl = implOf(o.card.name)
  const c = baseCost(o, src)
  const out: Cost = { energy: c.energy, power: [...c.power] }
  if (ctx.paid && impl.optional?.energy) out.energy += impl.optional.energy // 356.2
  const d = impl.discount?.(g, p, o)
  if (d) {
    out.energy = Math.max(0, out.energy - (d.energy ?? 0)) // 356.6
    for (const dom of d.power ?? []) {
      const i = out.power.findIndex((s) => s.includes(dom))
      if (i >= 0) out.power.splice(i, 1)
    }
  }
  return withAny(out, ctx.extraPower)
}

// ---------------------------------------------------------------- tempi e azioni disponibili

export type PlaySource = 'hand' | 'champion' | 'trash' | 'facedown'
type Window = 'main' | 'showdown' | 'chain'

export function windowFor(g: Game, p: PID): Window | null {
  if (g.winner !== null) return null
  if (g.chain.length) return 'chain' // 309.1.a
  if (g.showdown) return g.showdown.focus === p ? 'showdown' : null // 313
  if (g.phase === 'main' && g.turnPlayer === p) return 'main' // 310.1.a
  return null
}

function speedOk(speed: 'normal' | 'action' | 'reaction', w: Window) {
  if (w === 'main') return true
  if (w === 'showdown') return speed !== 'normal' // 308.1.a
  return speed === 'reaction' // 309.1.a
}

function cardSpeed(o: Obj, src: PlaySource): 'normal' | 'action' | 'reaction' {
  const s = implOf(o.card.name).static ?? {}
  if (src === 'facedown') return 'reaction' // 811.6
  return s.reaction ? 'reaction' : s.action ? 'action' : 'normal'
}

/** Dove si può giocare un'unità (355.2): base, campi controllati, e con Ambush i campi con proprie unità (822). */
export function unitLocs(g: Game, p: PID, o: Obj, src: PlaySource, w: Window): LocId[] {
  if (src === 'facedown') return [o.loc!] // 811.1.d.1
  const s = implOf(o.card.name).static ?? {}
  const out = new Set<LocId>()
  if (speedOk(cardSpeed(o, src), w)) {
    out.add(baseOf(p))
    for (const b of g.bfs) if (b.controller === p) out.add(b.loc)
  }
  if (s.ambush) for (const b of g.bfs) if (friendlyAt(g, p, b.loc).length) out.add(b.loc)
  return [...out]
}

function newCtx(o: Obj, p: PID, src: PlaySource): Ctx {
  return { self: o, p, hiddenAt: src === 'facedown' ? o.loc : null, paid: false, data: {}, extraPower: 0 }
}

function canPlayNow(g: Game, p: PID, o: Obj, src: PlaySource, w: Window) {
  const impl = implOf(o.card.name)
  if (src === 'trash' && !impl.flow) return false
  if (src === 'facedown' && o.hiddenTurn >= g.turn) return false // 811.1.b: dal turno successivo
  const ctx = newCtx(o, p, src)
  if (!canPay(g, p, totalCost(g, p, o, src, ctx))) return false
  if (isUnit(o)) return unitLocs(g, p, o, src, w).length > 0
  if (!speedOk(cardSpeed(o, src), w)) return false
  if (isGear(o)) return true
  return impl.canPlay ? impl.canPlay(g, ctx) : true
}

export function available(g: Game, p: PID): ActionOpt[] {
  const w = windowFor(g, p)
  if (!w) return []
  const pl = g.players[p]
  const acts: ActionOpt[] = []
  const addPlay = (o: Obj, src: PlaySource, lbl: string) => {
    if (canPlayNow(g, p, o, src, w))
      acts.push({ id: `play-${src}-${o.uid}`, label: lbl, kind: 'play', uid: o.uid, run: () => playCard(g, p, o, src) })
  }
  for (const uid of pl.hand) addPlay(g.objs.get(uid)!, 'hand', `Gioca ${g.objs.get(uid)!.card.name}`)
  if (pl.champion !== null) addPlay(g.objs.get(pl.champion)!, 'champion', `Gioca ${g.objs.get(pl.champion)!.card.name} (campione)`)
  for (const uid of pl.trash) {
    const o = g.objs.get(uid)!
    if (implOf(o.card.name).flow) addPlay(o, 'trash', `Gioca ${o.card.name} dal trash (Flow)`)
  }
  for (const bf of g.bfs) {
    if (bf.facedown === null) continue
    const o = g.objs.get(bf.facedown)!
    if (o.controller === p) addPlay(o, 'facedown', `Gioca ${o.card.name} da nascosta (${bfName(g, bf.loc)})`)
  }
  // 811.1.b: nascondere una carta nel proprio turno, in stato aperto
  if (g.turnPlayer === p && !g.chain.length && canPay(g, p, { energy: 0, power: [ANY] })) {
    const spots = g.bfs.filter((b) => b.controller === p && b.facedown === null)
    if (spots.length) {
      const hideable = [...pl.hand, ...(pl.champion !== null ? [pl.champion] : [])]
        .map((u) => g.objs.get(u)!)
        .filter((o) => implOf(o.card.name).static?.hidden)
      for (const o of hideable)
        acts.push({ id: `hide-${o.uid}`, label: `Nascondi ${o.card.name}`, kind: 'hide', uid: o.uid, run: () => hideCard(g, p, o) })
    }
  }
  // 144: movimento standard, solo nella fase principale in stato Neutral Open
  if (w === 'main') {
    const movers = units(g).filter((o) => o.controller === p && !o.exhausted)
    if (movers.length) acts.push({ id: 'move', label: 'Muovi unità', kind: 'move', run: () => standardMove(g, p) })
  }
  // abilità attivate (376-381)
  const sources = [g.objs.get(pl.legend)!, ...board(g).filter((o) => o.controller === p)]
  for (const o of sources) {
    for (const ab of abilitiesOf(o)) {
      if (!speedOk(ab.speed, w)) continue
      if (ab.speed === 'normal' && g.turnPlayer !== p) continue // 381.1
      if (!ab.can(g, o) || !canPay(g, p, ab.cost(g, o))) continue
      acts.push({ id: `ab-${ab.id}-${o.uid}`, label: `${o.card.name}: ${ab.label}`, kind: 'ability', uid: o.uid, run: () => activate(g, p, o, ab) })
    }
  }
  return acts
}

// ---------------------------------------------------------------- giocare carte (349-359)

export function* playCard(g: Game, p: PID, o: Obj, src: PlaySource): Gen<boolean> {
  const impl = implOf(o.card.name)
  const pl = g.players[p]
  const w = windowFor(g, p)!
  const ctx = newCtx(o, p, src)
  const hiddenAt = ctx.hiddenAt
  // 355.1.a: costo aggiuntivo opzionale
  if (impl.optional) {
    const opt = impl.optional
    const canDiscard = !opt.discard || pl.hand.filter((u) => u !== o.uid).length >= opt.discard
    if (canDiscard && canPay(g, p, totalCost(g, p, o, src, { paid: true, extraPower: 0 }))) {
      const yes = yield* yesNo(g, p, `${o.card.name}: ${opt.label}?`, true, { cancel: true, rule: '356.2.b' })
      if (yes == null) return false
      ctx.paid = yes
    }
  }
  // 355.2: posizione delle unità
  let loc: LocId | null = null
  if (isUnit(o)) {
    const locs = unitLocs(g, p, o, src, w)
    if (locs.length === 1) loc = locs[0]
    else {
      const r = yield* choose(
        g,
        p,
        `Dove giochi ${o.card.name}?`,
        locs.map((l) => ({ label: locName(g, l, p), loc: l, ai: isBf(l) ? 1 : 0 })),
        1,
        1,
        { cancel: true, rule: '355.2' },
      )
      if (!r) return false
      loc = locs[r[0]]
    }
  } else if (isGear(o)) loc = baseOf(p) // 359.2.d
  // 355.3-355.5: scelte delle magie
  if (isSpell(o) && impl.prepare) {
    const ok = yield* impl.prepare(g, ctx)
    if (!ok) return false
  }
  // 356-357: costo totale e pagamento
  const cost = totalCost(g, p, o, src, ctx)
  if (!canPay(g, p, cost)) {
    log(g, `Non puoi pagare il costo di ${o.card.name}.`, '358.2', p)
    return false
  }
  pay(g, p, cost)
  const srcLabel = src === 'trash' ? ' dal trash con Flow' : src === 'facedown' ? ' da nascosta' : src === 'champion' ? ' dalla zona campione' : ''
  const onChain = moveZone(g, o, 'chain') // 354
  if (ctx.paid && impl.optional?.discard) yield* discard(g, p, impl.optional.discard)
  pl.played++
  if (isUnit(onChain) || isGear(onChain)) {
    // 337.2 / 359.2: i permanenti si risolvono subito ed entrano sulla board
    const perm = moveZone(g, onChain, 'board', { loc })
    perm.controller = p
    perm.exhausted = isUnit(perm) && !impl.entersReady?.(g, perm) // 143.4
    log(
      g,
      `${pname(g, p)} gioca ${perm.card.name}${srcLabel} ${inLoc(g, loc)}${isUnit(perm) && !perm.exhausted ? ', pronta' : ''}.`,
      isUnit(perm) ? (perm.exhausted ? '143.4' : '359.2.c') : '359.2.d',
      p,
      perm.card,
    )
    applyContested(g, perm)
    if (impl.play) queueTrig(g, impl.play, perm, p, { paid: ctx.paid, hiddenAt })
    if (isGear(perm)) {
      for (const x of board(g).filter((x) => x.controller !== p)) {
        const t = implOf(x.card.name).opponentGear?.(g, x, perm)
        if (t) g.triggers.push(t)
      }
    }
  } else {
    ctx.self = onChain
    g.chain.push({
      id: chainIds++,
      controller: p,
      kind: 'spell',
      label: o.card.name,
      card: onChain.uid,
      flow: src === 'trash',
      resolve: () => (impl.resolve ? impl.resolve(g, ctx) : noop()),
    })
    log(g, `${pname(g, p)} gioca ${o.card.name}${srcLabel}.`, src === 'trash' ? '829.1.b' : '359.3', p, o.card)
  }
  return true
}

function* noop(): Gen {}

function* hideCard(g: Game, p: PID, o: Obj): Gen<boolean> {
  const spots = g.bfs.filter((b) => b.controller === p && b.facedown === null)
  const r = yield* choose(g, p, `Dove nascondi ${o.card.name}?`, spots.map((b) => ({ label: bfName(g, b.loc), loc: b.loc })), 1, 1, { cancel: true, rule: '811.1.b' })
  if (!r) return false
  const bf = spots[r[0]]
  pay(g, p, { energy: 0, power: [ANY] })
  const f = moveZone(g, o, 'facedown', { loc: bf.loc })
  f.controller = p
  f.hiddenTurn = g.turn
  bf.facedown = f.uid
  log(g, `${pname(g, p)} nasconde una carta coperta a ${bfName(g, bf.loc)}.`, '811.1.b', p)
  return true
}

function* standardMove(g: Game, p: PID): Gen<boolean> {
  const movers = units(g).filter((o) => o.controller === p && !o.exhausted)
  const r = yield* choose(
    g,
    p,
    'Quali unità muovi? (si muovono insieme verso la stessa destinazione)',
    movers.map((o) => unitOption(g, o, 0, p)),
    1,
    movers.length,
    { cancel: true, rule: '144.3' },
  )
  if (!r) return false
  const list = r.map((i) => movers[i])
  const dests = list.map((o) => standardDests(g, o)).reduce((a, b) => a.filter((x) => b.includes(x)))
  if (!dests.length) {
    log(g, 'Queste unità non hanno una destinazione in comune.', '144.3.a', p)
    return false
  }
  const d = yield* choose(g, p, 'Dove?', dests.map((l) => ({ label: locName(g, l, p), loc: l })), 1, 1, { cancel: true, rule: '144.4' })
  if (!d) return false
  for (const o of list) o.exhausted = true // 144.2
  yield* moveUnits(g, list, dests[d[0]], 'movimento standard', '144')
  return true
}

// ---------------------------------------------------------------- abilità attivate

export function abilitiesOf(o: Obj): AbilityDef[] {
  const impl = implOf(o.card.name)
  const out = [...(impl.abilities ?? [])]
  if (impl.empower && o.zone === 'board') {
    const e = impl.empower
    out.push({
      id: 'empower',
      label: 'Empower',
      speed: 'normal',
      rule: '827.1.c.1',
      cost: () => ({ energy: e.energy ?? 0, power: (e.power ?? []).map((d) => [d]) }),
      can: (g, self) => {
        if (self.empowered) return false // "Use only if not Empowered"
        if (!e.discard) return true
        return g.players[self.controller].hand.some((u) => e.discard === 'any' || isSpell(g.objs.get(u)!))
      },
      payExtra: function* (g, self) {
        if (e.discard) {
          const d = yield* discard(g, self.controller, 1, (x) => e.discard === 'any' || isSpell(x), e.discard === 'spell' ? 'Scarta una magia' : undefined)
          return d.length > 0
        }
        return true
      },
      resolve: function* (g, ctx) {
        if (alive(g, ctx.self)) empower(g, ctx.self)
      },
    })
  }
  if (impl.equip && o.zone === 'board') {
    const doms = impl.equip
    out.push({
      id: 'equip',
      label: 'Equip',
      speed: 'normal',
      rule: '818.1.c.2',
      cost: () => ({ energy: 0, power: doms.map((d) => [d]) }),
      can: (g, self) => units(g).some((u) => u.controller === self.controller && u.uid !== self.attachedTo),
      prepare: function* (g, ctx) {
        const u = yield* chooseUnit(g, ctx, `A quale unità attacchi ${ctx.self.card.name}?`, (u) => u.controller === ctx.p && u.uid !== ctx.self.attachedTo, (u) => might(g, u), { cancel: true, rule: '818.1.b.1' })
        if (!u) return false
        ctx.data.unit = u
        return true
      },
      resolve: function* (g, ctx) {
        const u = ctx.data.unit as Obj
        if (!alive(g, ctx.self) || !alive(g, u) || u.controller !== ctx.p) return
        ctx.self.attachedTo = u.uid
        ctx.self.loc = u.loc
        log(g, `${ctx.self.card.name} si attacca a ${u.card.name}.`, '435', ctx.p)
      },
    })
  }
  return out
}

function* activate(g: Game, p: PID, o: Obj, ab: AbilityDef): Gen<boolean> {
  const ctx: Ctx = { self: o, p, hiddenAt: null, paid: false, data: {}, extraPower: 0 }
  if (ab.prepare) {
    const ok = yield* ab.prepare(g, ctx)
    if (!ok) return false
  }
  const cost = withAny(ab.cost(g, o), ctx.extraPower)
  if (!canPay(g, p, cost)) return false
  pay(g, p, cost)
  if (ab.payExtra) {
    const ok = yield* ab.payExtra(g, o)
    if (!ok) return false
  }
  g.chain.push({ id: chainIds++, controller: p, kind: 'ability', label: `${o.card.name}: ${ab.label}`, resolve: () => ab.resolve(g, ctx) })
  log(g, `${pname(g, p)} attiva ${o.card.name}: ${ab.label}.`, ab.rule, p, o.card)
  return true
}

// ---------------------------------------------------------------- partita e turni

function* channel(g: Game, p: PID, n: number) {
  const pl = g.players[p]
  const got: string[] = []
  for (let i = 0; i < n && pl.runeDeck.length; i++) {
    const r = moveZone(g, g.objs.get(pl.runeDeck[0])!, 'runes') // 431.2.a: entrano pronte
    got.push(r.card.domains[0])
  }
  if (got.length) log(g, `${pname(g, p)} canalizza ${got.length} rune (${got.join(', ')}).`, n === 3 ? '487.7' : '315.3.b', p)
}

function* mulligan(g: Game, p: PID): Gen {
  const pl = g.players[p]
  const hand = pl.hand.map((u) => g.objs.get(u)!)
  const r = yield* choose(
    g,
    p,
    'Mulligan: scegli fino a 2 carte da rimettere nel mazzo',
    hand.map((o) => ({ label: o.card.name, uid: o.uid, ai: (o.card.energy ?? 0) >= 6 ? 1 : -1 })),
    0,
    2,
    { rule: '117' },
  )
  const picks = (r ?? []).map((i) => hand[i])
  if (!picks.length) {
    log(g, `${pname(g, p)} tiene la mano.`, '117', p)
    return
  }
  // 117.1-117.3: si mettono da parte, si pesca altrettanto, poi si riciclano
  for (const o of picks) {
    pl.hand.splice(pl.hand.indexOf(o.uid), 1)
    o.zone = 'gone'
  }
  yield* draw(g, p, picks.length)
  for (const o of shuffle(g, picks)) {
    o.zone = 'hand'
    pl.hand.push(o.uid)
    moveZone(g, o, 'deck', { bottom: true })
  }
  log(g, `${pname(g, p)} rimette ${picks.length} cart${picks.length === 1 ? 'a' : 'e'} in fondo al mazzo e ne pesca altrettante.`, '117', p)
}

function* takeTurn(g: Game): Gen {
  const p = g.turnPlayer
  const pl = g.players[p]
  for (const x of g.players) {
    x.scored = []
    x.played = 0
  }
  for (const o of g.objs.values()) o.moves = 0
  log(g, `Turno ${g.turn}: tocca a ${pl.name}.`, '304', p)
  // 315.1: Awaken
  g.phase = 'awaken'
  for (const o of g.objs.values()) if (o.controller === p && (o.zone === 'board' || o.zone === 'runes' || o.zone === 'legend')) o.exhausted = false
  // 315.2: Beginning, poi Scoring (tiene i campi controllati)
  g.phase = 'beginning'
  for (const bf of g.bfs) if (bf.controller === p) yield* scoreBf(g, p, bf.loc, 'hold')
  yield* settle(g)
  if (g.winner !== null) return
  // 315.3: Channel, il secondo giocatore ne canalizza una in più al primo turno (487.7)
  g.phase = 'channel'
  yield* channel(g, p, g.turn === 2 ? 3 : 2)
  // 315.4: Draw
  g.phase = 'draw'
  yield* draw(g, p, 1)
  yield* settle(g)
  if (g.winner !== null) return
  // 316: Main
  g.phase = 'main'
  emptyPools(g, '316.3')
  for (;;) {
    yield* settle(g)
    if (g.winner !== null) return
    const acts = available(g, p)
    const end: ActionOpt = { id: 'end', label: 'Fine turno', kind: 'end', run: function* () { return true } }
    const ans = yield { type: 'act', player: p, context: 'main', actions: [...acts, end] }
    if (ans === 'end') break
    const a = acts.find((x) => x.id === ans)
    if (a) yield* a.run()
  }
  // 317: Ending ed Expiration
  g.phase = 'ending'
  yield* settle(g)
  if (g.winner !== null) return
  for (const o of units(g)) {
    o.damage = 0 // 317.2.b
    o.mods = [] // 317.2.c
    o.prevent = 0
    o.stunned = false // 424.1.a.2
  }
  emptyPools(g, '317.2.d')
  log(g, `Fine del turno di ${pl.name}: le unità guariscono e gli effetti "this turn" finiscono.`, '317.2')
}

export function* runGame(g: Game): Gen {
  log(g, `Campi in gioco: ${g.bfs.map((b) => bfName(g, b.loc)).join(' e ')}. Inizia ${pname(g, g.first)}.`, '487.5')
  // 116-117
  for (const p of [g.first, other(g.first)]) yield* draw(g, p, 4)
  for (const p of [g.first, other(g.first)]) yield* mulligan(g, p)
  while (g.winner === null) {
    yield* takeTurn(g)
    if (g.winner !== null) break
    g.turnPlayer = other(g.turnPlayer)
    g.turn++
    if (g.turn > 400) break
  }
}

export type { Decision }
