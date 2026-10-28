// Carte del mazzo Rumble (Spiritforged). Test in src/test/game-cards-rumble.test.ts.
import type { Domain } from '../types'
import { DOMAINS } from '../types'
import { register, type Ctx } from './registry'
import {
  addMod,
  alive,
  baseCost,
  baseOf,
  burn,
  canPay,
  choose,
  chooseUnit,
  deal,
  draw,
  isBf,
  isUnit,
  log,
  might,
  moveZone,
  pay,
  playCard,
  playToken,
  predict,
  tokenCard,
  units,
  yesNo,
} from './engine'
import { aiHarm, aiHelp, giveMight, inCombat } from './cards'
import { GOLD } from './cards-vi'
import type { Game, Obj, PID } from './types'

const ANY: Domain[] = [...DOMAINS]

// 187.4: Mech token
export const MECH = tokenCard('Mech', 3, ['Mech'], '')
register('Mech', {})

const isMech = (o: Obj) => o.card.tags.includes('Mech')
const mechs = (g: Game, p: PID) => units(g).filter((o) => o.controller === p && isMech(o))

/** "Give a unit -N Might this turn" (le modifiche possono rendere la Might negativa, 143.2.c). */
function weaken(g: Game, o: Obj, n: number, source: string) {
  if (!alive(g, o)) return
  addMod(o, { source, might: -n })
  log(g, `${o.card.name} ottiene -${n} Might in questo turno.`, undefined, o.controller)
}

/** Magia "Give a unit ... this turn" con eventuale Repeat: un bersaglio per ogni esecuzione (820.2). */
function unitSpell(title: string, ai: 'harm' | 'help', effect: (g: Game, ctx: Ctx, t: Obj) => void, filter: (g: Game, o: Obj) => boolean = () => true) {
  return {
    canPlay: (g: Game) => units(g).some((o) => filter(g, o)),
    prepare: function* (g: Game, ctx: Ctx) {
      const list: Obj[] = []
      for (let i = 0; i < (ctx.repeat ? 2 : 1); i++) {
        const t = yield* chooseUnit(g, ctx, `${title}${ctx.repeat ? ` (${i + 1} di 2)` : ''}`, (o) => filter(g, o), ai === 'harm' ? aiHarm(ctx, g) : aiHelp(ctx, g), { cancel: true })
        if (!t) return false
        list.push(t)
      }
      ctx.data.list = list
      return true
    },
    resolve: function* (g: Game, ctx: Ctx) {
      for (const t of ctx.data.list as Obj[]) if (alive(g, t) && filter(g, t)) effect(g, ctx, t)
    },
  }
}

register('Rumble - Mechanized Menace', {
  aura: (_g, _self, t) => (isMech(t) ? { shield: 1 } : null),
})

register('Rumble, Hotheaded', {
  aura: (_g, _self, t) => (isMech(t) ? { assault: 1 } : null),
  conquer: {
    label: 'ricicla un’altra unità per giocare un Mech dal trash',
    prepare: function* (g, ctx) {
      const others = units(g).filter((o) => o.controller === ctx.p && o !== ctx.self)
      const mechCards = g.players[ctx.p].trash.map((u) => g.objs.get(u)!).filter((o) => isUnit(o) && isMech(o))
      if (!others.length || !mechCards.length) return false
      // 383.3.b: "you may recycle ... to play" — il costo si paga alla finalizzazione
      const yes = yield* yesNo(g, ctx.p, 'Rumble: ricicli un’altra tua unità per giocare un Mech dal trash?', true, { rule: '383.3.b' })
      if (!yes) return false
      const r = yield* choose(g, ctx.p, 'Quale unità ricicli?', others.map((o) => ({ label: o.card.name, uid: o.uid, detail: `${might(g, o)} Might`, ai: might(g, o) })))
      if (!r) return false
      const t = others[r[0]]
      ctx.data.reduce = Math.max(0, might(g, t))
      log(g, `${t.card.name} viene riciclata nel mazzo.`, '417', ctx.p)
      moveZone(g, t, 'deck', { bottom: true })
      return true
    },
    resolve: function* (g, ctx) {
      const mechCards = g.players[ctx.p].trash.map((u) => g.objs.get(u)!).filter((o) => isUnit(o) && isMech(o))
      if (!mechCards.length) return
      const r = yield* choose(g, ctx.p, 'Quale Mech giochi dal trash?', mechCards.map((o) => ({ label: o.card.name, uid: o.uid, ai: o.card.energy ?? 0 })))
      if (!r) return
      const m = mechCards[r[0]]
      const c = baseCost(m, 'hand')
      const cost = { energy: Math.max(0, c.energy - (ctx.data.reduce as number)), power: c.power }
      if (!canPay(g, ctx.p, cost)) {
        log(g, `Non puoi pagare ${m.card.name}: non viene giocato.`, '420.3.c', ctx.p)
        return
      }
      yield* playCard(g, ctx.p, m, 'trash', { limited: true, cost })
    },
  },
})

