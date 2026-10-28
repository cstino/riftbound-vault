// Avversario del PC. Sceglie solo tra le azioni che il motore dichiara legali: le regole sono
// garantite dal motore, qui c'è solo una strategia semplice (euristica, non ottimale).
import { autoAssign } from '../combat'
import { friendlyAt, get, isBf, isGear, isSpell, isUnit, kw, might, units } from './engine'
import { implOf } from './registry'
import type { ActionOpt, Answer, Decision, Game, LocId, Obj, PID } from './types'

export interface AiMemory {
  plan: { units: number[]; dest: LocId } | null
  /** Azioni già provate senza effetto, per non ripeterle all'infinito. */
  tried: Set<string>
  lastLog: number
  /** Tentativi per azione in questo turno: oltre 3 l'azione non si riprova. */
  attempts: Map<string, number>
}

export const newMemory = (): AiMemory => ({ plan: null, tried: new Set(), lastLog: -1, attempts: new Map() })

const defenseMight = (g: Game, o: Obj) => Math.max(0, might(g, o) + (o.role ? 0 : kw(g, o).shield))
const attackMight = (g: Game, o: Obj) => Math.max(0, might(g, o) + (o.role ? 0 : kw(g, o).assault))

function planAttack(g: Game, p: PID): AiMemory['plan'] {
  const ready = units(g).filter((o) => o.controller === p && !o.exhausted && !isBf(o.loc))
  if (!ready.length) return null
  const targets = g.bfs.filter((b) => b.controller !== p)
  let best: AiMemory['plan'] = null
  let bestScore = 0
  for (const b of targets) {
    const enemies = friendlyAt(g, b.controller ?? (p === 0 ? 1 : 0), b.loc).filter((o) => o.controller !== p)
    const def = enemies.reduce((s, o) => s + defenseMight(g, o), 0)
    const sorted = [...ready].sort((a, c) => attackMight(g, c) - attackMight(g, a))
    if (!enemies.length) {
      // campo vuoto: basta un'unità, la più piccola
      const small = [...ready].sort((a, c) => attackMight(g, a) - attackMight(g, c))[0]
      const score = 5
      if (score > bestScore) {
        best = { units: [small.uid], dest: b.loc }
        bestScore = score
      }
      continue
    }
    let sum = 0
    const pick: number[] = []
    for (const o of sorted) {
      pick.push(o.uid)
      sum += attackMight(g, o)
      if (sum > def + 1) break
    }
    if (sum > def) {
      const score = 4 + enemies.length
      if (score > bestScore) {
        best = { units: pick, dest: b.loc }
        bestScore = score
      }
    }
  }
  return best
}

function playScore(g: Game, p: PID, a: ActionOpt): number {
  const o = a.uid != null ? get(g, a.uid) : undefined
  if (!o) return 0
  const impl = implOf(o.card.name)
  if (isUnit(o)) {
    const sd = g.showdown
    if (sd) return sd.combat && (sd.attacker === p || sd.defender === p) ? 3 + (o.card.might ?? 0) : 0
    return 2 + (o.card.energy ?? 0) + (o.card.power ?? 0) + (o.zone === 'champion' ? 3 : 0)
  }
  if (isGear(o)) return g.showdown ? 0 : 1
  if (isSpell(o)) return (impl.ai?.(g, p, o) ?? 0) * 3
  return 0
}

function chooseAct(g: Game, d: Extract<Decision, { type: 'act' }>, mem: AiMemory): string {
  const p = d.player
  if (g.log.length === mem.lastLog) {
    // l'ultima azione è stata annullata: non riprovarla
  } else mem.tried.clear()
  const key = (a: ActionOpt) => `${g.turn}:${a.id}`
  const acts = d.actions.filter((a) => !mem.tried.has(a.id) && (mem.attempts.get(key(a)) ?? 0) < 3)
  const pick = (a: ActionOpt) => {
    mem.attempts.set(key(a), (mem.attempts.get(key(a)) ?? 0) + 1)
    mem.tried.add(a.id)
    mem.lastLog = g.log.length
    return a.id
  }
  let best: ActionOpt | null = null
  let bestScore = 0
  for (const a of acts) {
    let s = 0
    if (a.kind === 'play') s = playScore(g, p, a)
    else if (a.kind === 'ability') {
      const o = a.uid != null ? get(g, a.uid) : undefined
      if (a.id.startsWith('ab-empower') && d.context === 'main') s = 1.5
      else if (a.id.startsWith('ab-zed-legend') && g.players[p].hand.length) s = 0.5
      else if (a.id.startsWith('ab-shen-legend') && g.showdown?.combat && units(g).some((u) => u.controller === p && u.loc === g.showdown!.loc && !kw(g, u).tank)) s = 0.8
      else if (a.id.startsWith('ab-equip') && o && o.attachedTo === null) s = 1
      // altre abilità attivate: il PC le usa nella fase principale (euristica semplice)
      else if (d.context === 'main' && !a.id.startsWith('ab-zed-swap') && !a.id.startsWith('ab-shen-legend') && !a.id.startsWith('ab-zed-legend') && !a.id.startsWith('ab-empower')) s = 0.4
    }
    if (s > bestScore) {
      best = a
      bestScore = s
    }
  }
  if (best) return pick(best)
  if (d.context === 'main') {
    const move = acts.find((a) => a.kind === 'move')
    if (move) {
      mem.plan = planAttack(g, p)
      if (mem.plan) return pick(move)
    }
    return 'end'
  }
  return 'pass'
}

function chooseOptions(_g: Game, d: Extract<Decision, { type: 'choose' }>, mem: AiMemory): number[] {
  if (mem.plan && d.rule === '144.3') {
    const ids = mem.plan.units
    const picks = d.options.map((o, i) => (o.uid != null && ids.includes(o.uid) ? i : -1)).filter((i) => i >= 0)
    if (picks.length) return picks
  }
  if (mem.plan && d.rule === '144.4') {
    const dest = mem.plan.dest
    const i = d.options.findIndex((o) => o.loc === dest)
    mem.plan = null
    if (i >= 0) return [i]
  }
  const order = d.options.map((o, i) => ({ i, s: o.ai ?? 0 })).sort((a, b) => b.s - a.s)
  if (d.min === 0) return order.filter((x) => x.s > 0).slice(0, d.max).map((x) => x.i)
  return order.slice(0, Math.max(d.min, 1)).map((x) => x.i)
}

export function aiAnswer(g: Game, d: Decision, mem: AiMemory): Answer {
  if (d.type === 'act') return chooseAct(g, d, mem)
  if (d.type === 'choose') return chooseOptions(g, d, mem)
  return autoAssign(d.total, d.targets, d.role)
}
