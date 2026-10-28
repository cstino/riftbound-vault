// Carte del mazzo Vi (Unleashed). Stesse regole di cards.ts: testo stampato, regole citate, test in
// src/test/game-cards-vi.test.ts.
import type { Domain } from '../types'
import { DOMAINS } from '../types'
import { register } from './registry'
import {
  addMod,
  alive,
  baseOf,
  buffUnit,
  canPay,
  choose,
  chooseUnit,
  deal,
  draw,
  friendlyAt,
  isBf,
  kill,
  log,
  might,
  moveUnits,
  moveZone,
  pay,
  playToken,
  predict,
  stun,
  tokenCard,
  units,
  unitOption,
  yesNo,
} from './engine'
import { aiHarm, aiHelp, giveMight, inCombat, tokenLoc } from './cards'
import type { Obj } from './types'

const ANY: Domain[] = [...DOMAINS]

// 187.5 e 187.7
export const GOLD = tokenCard('Gold', null, [], '[Reaction][>] Kill this, [E]: [Add] [A].', 'Token Gear')
export const BIRD = tokenCard('Bird', 1, ['Bird'], '[Deflect]')

register('Gold', {})
register('Bird', { static: { deflect: 1 } })

/** Pronta un'unità (416). */
function ready(g: import('./types').Game, o: Obj) {
  if (!alive(g, o)) return
  o.exhausted = false
  log(g, `${o.card.name} viene preparata.`, '416', o.controller)
}

register('Vi - Piltover Enforcer', {
  playerConquer: {
    label: 'esaurisci me per preparare un’unità',
    when: (g, self) => g.excess[self.controller] >= 3 && !self.exhausted,
    prepare: function* (g, ctx) {
      // 383.3.b: il costo dopo "you may" si paga alla finalizzazione
      const yes = yield* yesNo(g, ctx.p, 'Vi: hai assegnato 3 o più danni in eccesso. Esaurisci la Legend per preparare un’unità?', true)
      if (!yes) return false
      const t = yield* chooseUnit(g, ctx, 'Quale unità prepari?', () => true, (o) => (o.controller === ctx.p ? (o.exhausted ? 10 : 1) + might(g, o) : -10))
      if (!t) return false
      ctx.self.exhausted = true
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      ready(g, ctx.data.t as Obj)
    },
  },
})

register('Vi, Destructive', {
  static: { ganking: true },
  abilities: [
    {
      id: 'vi-recycle',
      label: 'Ricicla 1 dal trash: +1 Might',
      speed: 'normal',
      rule: '417.3',
      cost: () => ({ energy: 0, power: [] }),
      can: (g, self) => self.zone === 'board' && g.players[self.controller].trash.length > 0,
      payExtra: function* (g, self) {
        const trash = g.players[self.controller].trash.map((u) => g.objs.get(u)!)
        const r = yield* choose(g, self.controller, 'Quale carta ricicli dal trash?', trash.map((o) => ({ label: o.card.name, uid: o.uid, ai: -(o.card.energy ?? 0) })))
        if (!r) return false
        moveZone(g, trash[r[0]], 'deck', { bottom: true })
        log(g, `Ricicla ${trash[r[0]].card.name} dal trash.`, '417', self.controller)
        return true
      },
      resolve: function* (g, ctx) {
        giveMight(g, ctx.self, 1, 'Vi, Destructive')
      },
    },
  ],
})

register('Vi, Hotheaded', {
  static: { deflect: 1 },
  abilities: [
    {
      id: 'vi-double',
      label: 'Raddoppia la mia Might',
      speed: 'normal',
      rule: '433.1',
      cost: () => ({ energy: 2, power: [['Fury']] }),
      can: (_g, self) => self.zone === 'board',
      resolve: function* (g, ctx) {
        if (!alive(g, ctx.self)) return
        // 433.1: raddoppiare aumenta di un valore pari a quello attuale
        giveMight(g, ctx.self, Math.max(0, might(g, ctx.self)), 'Vi, Hotheaded')
      },
    },
  ],
})