register('Rumble, Scrapper', {
  aura: (_g, _self, t) => (isMech(t) ? { might: 1 } : null),
  hold: {
    label: 'gioca un token Mech nella base',
    resolve: function* (g, ctx) {
      yield* playToken(g, ctx.p, MECH, baseOf(ctx.p))
    },
  },
})

register('Breakneck Mech', {
  aura: (_g, _self, t) => (isMech(t) ? { deflect: 1, ganking: true } : null),
  entersReady: (g, self) => mechs(g, self.controller).some((o) => o !== self),
})

register('Forecaster', {
  // "Your Mechs have [Vision]": ogni Mech giocato fa Predict (817.1.b)
  allyPlays: {
    label: 'Vision: Predict',
    prepare: function* (_g, ctx) {
      return isMech(ctx.data.unit as Obj)
    },
    resolve: function* (g, ctx) {
      yield* predict(g, ctx.p, 1)
    },
  },
})

register('Bubble Bot', {
  play: {
    label: 'prepara un altro Mech amico',
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Bubble Bot: quale altro Mech prepari?', (o) => o.controller === ctx.p && o !== ctx.self && isMech(o), (o) => (o.exhausted ? 10 : 0) + might(g, o))
      if (!t) return false
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (alive(g, t)) {
        t.exhausted = false
        log(g, `${t.card.name} viene preparata.`, '416', ctx.p)
      }
    },
  },
})

register('Consult the Past', {
  static: { hidden: true, reaction: true },
  resolve: function* (g, ctx) {
    yield* draw(g, ctx.p, 2)
  },
  ai: (g) => (g.phase === 'main' && !g.showdown && !g.chain.length ? 1 : 0),
})

register('Danger Zone', {
  static: { reaction: true },
  repeat: { energy: 1, power: 1 },
  canPlay: (g, ctx) => mechs(g, ctx.p).length > 0,
  resolve: function* (g, ctx) {
    for (let i = 0; i < (ctx.repeat ? 2 : 1); i++) for (const m of mechs(g, ctx.p)) giveMight(g, m, 1, 'Danger Zone')
  },
  ai: (g, p) => (g.showdown?.combat && mechs(g, p).some((o) => inCombat(g, o)) ? 1 : 0),
})

register('Dangerous Duo', {
  play: {
    label: 'Legion: un’unità ottiene +2 Might',
    // 812.1.c: Legion è attivo se hai giocato un'altra carta in questo turno
    when: (g, self) => g.players[self.controller].played >= 2,
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Dangerous Duo: quale unità ottiene +2 Might?', () => true, aiHelp(ctx, g))
      if (!t) return false
      if (ctx.extraPower) pay(g, ctx.p, { energy: 0, power: Array(ctx.extraPower).fill(ANY) })
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      giveMight(g, ctx.data.t as Obj, 2, 'Dangerous Duo')
    },
  },
})

register('Ferrous Forerunner', {
  deathknell: {
    label: 'gioca due token Mech nella base',
    resolve: function* (g, ctx) {
      yield* playToken(g, ctx.p, MECH, baseOf(ctx.p))
      yield* playToken(g, ctx.p, MECH, baseOf(ctx.p))
    },
  },
})

