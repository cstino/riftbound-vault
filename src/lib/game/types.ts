// Tipi del motore di partita. Lo stato è mutabile e vive solo in memoria durante la partita.
import type { Card, Domain } from '../types'
import type { CombatUnit, Role } from '../combat'

export type PID = 0 | 1
export type LocId = 'base0' | 'base1' | 'bf0' | 'bf1'
export type Zone =
  | 'deck'
  | 'hand'
  | 'trash'
  | 'banish'
  | 'board'
  | 'chain'
  | 'champion'
  | 'legend'
  | 'facedown'
  | 'runeDeck'
  | 'runes'
  | 'gone'

/** Effetti con durata "this turn": scadono nel cleanup di fine turno (317.2.c). */
export interface Mod {
  source: string
  might?: number
  /** "Its base Might becomes N this turn". */
  baseMight?: number
  assault?: number
  shield?: number
  tank?: boolean
  /** "Can't be chosen by enemy spells and abilities this turn". */
  untargetable?: boolean
}

export interface Obj {
  uid: number
  card: Card
  owner: PID
  controller: PID
  zone: Zone
  /** Posizione sulla board, o campo del facedown. */
  loc: LocId | null
  token: boolean
  exhausted: boolean
  damage: number
  /** Danni da prevenire in questo turno (438). */
  prevent: number
  stunned: boolean
  empowered: boolean
  /** Equipaggiamento: unità a cui è attaccato (716). */
  attachedTo: number | null
  mods: Mod[]
  /** Movimenti fatti in questo turno. */
  moves: number
  /** Turno in cui la carta è stata nascosta (811). */
  hiddenTurn: number
  role: Role | null
  /** Ha partecipato al combattimento in corso. */
  inCombat: boolean
}

export interface Pool {
  energy: number
  power: Partial<Record<Domain, number>>
}

export interface PlayerState {
  id: PID
  name: string
  deckName: string
  legend: number
  champion: number | null
  deck: number[]
  hand: number[]
  trash: number[]
  banish: number[]
  runeDeck: number[]
  runes: number[]
  pool: Pool
  points: number
  /** Campi su cui ha segnato in questo turno (472). */
  scored: LocId[]
  /** Carte giocate in questo turno. */
  played: number
}

export interface Battlefield {
  loc: LocId
  card: Card
  owner: PID
  controller: PID | null
  /** Giocatore che ha applicato lo stato Contested (190.3). */
  contested: PID | null
  facedown: number | null
}

export interface ChainItem {
  id: number
  controller: PID
  kind: 'spell' | 'ability' | 'trigger'
  label: string
  /** Carta della magia sulla catena. */
  card?: number
  /** Giocata con Flow: viene esiliata invece di andare nel trash (829.1.b.1). */
  flow?: boolean
  resolve: () => Gen
}

export interface Showdown {
  loc: LocId
  combat: boolean
  focus: PID
  attacker: PID | null
  defender: PID | null
}

export interface LogEntry {
  turn: number
  text: string
  rule?: string
  player?: PID
  /** Carta giocata o usata, per mostrarla in grande. */
  card?: Card
}

export interface ActionOpt {
  id: string
  label: string
  kind: 'play' | 'hide' | 'move' | 'ability' | 'end' | 'pass'
  uid?: number
  /** Restituisce false se il giocatore annulla prima di pagare. */
  run: () => Gen<boolean>
}

export interface ChoiceOpt {
  label: string
  uid?: number
  loc?: LocId
  detail?: string
  /** Preferenza del PC (più alto = migliore). */
  ai?: number
}

export type Decision =
  | { type: 'act'; player: PID; context: 'main' | 'chain' | 'showdown'; actions: ActionOpt[] }
  | {
      type: 'choose'
      player: PID
      title: string
      options: ChoiceOpt[]
      min: number
      max: number
      cancel?: boolean
      rule?: string
    }
  | { type: 'assign'; player: PID; total: number; targets: CombatUnit[]; role: Role }

export type Answer = string | number[] | Record<string, number> | null

export type Gen<T = void> = Generator<Decision, T, Answer>

export interface Trigger {
  controller: PID
  label: string
  source: number
  /** Scelte e costi alla finalizzazione; false = l'abilità non viene eseguita (383.3.a.2). */
  prepare?: () => Gen<boolean>
  resolve: () => Gen
}

export interface Game {
  seed: number
  rand: () => number
  turn: number
  turnPlayer: PID
  first: PID
  phase: 'setup' | 'awaken' | 'beginning' | 'channel' | 'draw' | 'main' | 'ending' | 'over'
  players: [PlayerState, PlayerState]
  bfs: Battlefield[]
  objs: Map<number, Obj>
  nextUid: number
  chain: ChainItem[]
  showdown: Showdown | null
  triggers: Trigger[]
  log: LogEntry[]
  winner: PID | null
  victory: number
  /** Regola con cui sono stati scelti i campi: a caso (487.5) o scelti (488.5). */
  bfRule: '487.5' | '488.5'
}
