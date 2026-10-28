// Scenari preparati a mano per testare il motore di partita su situazioni precise.
import { available, createGame, settle, spawn } from '../lib/game/engine'
import '../lib/game'
import { autoAssign } from '../lib/combat'
import type { Domain } from '../lib/types'
import type { Answer, Decision, Game, Gen, LocId, Obj, PID } from '../lib/game/types'
import { byName, spec } from './gameHelpers'

/** Partita Zed (0) contro Shen (1) con mani, board e trash vuoti, nella fase principale del giocatore 0. */
export function scene(): Game {
  const g = createGame([spec('Zed'), spec('Shen')], ['Zed', 'Shen'], 7)
  g.turn = 5
  g.turnPlayer = 0
  g.phase = 'main'
  g.bfs[0].card = byName('Zaun Warrens')
  g.bfs[1].card = byName('Grove of the God-Willow')
  return g
}

export const add = (g: Game, p: PID, name: string, zone: 'hand' | 'board' | 'trash' | 'deck' | 'facedown' = 'hand', loc: LocId | null = null): Obj => {
  const o = spawn(g, byName(name), p, zone, zone === 'board' && !loc ? (p === 0 ? 'base0' : 'base1') : loc)
  return o
}

/** Mette in cima al mazzo (l'ultima della lista finisce in cima). */
export const top = (g: Game, p: PID, ...names: string[]) => {
  for (const n of names) {
    const o = spawn(g, byName(n), p, 'deck')
    const d = g.players[p].deck
    d.splice(d.indexOf(o.uid), 1)
    d.unshift(o.uid)
  }
}

export function runes(g: Game, p: PID, ...domains: Domain[]) {
  const names: Record<string, string> = { Fury: 'Fury Rune', Calm: 'Calm Rune', Chaos: 'Chaos Rune', Order: 'Order Rune', Mind: 'Mind Rune', Body: 'Body Rune' }
  for (const d of domains) spawn(g, byName(names[d]), p, 'runes')
}

export type Script = (Answer | ((d: Decision) => Answer))[]

/** Sceglie l'opzione che contiene il testo indicato. */
export const pick = (...labels: string[]) => (d: Decision): Answer => {
  if (d.type === 'act') return d.actions.find((a) => labels.some((l) => a.label.includes(l)))?.id ?? 'pass'
  if (d.type !== 'choose') throw new Error('non è una scelta')
  const idx = labels.map((l) => d.options.findIndex((o) => o.label.includes(l)))
  if (idx.some((i) => i < 0)) throw new Error(`opzione mancante: ${labels} in ${d.options.map((o) => o.label)}`)
  return idx
}

export const yes = pick('Sì')
export const no = pick('No')

/** Esegue un generatore del motore rispondendo con lo script; poi passa e sceglie la prima opzione. */
export function drive<T>(gen: Gen<T>, script: Script = [], fallback?: (d: Decision) => Answer | undefined): { value: T; seen: Decision[] } {
  const seen: Decision[] = []
  let r = gen.next()
  let guard = 0
  while (!r.done) {
    if (guard++ > 5000) throw new Error('troppe decisioni')
    const d = r.value
    seen.push(d)
    let ans: Answer
    const s = script.length ? script.shift()! : undefined
    const f = s === undefined ? fallback?.(d) : undefined
    if (s !== undefined) ans = typeof s === 'function' ? s(d) : s
    else if (f !== undefined) ans = f
    else if (d.type === 'act') ans = d.actions.some((a) => a.id === 'pass') ? 'pass' : 'end'
    else if (d.type === 'choose') ans = d.min === 0 ? [] : [0]
    else ans = autoAssign(d.total, d.targets, d.role)
    r = gen.next(ans)
  }
  return { value: r.value, seen }
}

export const logText = (g: Game) => g.log.map((l) => l.text).join('\n')

function* seq(...gens: Gen<unknown>[]): Gen {
  for (const x of gens) yield* x
}

/** Esegue l'azione indicata e poi gestisce catena, cleanup, showdown e combattimenti. */
export function act(g: Game, p: PID, label: string, script: Script = [], fallback?: (d: Decision) => Answer | undefined) {
  const a = available(g, p).find((x) => x.label.includes(label))
  if (!a) throw new Error(`azione non disponibile: ${label}. Disponibili: ${available(g, p).map((x) => x.label).join(' / ')}`)
  return drive(seq(a.run(), settle(g)), script, fallback)
}

