// Ingresso del motore di partita: registrazione delle carte, mazzi giocabili e partita in corso.
import './cards'
import type { CardDb } from '../data'
import { isBattlefield, isLegend, isRune } from '../data'
import type { Card, Deck } from '../types'
import { aiAnswer, newMemory, type AiMemory } from './ai'
import { createGame, runGame, type DeckSpec } from './engine'
import { REGISTRY } from './registry'
import type { Answer, Decision, Game, Gen, PID } from './types'

export interface Coverage {
  total: number
  done: number
  missing: string[]
  playable: boolean
}

/** Quante carte distinte del mazzo sono implementate nel motore (per nome). */
export function deckCoverage(deck: Deck, db: CardDb): Coverage {
  const ids = [deck.legendId, ...Object.keys(deck.main), ...Object.keys(deck.runes), ...deck.battlefields].filter(Boolean) as string[]
  const names = [...new Set(ids.map((id) => db.byId.get(id)?.name).filter(Boolean) as string[])]
  const missing = names.filter((n) => !REGISTRY.has(n)).sort()
  const complete = !!deck.legendId && !!deck.championId && deck.battlefields.length > 0 && Object.keys(deck.runes).length > 0
  return { total: names.length, done: names.length - missing.length, missing, playable: complete && missing.length === 0 }
}

export function deckToSpec(deck: Deck, db: CardDb): DeckSpec {
  const card = (id: string) => db.byId.get(id) as Card
  const main: Card[] = []
  let champLeft = 1 // 112: il campione scelto va nella sua zona, non nel mazzo
  for (const [id, n] of Object.entries(deck.main)) {
    for (let i = 0; i < n; i++) {
      if (id === deck.championId && champLeft) {
        champLeft--
        continue
      }
      main.push(card(id))
    }
  }
  const runes: Card[] = []
  for (const [id, n] of Object.entries(deck.runes)) for (let i = 0; i < n; i++) runes.push(card(id))
  return {
    name: deck.name,
    legend: card(deck.legendId!),
    champion: card(deck.championId!),
    main: main.filter((c) => !isLegend(c) && !isBattlefield(c) && !isRune(c)),
    runes,
    battlefields: deck.battlefields.map(card),
  }
}

/** Partita in corso: il motore avanza da solo per il PC e si ferma alle decisioni del giocatore. */
export class Match {
  readonly g: Game
  readonly human: PID | null
  pending: Decision | null = null
  private gen: Gen
  private mem: [AiMemory, AiMemory] = [newMemory(), newMemory()]
  private started = false

  constructor(specs: [DeckSpec, DeckSpec], names: [string, string], human: PID | null, seed?: number, picks?: [number | null, number | null]) {
    this.g = createGame(specs, names, seed, picks)
    this.human = human
    this.gen = runGame(this.g)
  }

  get over() {
    return this.g.winner !== null || (this.started && this.pending === null)
  }

  /** Avanza di un passo: restituisce la decisione corrente (del PC o del giocatore) o null a fine partita. */
  next(answer?: Answer): Decision | null {
    const r = this.started ? this.gen.next(answer ?? null) : this.gen.next()
    this.started = true
    this.pending = r.done ? null : r.value
    return this.pending
  }

  isHuman(d: Decision) {
    return this.human !== null && d.player === this.human
  }

  aiAnswer(d: Decision): Answer {
    return aiAnswer(this.g, d, this.mem[d.player])
  }

  /** Fa giocare il PC finché tocca al giocatore (o la partita finisce). */
  runAi(limit = 100000): Decision | null {
    let d = this.started ? this.pending : this.next()
    for (let i = 0; d && !this.isHuman(d) && i < limit; i++) d = this.next(this.aiAnswer(d))
    return d
  }
}

export { REGISTRY }
export type { DeckSpec }
