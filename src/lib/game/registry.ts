// Registro delle carte implementate nel motore di partita. Una carta è giocabile solo se è qui
// (con le sue abilità scritte e testate in src/test/game*.test.ts).
import type { Domain } from '../types'
import type { Battlefield, Game, Gen, LocId, Obj, PID, Trigger } from './types'

export interface Ctx {
  self: Obj
  p: PID
  /** Campo in cui la carta era nascosta, se giocata da facedown (811.1.d). */
  hiddenAt: LocId | null
  /** Ha pagato il costo aggiuntivo opzionale (356.2.b). */
  paid: boolean
  /** Scelte fatte durante la finalizzazione (bersagli, ecc.). */
  data: Record<string, unknown>
  /** Power aggiuntiva da pagare per Deflect (809.1.c). */
  extraPower: number
  /** Ha pagato Accelerate (805). */
  accel?: boolean
  /** Ha pagato Repeat (820): l'effetto si esegue due volte. */
  repeat?: boolean
  /** Sconto in energia da costi aggiuntivi pagati (356.4). */
  discount?: number
}

export interface Keywords {
  /** 831: "When I attack, give an enemy unit here -X Might this turn". */
  disarm: number
  assault: number
  shield: number
  tank: boolean
  backline: boolean
  ganking: boolean
  deflect: number
  /** 816: ucciso all'inizio della Beginning Phase del controllore, prima del punteggio. */
  temporary: boolean
}

export interface Static extends Partial<Keywords> {
  action?: boolean
  reaction?: boolean
  /** 805: "As you play me, you may pay [1][C]. If you do, I enter ready." */
  accelerate?: boolean
  /** 830: si gioca solo in un campo, anche nemico; non viene richiamato. */
  deploy?: boolean
  ambush?: boolean
  hidden?: boolean
}

export interface TrigDef {
  label: string
  /** Condizione aggiuntiva del trigger (383.2.a.1). */
  when?: (g: Game, self: Obj) => boolean
  prepare?: (g: Game, ctx: Ctx) => Gen<boolean>
  resolve: (g: Game, ctx: Ctx) => Gen
}

export interface Cost {
  energy: number
  /** Un simbolo di Power per elemento: i domini con cui si può pagare. */
  power: Domain[][]
}

export interface AbilityDef {
  id: string
  label: string
  speed: 'normal' | 'action' | 'reaction'
  cost: (g: Game, self: Obj, ctx?: Ctx) => Cost
  /** Costi non standard (esaurire, disempower, scartare) e condizioni d'uso. */
  can: (g: Game, self: Obj) => boolean
  payExtra?: (g: Game, self: Obj) => Gen<boolean>
  prepare?: (g: Game, ctx: Ctx) => Gen<boolean>
  resolve: (g: Game, ctx: Ctx) => Gen
  rule: string
}