register('Vi, Peacekeeper', {
  static: { ambush: true },
  attack: {
    label: 'stordisci un’unità nemica qui',
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Vi: quale unità nemica stordisci?', (o) => o.controller !== ctx.p && o.loc === ctx.self.loc, aiHarm(ctx, g))
      if (!t) return false
      if (ctx.extraPower) pay(g, ctx.p, { energy: 0, power: Array(ctx.extraPower).fill(ANY) })
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (alive(g, t)) stun(g, t)
    },
  },
})

register('Vault Breaker', {
  static: { action: true },
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Vault Breaker: quale unità ottiene Assault 2 e Ganking?', () => true, aiHelp(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (!alive(g, t)) return
    addMod(t, { source: 'Vault Breaker', assault: 2, ganking: true })
    log(g, `${t.card.name} ottiene [Assault 2] e [Ganking] in questo turno.`, '807', ctx.p)
  },
  ai: (g, p) => (g.phase === 'main' && !g.showdown && units(g).some((o) => o.controller === p && !o.exhausted) ? 1 : 0),
})

register('Inferna', { static: { ambush: true, assault: 2 } })

register('Crimson Pigeons', {
  might: (g, self) => (self.role === 'attacker' && friendlyAt(g, self.controller, self.loc).some((o) => o !== self && o.role === 'attacker') ? 2 : 0),
})

register('Sharkling', { static: { accelerate: true, assault: 4 } })

register('Square Up', {
  repeat: { discard: 1 },
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const list: Obj[] = []
    for (let i = 0; i < (ctx.repeat ? 2 : 1); i++) {
      const t = yield* chooseUnit(g, ctx, `Square Up${ctx.repeat ? ` (${i + 1} di 2)` : ''}: quale unità ottiene Assault 4?`, () => true, aiHelp(ctx, g), { cancel: true })
      if (!t) return false
      list.push(t)
    }
    ctx.data.list = list
    return true
  },
  resolve: function* (g, ctx) {
    for (const t of ctx.data.list as Obj[]) {
      if (!alive(g, t)) continue
      addMod(t, { source: 'Square Up', assault: 4 })
      log(g, `${t.card.name} ottiene [Assault 4] in questo turno.`, '807', ctx.p)
    }
  },
  ai: (g, p) => (g.phase === 'main' && !g.showdown && units(g).some((o) => o.controller === p && !o.exhausted) ? 1 : 0),
})

register('Hextech Gauntlets', {
  equip: [],
  // [Equip] [3][A], ridotto della Might dell'unità scelta
  equipCost: (g, self, unit) => {
    const best = unit ? might(g, unit) : Math.max(0, ...units(g).filter((u) => u.controller === self.controller).map((u) => might(g, u)))
    return { energy: Math.max(0, 3 - best), power: [ANY] }
  },
})

register('Right of Conquest', {
  resolve: function* (g, ctx) {
    const n = 1 + g.bfs.filter((b) => b.controller === ctx.p).length
    yield* draw(g, ctx.p, n)
    log(g, `Pesca ${n} carte.`, undefined, ctx.p)
  },
  ai: (g, p) => (g.bfs.some((b) => b.controller === p) ? 1 : 0.5),
})

register('Arena Kingpin', {
  entersReady: () => true,
  abilities: [
    {
      id: 'kingpin',
      label: 'Esaurisci: un’unità ottiene +3 Might',
      speed: 'normal',
      rule: '415.5',
      cost: () => ({ energy: 0, power: [] }),
      can: (_g, self) => self.zone === 'board' && !self.exhausted,
      prepare: function* (g, ctx) {
        const t = yield* chooseUnit(g, ctx, 'Quale unità ottiene +3 Might?', () => true, aiHelp(ctx, g), { cancel: true })
        if (!t) return false
        ctx.data.t = t
        return true
      },
      payExtra: function* (_g, self) {
        self.exhausted = true
        return true
      },
      resolve: function* (g, ctx) {
        giveMight(g, ctx.data.t as Obj, 3, 'Arena Kingpin')
      },
    },
  ],
})

