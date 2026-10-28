// Carte del mazzo Fiora (Champion Deck). Test in src/test/game-cards-fiora.test.ts.
import { register, type TrigDef } from './registry'
import {
  addMod,
  alive,
  attach,
  board,
  buffUnit,
  canPay,
  channel,
  choose,
  chooseUnit,
  counter,
  deal,
  draw,
  equipCostOf,
  friendlyAt,
  isBf,
  isGear,
  kill,
  log,
  might,
  pay,
  playToken,
  tokenCard,
  units,
  yesNo,
} from './engine'
import { aiHarm, aiHelp, giveMight } from './cards'
import { DOMAINS } from '../types'
import type { Game, Obj, PID } from './types'

export const SAND_SOLDIER = tokenCard('Sand Soldier', 2, ['Shurima'], '') // 187.3
register('Sand Soldier', {})

const mighty = (g: Game, o: Obj) => might(g, o) >= 5 // 708
const mightyCount = (g: Game, p: PID) => units(g).filter((o) => o.controller === p && mighty(g, o)).length
const isEquipment = (o: Obj) => isGear(o) && o.card.tags.includes('Equipment')
const ready = (g: Game, o: Obj) => {
  if (!alive(g, o)) return
  o.exhausted = false
  log(g, `${o.card.name} viene preparata.`, '416', o.controller)
}

/**
 * 821 Weaponmaster: "When you play me, you may choose an Equipment you control. Pay the cost of its
 * Equip ability, reduced by [A], to attach it to this unit."
 */
const WEAPONMASTER: TrigDef = {
  label: 'Weaponmaster',
  prepare: function* (g, ctx) {
    const gear = board(g).filter((o) => o.controller === ctx.p && isEquipment(o) && o.attachedTo !== ctx.self.uid)
    const costs = gear.map((o) => reduced(equipCostOf(g, o, ctx.self)))
    const ok = gear.filter((_, i) => costs[i] && canPay(g, ctx.p, costs[i]!))
    if (!ok.length) return false
    const r = yield* choose(g, ctx.p, `Weaponmaster: quale equipaggiamento attacchi a ${ctx.self.card.name}?`, ok.map((o) => ({ label: o.card.name, uid: o.uid, detail: o.attachedTo !== null ? 'già attaccato' : 'nella base', ai: (o.card.might ?? 0) + (o.attachedTo === null ? 1 : 0) })), 0, 1, { rule: '821.1.c' })
    if (!r?.length) return false
    ctx.data.gear = ok[r[0]]
    return true
  },
  resolve: function* (g, ctx) {
    const gear = ctx.data.gear as Obj
    const cost = reduced(equipCostOf(g, gear, ctx.self))
    // 821.1.c.5: se non si può pagare o attaccare, resta dov'è
    if (!cost || !alive(g, gear) || !alive(g, ctx.self) || !canPay(g, ctx.p, cost)) return
    pay(g, ctx.p, cost)
    attach(g, gear, ctx.self)
  },
}

/** 821.1.c.3: si toglie un [A] dal costo di Equip, se c'è. */
function reduced(c: ReturnType<typeof equipCostOf>) {
  if (!c) return null
  const i = c.power.findIndex((d) => d.length === DOMAINS.length)
  return i < 0 ? c : { energy: c.energy, power: c.power.filter((_, j) => j !== i) }
}

register('Fiora - Grand Duelist', {
  allyMighty: {
    label: 'esaurisci me per canalizzare 1 runa esausta',
    when: (_g, self) => !self.exhausted,
    prepare: function* (g, ctx) {
      // 383.3.b: "you may exhaust me" si decide e si paga alla finalizzazione
      if (ctx.self.exhausted || !(yield* yesNo(g, ctx.p, 'Fiora: esaurisci la Legend per canalizzare 1 runa esausta?', true))) return false
      ctx.self.exhausted = true
      return true
    },
    resolve: function* (g, ctx) {
      yield* channel(g, ctx.p, 1, true)
    },
  },
})

const peerless: TrigDef = {
  label: 'one on one: raddoppia la mia Might in questo combattimento',
  // 740.2.b: lei e l'unità nemica nello stesso posto sono entrambe sole
  when: (g, self) => {
    const enemies = units(g).filter((o) => o.loc === self.loc && o.controller !== self.controller)
    return friendlyAt(g, self.controller, self.loc).length === 1 && enemies.length === 1
  },
  resolve: function* (g, ctx) {
    if (!alive(g, ctx.self)) return
    const n = might(g, ctx.self)
    addMod(ctx.self, { source: 'Fiora, Peerless', might: n, combat: true })
    log(g, `Fiora, Peerless raddoppia la sua Might (${n} → ${n * 2}) in questo combattimento.`, undefined, ctx.p)
  },
}
register('Fiora, Peerless', { attack: peerless, defend: peerless })