register('Frigid Touch', {
  static: { reaction: true },
  repeat: { energy: 2 },
  ...unitSpell('Frigid Touch: quale unità ottiene -2 Might?', 'harm', (g, _ctx, t) => weaken(g, t, 2, 'Frigid Touch')),
  ai: (g, p) => (g.showdown?.combat && units(g).some((o) => o.controller !== p && inCombat(g, o)) ? 1 : 0),
})

register('Gem Jammer', {
  play: {
    label: 'un’unità ottiene Ganking',
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Gem Jammer: quale unità ottiene [Ganking] in questo turno?', () => true, aiHelp(ctx, g))
      if (!t) return false
      if (ctx.extraPower) pay(g, ctx.p, { energy: 0, power: Array(ctx.extraPower).fill(ANY) })
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (!alive(g, t)) return
      addMod(t, { source: 'Gem Jammer', ganking: true })
      log(g, `${t.card.name} ottiene [Ganking] in questo turno.`, '810', ctx.p)
    },
  },
})

register('Long Sword', {
  // 819.1.d: Quick-Draw = [Reaction] e "When you play this, attach it to a unit you control"
  static: { reaction: true },
  equip: ['Fury'],
  play: {
    label: 'Quick-Draw: si attacca a una tua unità',
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Long Sword: a quale tua unità la attacchi?', (o) => o.controller === ctx.p, (o) => might(g, o) + (inCombat(g, o) ? 20 : 0))
      if (!t) return false
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (!alive(g, ctx.self) || !alive(g, t) || t.controller !== ctx.p) return
      ctx.self.attachedTo = t.uid
      ctx.self.loc = t.loc
      log(g, `Long Sword si attacca a ${t.card.name}.`, '819.1.d', ctx.p)
    },
  },
})

register('Minefield', {
  bfConquer: {
    label: 'le prime 2 carte del mazzo nel trash',
    resolve: function* (g, ctx) {
      yield* burn(g, ctx.p, 2) // 441.1: è l'azione di Burn
    },
  },
})

register('Plundering Poro', {
  conquer: {
    label: 'gioca un Gold esausto',
    resolve: function* (g, ctx) {
      yield* playToken(g, ctx.p, GOLD, baseOf(ctx.p), { exhausted: true })
    },
  },
})

register('Production Surge', {
  discount: (g, p) => (mechs(g, p).length ? { energy: 2 } : {}),
  resolve: function* (g, ctx) {
    yield* playToken(g, ctx.p, MECH, baseOf(ctx.p))
    yield* draw(g, ctx.p, 1)
  },
  ai: () => 1,
})

register('Ravenbloom Conservatory', {
  bfDefend: {
    label: 'rivela la prima carta del mazzo',
    resolve: function* (g, ctx) {
      const pl = g.players[ctx.p]
      if (!pl.deck.length) return
      const top = g.objs.get(pl.deck[0])!
      log(g, `Ravenbloom Conservatory rivela ${top.card.name}.`, '425', ctx.p)
      if (/Spell/.test(top.card.type)) moveZone(g, top, 'hand')
      else moveZone(g, top, 'deck', { bottom: true })
    },
  },
})

register('Singularity', {
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    // "up to two units" (355.13): da zero a due bersagli, scelti uno alla volta
    const list: Obj[] = []
    for (let i = 0; i < 2; i++) {
      const t = yield* chooseUnit(g, ctx, `Singularity: ${i ? 'secondo bersaglio' : 'primo bersaglio'}`, (o) => !list.includes(o), aiHarm(ctx, g), { cancel: true })
      if (!t) {
        if (i === 0) return false
        break
      }
      list.push(t)
      if (i === 0 && units(g).length > 1) {
        const more = yield* yesNo(g, ctx.p, 'Scegli un secondo bersaglio?', true)
        if (!more) break
      }
    }
    ctx.data.list = list
    return true
  },
  resolve: function* (g, ctx) {
    for (const t of ctx.data.list as Obj[]) if (alive(g, t)) deal(g, t, 6, 'Singularity')
  },
  ai: (g, p) => (units(g).filter((o) => o.controller !== p && might(g, o) >= 4).length ? 2 : 0),
})