register('Lord Broadmane', {
  static: { ambush: true },
  play: {
    label: 'le tue altre unità qui ottengono Assault',
    resolve: function* (g, ctx) {
      for (const o of friendlyAt(g, ctx.p, ctx.self.loc)) {
        if (o === ctx.self) continue
        addMod(o, { source: 'Lord Broadmane', assault: 1 })
        log(g, `${o.card.name} ottiene [Assault] in questo turno.`, '807', ctx.p)
      }
    },
  },
})

register('Towering Pairofant', {
  static: { assault: 1 },
  entersReady: (g) => g.diedThisTurn > 0,
})

register('Yeti Brawler', {
  conquer: {
    label: 'gioca due Gold esausti',
    when: (g, self) => g.excess[self.controller] >= 3,
    resolve: function* (g, ctx) {
      yield* playToken(g, ctx.p, GOLD, baseOf(ctx.p), { exhausted: true })
      yield* playToken(g, ctx.p, GOLD, baseOf(ctx.p), { exhausted: true })
    },
  },
})

register('Carrion Dredger', {
  deathknell: {
    label: 'gioca un token Bird nella base',
    resolve: function* (g, ctx) {
      yield* playToken(g, ctx.p, BIRD, baseOf(ctx.p))
    },
  },
})

register('Rengar, Unseen', { static: { accelerate: true, assault: 2, deflect: 1, ganking: true } })

register('Serrated Dirk', { equip: ['Fury'] })

register('Tactical Retreat', {
  static: { reaction: true },
  canPlay: (g, ctx) => units(g).some((o) => o.controller === ctx.p),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Tactical Retreat: quale unità amica proteggi?', (o) => o.controller === ctx.p, aiHelp(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (!alive(g, t)) return
    addMod(t, { source: 'Tactical Retreat', retreat: true })
    log(g, `Se ${t.card.name} morisse in questo turno, invece guarisce, si esaurisce e torna nella base.`, '367', ctx.p)
  },
  ai: (g, p) => (g.showdown?.combat && units(g).some((o) => o.controller === p && inCombat(g, o)) ? 1 : 0),
})

register('Divining Shells', {
  // 817: Vision = "When this is played, Predict"
  play: {
    label: 'Vision: Predict',
    resolve: function* (g, ctx) {
      yield* predict(g, ctx.p, 1)
    },
  },
  abilities: [
    {
      id: 'shells',
      label: 'Uccidi ed esaurisci: un’unità ottiene +2 Might',
      speed: 'action',
      rule: '806.1.c.2',
      cost: () => ({ energy: 0, power: [] }),
      can: (g, self) => self.zone === 'board' && !self.exhausted && units(g).length > 0,
      prepare: function* (g, ctx) {
        const t = yield* chooseUnit(g, ctx, 'Quale unità ottiene +2 Might?', () => true, aiHelp(ctx, g), { cancel: true })
        if (!t) return false
        ctx.data.t = t
        return true
      },
      payExtra: function* (g, self) {
        self.exhausted = true
        yield* kill(g, [self], 'costo di Divining Shells')
        return true
      },
      resolve: function* (g, ctx) {
        giveMight(g, ctx.data.t as Obj, 2, 'Divining Shells')
      },
    },
  ],
})

register('Mageseeker Investigator', {}) // la tassa sul movimento è nel movimento standard (engine.ts)