register('Fiora, Worthy', {
  allyMighty: {
    label: 'paga 1 Order per prepararla',
    when: (g, self) => self.zone === 'board' && canPay(g, self.controller, { energy: 0, power: [['Order']] }),
    prepare: function* (g, ctx) {
      const u = ctx.data.unit as Obj
      if (!u.exhausted || !canPay(g, ctx.p, { energy: 0, power: [['Order']] })) return false
      if (!(yield* yesNo(g, ctx.p, `Fiora, Worthy: paghi 1 Order per preparare ${u.card.name}?`, true))) return false
      pay(g, ctx.p, { energy: 0, power: [['Order']] })
      return true
    },
    resolve: function* (g, ctx) {
      ready(g, ctx.data.unit as Obj)
    },
  },
})

register('Lucian, Merciless', {
  play: WEAPONMASTER,
  conquer: {
    label: 'la prima volta che conquisto nel turno, mi preparo',
    when: (g, self) => !g.turnFlags.has(`lucian-${self.uid}`),
    prepare: function* (g, ctx) {
      g.turnFlags.add(`lucian-${ctx.self.uid}`)
      return true
    },
    resolve: function* (g, ctx) {
      ready(g, ctx.self)
    },
  },
})

register('Yone, Blademaster', {
  play: WEAPONMASTER,
  conquer: {
    label: 'danni pari alla mia Might a un’unità nemica in una base',
    when: (g) => units(g).some((o) => !isBf(o.loc)),
    prepare: function* (g, ctx) {
      if (!ctx.data.open) return false
      const t = yield* chooseUnit(g, ctx, 'Yone: a quale unità nemica in una base infliggi danni?', (o) => o.controller !== ctx.p && !isBf(o.loc), aiHarm(ctx, g))
      if (!t) return false
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (alive(g, t)) deal(g, t, might(g, ctx.self), 'Yone, Blademaster')
    },
  },
})

register('Veteran Poro', { play: WEAPONMASTER })

register('Jaull-Fish', {
  static: { accelerate: true },
  discount: (g, p) => ({ energy: 2 * mightyCount(g, p) }),
})

register('Laurent Duelist', { static: { assault: 2 } })

register('Pit Rookie', {
  play: {
    label: 'buff a un’altra tua unità',
    when: (g, self) => units(g).some((o) => o.controller === self.controller && o !== self),
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Pit Rookie: quale altra tua unità riceve un buff?', (o) => o.controller === ctx.p && o !== ctx.self, (o) => (o.buff ? 0 : 10 + might(g, o)))
      if (!t) return false
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      buffUnit(g, ctx.data.t as Obj)
    },
  },
})

register('Dauntless Vanguard', {
  // "You may play me to an occupied enemy battlefield."
  extraLocs: (g, p) => g.bfs.filter((b) => b.controller !== null && b.controller !== p && units(g).some((o) => o.loc === b.loc)).map((b) => b.loc),
})

register('Unsung Hero', {
  deathknell: {
    label: 'se ero Mighty, pesca 2',
    prepare: function* (_g, ctx) {
      return !!ctx.data.mighty
    },
    resolve: function* (g, ctx) {
      yield* draw(g, ctx.p, 2)
    },
  },
})

register('Royal Guard', {
  play: {
    label: 'gioca qui un token Sand Soldier da 2',
    resolve: function* (g, ctx) {
      if (ctx.self.loc) yield* playToken(g, ctx.p, SAND_SOLDIER, ctx.self.loc)
    },
  },
})

register('Punch First', {
  static: { action: true },
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Punch First: quale unità ottiene +5 Might?', () => true, aiHelp(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    giveMight(g, ctx.data.t as Obj, 5, 'Punch First')
  },
  ai: (g, p) => (g.showdown?.combat && units(g).some((o) => o.controller === p && o.loc === g.showdown!.loc) ? 1 : 0),
})

const equipped = (g: Game, o: Obj) => board(g).some((x) => x.attachedTo === o.uid && isEquipment(x))

register('Strike Down', {
  canPlay: (g, ctx) => units(g).some((o) => o.controller === ctx.p && equipped(g, o)) && units(g).some((o) => o.controller !== ctx.p),
  prepare: function* (g, ctx) {
    const a = yield* chooseUnit(g, ctx, 'Strike Down: quale tua unità equipaggiata colpisce?', (o) => o.controller === ctx.p && equipped(g, o), (o) => might(g, o), { cancel: true })
    if (!a) return false
    const t = yield* chooseUnit(g, ctx, `Strike Down: a quale unità nemica ${a.card.name} infligge danni?`, (o) => o.controller !== ctx.p, aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.a = a
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const a = ctx.data.a as Obj
    const t = ctx.data.t as Obj
    if (!alive(g, a)) return
    if (alive(g, t)) deal(g, t, might(g, a), 'Strike Down')
    // "Then detach an Equipment from it" (436): resta nel posto dell'unità
    const gear = board(g).filter((x) => x.attachedTo === a.uid && isEquipment(x))
    if (!gear.length) return
    const r = gear.length === 1 ? [0] : yield* choose(g, ctx.p, 'Strike Down: quale equipaggiamento stacchi?', gear.map((x) => ({ label: x.card.name, uid: x.uid, ai: -(x.card.might ?? 0) })), 1, 1, { rule: '436' })
    const x = gear[r?.[0] ?? 0]
    x.attachedTo = null
    log(g, `${x.card.name} si stacca da ${a.card.name}.`, '436.4', ctx.p)
  },
  ai: () => 1,
})

register('Vengeance', {
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Vengeance: quale unità uccidi?', () => true, aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (alive(g, t)) yield* kill(g, [t], 'Vengeance')
  },
  ai: (g, p) => (units(g).some((o) => o.controller !== p && might(g, o) >= 4) ? 1 : 0),
})

