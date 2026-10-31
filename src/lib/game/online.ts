// Partite online tra giocatori: i due dispositivi fanno girare lo stesso motore con lo stesso seme
// e si scambiano solo le risposte alle decisioni. Ogni risposta ricevuta passa da validAnswer:
// il motore accetta soltanto le scelte che lui stesso ha dichiarato legali, quindi una mossa fuori
// regolamento (anche da un'app modificata) viene rifiutata e la partita si ferma.
import { checkAssignment } from '../combat'
import type { Answer, Decision, Game } from './types'

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)

/** Vero se `a` è una risposta legale alla decisione `d`. */
export function validAnswer(d: Decision, a: Answer): boolean {
  if (d.type === 'act') return typeof a === 'string' && d.actions.some((x) => x.id === a)
  if (d.type === 'choose') {
    if (a === null) return !!d.cancel
    if (!Array.isArray(a) || a.length < d.min || a.length > d.max) return false
    if (new Set(a).size !== a.length) return false
    return a.every((i) => isInt(i) && i >= 0 && i < d.options.length)
  }
  // assign: danni interi non negativi solo alle unità bersaglio, secondo 467.2.c (Tank 815, Backline 826)
  if (!a || typeof a !== 'object' || Array.isArray(a)) return false
  const uids = new Set(d.targets.map((t) => String(t.uid)))
  if (!Object.entries(a).every(([k, v]) => uids.has(k) && isInt(v) && v >= 0)) return false
  return checkAssignment(d.total, d.targets, d.role, a).length === 0
}

/** Impronta dello stato: i due dispositivi la confrontano a ogni mossa per accorgersi se divergono. */
export function stateHash(g: Game): string {
  const objs = [...g.objs.values()].map((o) => [o.uid, o.card.id, o.controller, o.zone, o.loc, o.exhausted, o.damage, o.stunned, o.buff, o.attachedTo])
  const players = g.players.map((p) => [p.deck, p.hand, p.trash, p.banish, p.runes, p.runeDeck, p.points, p.xp, p.pool])
  const bfs = g.bfs.map((b) => [b.loc, b.controller, b.contested, b.facedown])
  const s = JSON.stringify([g.turn, g.turnPlayer, g.phase, g.winner, g.chain.length, g.log.length, players, bfs, objs])
  // FNV-1a a 32 bit
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Seme della partita da due contributi: nessuno dei due giocatori può sceglierlo da solo. */
export function combineSeeds(a: number, b: number) {
  return (a ^ b) >>> 0
}

/** Impronta SHA-256 (esadecimale) del seme dell'host, pubblicata prima di vedere quello dell'ospite. */
export async function commitSeed(seed: number, salt: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${seed}:${salt}`))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