register('Xerath, Freed', {
  abilities: [
    {
      id: 'xerath',
      label: 'Esaurisci: infliggi 3 a un’unità',
      speed: 'normal',
      rule: '415.5',
      cost: () => ({ energy: 0, power: [['Fury']] }),
      can: (g, self) => self.zone === 'board' && !self.exhausted && isBf(self.loc) && units(g).length > 0,
      prepare: function* (g, ctx) {
        const t = yield* chooseUnit(g, ctx, 'Xerath: a quale unità infliggi 3?', () => true, aiHarm(ctx, g), { cancel: true })
        if (!t) return false
        ctx.data.t = t
        return true
      },
      payExtra: function* (_g, self) {
        self.exhausted = true
        return true
      },
      resolve: function* (g, ctx) {
        const t = ctx.data.t as Obj
        if (alive(g, t)) deal(g, t, 3, 'Xerath')
      },
    },
  ],
})

register('Upstage Comedy', {
  repeat: { energy: 2 },
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const list: Obj[] = []
    for (let i = 0; i < (ctx.repeat ? 2 : 1); i++) {
      const t = yield* chooseUnit(g, ctx, `Upstage Comedy${ctx.repeat ? ` (${i + 1} di 2)` : ''}: quale unità prepari?`, () => true, (o) => (o.controller === ctx.p && o.exhausted ? 10 + might(g, o) : -10), { cancel: true })
      if (!t) return false
      list.push(t)
    }
    ctx.data.list = list
    return true
  },
  resolve: function* (g, ctx) {
    for (const t of ctx.data.list as Obj[]) ready(g, t)
  },
  ai: (g, p) => (g.phase === 'main' && !g.showdown && units(g).some((o) => o.controller === p && o.exhausted && (o.card.might ?? 0) >= 4) ? 1 : 0),
})

register('Soul Harvest', {
  canPlay: (g) => units(g).some((o) => isBf(o.loc) && might(g, o) <= 3),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Soul Harvest: quale unità in un campo con 3 Might o meno uccidi?', (o) => isBf(o.loc) && might(g, o) <= 3, aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (alive(g, t) && isBf(t.loc) && might(g, t) <= 3) yield* kill(g, [t], 'Soul Harvest')
  },
  ai: (g, p) => (units(g).some((o) => o.controller !== p && isBf(o.loc) && might(g, o) <= 3) ? 2 : 0),
})

register('Trapping Grounds', {
  bfConquer: {
    label: 'gioca un token Bird',
    when: (g, self) => g.excess[self.controller] >= 3,
    resolve: function* (g, ctx) {
      yield* playToken(g, ctx.p, BIRD, yield* tokenLoc(g, ctx))
    },
  },
})

register('Star Spring', {
  bfUnitPlayed: {
    label: 'puoi muovere un’altra tua unità di qui alla sua base',
    prepare: function* (g, ctx) {
      const unit = ctx.data.unit as Obj
      const key = `star-spring-${ctx.p}`
      if (unit.token || g.turnFlags.has(key)) return false // "the first time ... a non-token unit"
      g.turnFlags.add(key)
      const others = friendlyAt(g, ctx.p, unit.loc).filter((o) => o !== unit)
      if (!others.length) return false
      const r = yield* choose(g, ctx.p, 'Star Spring: muovi un’altra tua unità di qui alla sua base?', others.map((o) => unitOption(g, o, 0, ctx.p)), 0, 1, { rule: '421' })
      if (!r?.length) return false
      ctx.data.t = others[r[0]]
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (alive(g, t)) yield* moveUnits(g, [t], baseOf(t.controller), 'Star Spring', '421')
    },
  },
})

register('Valley of Idols', {
  bfUnitPlayed: {
    label: 'puoi pagare 1 per dare un buff all’unità',
    prepare: function* (g, ctx) {
      const unit = ctx.data.unit as Obj
      if (unit.buff || !canPay(g, ctx.p, { energy: 1, power: [] })) return false
      const yes = yield* yesNo(g, ctx.p, `Valley of Idols: paghi 1 energia per dare un buff a ${unit.card.name}?`, true, { rule: '383.3.b' })
      if (!yes) return false
      pay(g, ctx.p, { energy: 1, power: [] })
      return true
    },
    resolve: function* (g, ctx) {
      buffUnit(g, ctx.data.unit as Obj)
    },
  },
})