register('Riposte', {
  static: { reaction: true },
  canPlay: (g, ctx) => units(g).some((o) => o.controller === ctx.p) && g.chain.some((c) => c.kind === 'spell'),
  prepare: function* (g, ctx) {
    const u = yield* chooseUnit(g, ctx, 'Riposte: quale tua unità?', (o) => o.controller === ctx.p, aiHelp(ctx, g), { cancel: true })
    if (!u) return false
    const spells = g.chain.filter((c) => c.kind === 'spell')
    const r = yield* choose(g, ctx.p, 'Riposte: quale magia annulli?', spells.map((c) => ({ label: c.label, ai: c.controller !== ctx.p ? 10 : -10 })), 1, 1, { cancel: true, rule: '426.3' })
    if (!r) return false
    const item = spells[r[0]]
    const card = item.card !== undefined ? g.objs.get(item.card) : undefined
    ctx.data.u = u
    ctx.data.id = item.id
    ctx.data.energy = card?.card.energy ?? 0
    return true
  },
  resolve: function* (g, ctx) {
    if (!g.chain.some((c) => c.id === ctx.data.id)) return
    counter(g, ctx.data.id as number)
    const u = ctx.data.u as Obj
    if (alive(g, u)) giveMight(g, u, ctx.data.energy as number, 'Riposte')
  },
  ai: (g, p) => (g.chain.some((c) => c.kind === 'spell' && c.controller !== p) ? 1 : 0),
})

register('Show of Strength', {
  static: { reaction: true },
  resolve: function* (g, ctx) {
    const n = mightyCount(g, ctx.p)
    log(g, `Show of Strength: ${n} unità Mighty.`, '708', ctx.p)
    yield* draw(g, ctx.p, n)
  },
  ai: (g, p) => (mightyCount(g, p) >= 2 ? 1 : 0),
})

register('B.F. Sword', { equip: ['Order'] })
register("Warmog's Armor", { equip: ['Body'] })
register('Sacred Shears', { equip: ['Order'] })
register("Doran's Blade", { equip: ['Body'] })

register("Ornn's Forge", { bfGearDiscount: 1 })

register('Veiled Temple', {
  bfConquer: {
    label: 'puoi preparare un tuo gear (e staccarlo, se è un equipaggiamento)',
    when: (g, self) => board(g).some((o) => o.controller === self.controller && isGear(o)),
    prepare: function* (g, ctx) {
      const gear = board(g).filter((o) => o.controller === ctx.p && isGear(o))
      const r = yield* choose(g, ctx.p, 'Veiled Temple: quale gear prepari?', gear.map((o) => ({ label: o.card.name, uid: o.uid, ai: o.exhausted ? 1 : 0 })), 0, 1, { rule: '416' })
      if (!r?.length) return false
      ctx.data.gear = gear[r[0]]
      return true
    },
    resolve: function* (g, ctx) {
      const x = ctx.data.gear as Obj
      if (!alive(g, x)) return
      ready(g, x)
      if (isEquipment(x) && x.attachedTo !== null && (yield* yesNo(g, ctx.p, `Stacchi ${x.card.name}?`, false))) {
        x.attachedTo = null
        log(g, `${x.card.name} si stacca.`, '436.4', ctx.p)
      }
    },
  },
})

register('Sunken Temple', {
  bfConquer: {
    label: 'con una tua unità Mighty qui, puoi pagare 1 energia per pescare 1',
    prepare: function* (g, ctx) {
      const loc = ctx.data.loc as Obj['loc']
      if (!units(g).some((o) => o.controller === ctx.p && o.loc === loc && mighty(g, o))) return false
      // 740.4.a.2: il costo nella prima parte dell'effetto si paga alla finalizzazione
      if (!canPay(g, ctx.p, { energy: 1, power: [] })) return false
      if (!(yield* yesNo(g, ctx.p, 'Sunken Temple: paghi 1 energia per pescare 1?', true))) return false
      pay(g, ctx.p, { energy: 1, power: [] })
      return true
    },
    resolve: function* (g, ctx) {
      yield* draw(g, ctx.p, 1)
    },
  },
})