register('Stupefy', {
  static: { reaction: true },
  ...unitSpell('Stupefy: quale unità ottiene -1 Might (minimo 1)?', 'harm', (g, _ctx, t) => {
    // "to a minimum of 1": la riduzione si ferma a 1 di Might
    const n = Math.max(0, Math.min(1, might(g, t) - 1))
    if (n) weaken(g, t, n, 'Stupefy')
    else log(g, `${t.card.name} ha già 1 Might o meno: Stupefy non la riduce.`, undefined, t.controller)
  }),
  resolve: function* (g, ctx) {
    for (const t of ctx.data.list as Obj[]) {
      if (!alive(g, t)) continue
      const n = Math.max(0, Math.min(1, might(g, t) - 1))
      if (n) weaken(g, t, n, 'Stupefy')
    }
    yield* draw(g, ctx.p, 1)
  },
  ai: (g, p) => (g.showdown?.combat && units(g).some((o) => o.controller !== p && inCombat(g, o)) ? 1 : 0),
})

register('Treasure Hoard', {
  bfConquer: {
    label: 'paga 1 per un Gold esausto',
    prepare: function* (g, ctx) {
      if (!canPay(g, ctx.p, { energy: 1, power: [] })) return false
      const yes = yield* yesNo(g, ctx.p, 'Treasure Hoard: paghi 1 energia per un token Gold?', true, { rule: '383.3.b' })
      if (!yes) return false
      pay(g, ctx.p, { energy: 1, power: [] })
      return true
    },
    resolve: function* (g, ctx) {
      yield* playToken(g, ctx.p, GOLD, baseOf(ctx.p), { exhausted: true })
    },
  },
})

register('Void Seeker', {
  static: { action: true },
  ...unitSpell('Void Seeker: a quale unità in un campo infliggi 4?', 'harm', (g, _ctx, t) => void deal(g, t, 4, 'Void Seeker'), (_g, o) => isBf(o.loc)),
  resolve: function* (g, ctx) {
    for (const t of ctx.data.list as Obj[]) if (alive(g, t) && isBf(t.loc)) deal(g, t, 4, 'Void Seeker')
    yield* draw(g, ctx.p, 1)
  },
  ai: (g, p) => (units(g).some((o) => o.controller !== p && isBf(o.loc) && might(g, o) - o.damage <= 4) ? 2 : 0),
})

register('Wages of Pain', {
  static: { hidden: true, action: true },
  ...unitSpell('Wages of Pain: a quale unità in un campo infliggi 3?', 'harm', () => {}, (_g, o) => isBf(o.loc)),
  resolve: function* (g, ctx) {
    for (const t of ctx.data.list as Obj[]) if (alive(g, t) && isBf(t.loc)) deal(g, t, 3, 'Wages of Pain')
    yield* playToken(g, ctx.p, GOLD, baseOf(ctx.p), { exhausted: true })
  },
  ai: (g, p) => (units(g).some((o) => o.controller !== p && isBf(o.loc) && might(g, o) - o.damage <= 3) ? 2 : 0),
})

register('Assembly Rig', {
  abilities: [
    {
      id: 'rig',
      label: 'Ricicla un’unità dal trash, esaurisci: token Mech',
      speed: 'normal',
      rule: '377.1',
      cost: () => ({ energy: 1, power: [['Fury']] }),
      can: (g, self) => self.zone === 'board' && !self.exhausted && g.players[self.controller].trash.some((u) => isUnit(g.objs.get(u)!)),
      payExtra: function* (g, self) {
        const list = g.players[self.controller].trash.map((u) => g.objs.get(u)!).filter(isUnit)
        const r = yield* choose(g, self.controller, 'Quale unità ricicli dal trash?', list.map((o) => ({ label: o.card.name, uid: o.uid, ai: -(o.card.energy ?? 0) })))
        if (!r) return false
        moveZone(g, list[r[0]], 'deck', { bottom: true })
        self.exhausted = true
        return true
      },
      resolve: function* (g, ctx) {
        yield* playToken(g, ctx.p, MECH, baseOf(ctx.p))
      },
    },
  ],
})