export interface CardImpl {
  static?: Static
  /** Costo aggiuntivo opzionale "You may ... as an additional cost" (356.2.b). */
  optional?: { label: string; energy?: number; discard?: number; killFriendly?: boolean; discountEnergy?: number }
  /** Sconti sul costo (356.4). */
  discount?: (g: Game, p: PID, self: Obj) => { energy?: number; power?: Domain[] }
  flow?: Cost
  /** 820: costo aggiuntivo per ripetere l'effetto. */
  repeat?: { energy?: number; power?: number; discard?: number }
  /** Per le magie: esiste almeno una scelta valida. */
  canPlay?: (g: Game, ctx: Ctx) => boolean
  prepare?: (g: Game, ctx: Ctx) => Gen<boolean>
  resolve?: (g: Game, ctx: Ctx) => Gen
  entersReady?: (g: Game, self: Obj) => boolean
  play?: TrigDef
  attack?: TrigDef
  move?: TrigDef
  conquer?: TrigDef
  hold?: TrigDef
  deathknell?: TrigDef
  combatEnd?: TrigDef
  empowered?: TrigDef
  /** Abilità dei campi di battaglia ("When you conquer/hold here", "When combat starts here"). */
  bfConquer?: TrigDef
  bfHold?: TrigDef
  bfCombatStart?: (g: Game, loc: LocId) => void
  bfMight?: (g: Game, unit: Obj) => number
  /** "When you conquer" della Legend o di altri permanenti del giocatore. */
  playerConquer?: TrigDef
  /** Campi: "When a player plays a unit here". ctx.data.unit è l'unità. */
  bfUnitPlayed?: TrigDef
  /** Costo di Equip che dipende dall'unità scelta (Hextech Gauntlets). */
  equipCost?: (g: Game, self: Obj, unit: Obj | null) => Cost
  /** Legend di Zed: "When you banish a card you own". */
  banishOwn?: TrigDef
  /** "When I become exhausted". */
  exhausted?: TrigDef
  /** "When you exhaust three or more friendly units at the same time" (ctx.data.count). */
  exhaustMany?: TrigDef
  /** 832 Show Off: cosa si può mostrare mentre si gioca la carta. */
  showOff?: { label: string; filter: (g: Game, o: Obj) => boolean }
  /** Costo aggiuntivo opzionale offerto da una Legend o un permanente per le magie (Seraphine). */
  spellCostOption?: { label: string; energy: number; can: (g: Game, self: Obj) => boolean; pay: (g: Game, self: Obj) => Gen<boolean> }
  /** Abilità che si attiva da trash quando giochi una carta (Meticulous Restorationist). */
  trashPlays?: TrigDef
  /** "When an opponent plays a gear". */
  opponentGear?: (g: Game, self: Obj, gear: Obj) => Trigger | null
  might?: (g: Game, self: Obj) => number
  /** Effetti continui su altre unità del controllore ("Your Mechs have ..."). Attivi dalla board o dalla zona Legend. */
  aura?: (g: Game, self: Obj, target: Obj) => (Partial<Keywords> & { might?: number }) | null
  /** "When you play a unit/card": ctx.data.unit è l'oggetto giocato (anche token). */
  allyPlays?: TrigDef
  /** Campi: "the first time ... a non-token unit they control dies here" (ctx.data.unit). */
  bfUnitDies?: TrigDef
  /** Capienza in più della Facedown Zone (107.3.b.1): da un campo o da un permanente lì. */
  hideExtra?: (g: Game, self: Obj, bf: Battlefield) => number
  /** Campi: "When you hide a card here" (ctx.data.loc). */
  bfHide?: TrigDef
  /** "When you play a card from face down" (ctx.data.card). */
  facedownPlays?: TrigDef
  /** Campi: "plays a unit or gear here" (ctx.data.unit). */
  bfPermPlayed?: TrigDef
  /** "When I defend". */
  defend?: TrigDef
  /** "When a unit you control becomes Mighty" (709), di Legend e permanenti (ctx.data.unit). */
  allyMighty?: TrigDef
  /** Campi: "the first friendly non-token gear played each turn costs [1] less" (Ornn's Forge). */
  bfGearDiscount?: number
  /** Posizioni in più dove giocare l'unità ("You may play me to an occupied enemy battlefield"). */
  extraLocs?: (g: Game, p: PID) => LocId[]
  /** Campi: "When you defend here". */
  bfDefend?: TrigDef
  keywords?: (g: Game, self: Obj) => Partial<Keywords>
  noCombatDamage?: (g: Game, self: Obj) => boolean
  empower?: { energy?: number; power?: Domain[]; discard?: 'any' | 'spell' }
  equip?: Domain[]
  abilities?: AbilityDef[]
  /** Quanto il PC vuole giocare questa carta adesso (> 0 = sì). Solo per le scelte del PC. */
  ai?: (g: Game, p: PID, self: Obj) => number
}

export const REGISTRY = new Map<string, CardImpl>()

export function register(name: string, impl: CardImpl) {
  REGISTRY.set(name, impl)
}

export const implOf = (name: string): CardImpl => REGISTRY.get(name) ?? {}
