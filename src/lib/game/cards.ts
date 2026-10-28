// Carte implementate nel motore. Ogni abilità riprende il testo stampato e cita le regole usate.
// Per aggiungere una carta: implementarla qui e aggiungere i suoi test in src/test/game-cards.test.ts.
import type { Domain } from '../types'
import { DOMAINS } from '../types'
import type { Ctx } from './registry'
import { register, type CardImpl, type TrigDef } from './registry'
import {
  addEnergy,
  addMod,
  alive,
  banish,
  baseOf,
  bfAt,
  bfName,
  burn,
  canPay,
  choose,
  chooseUnit,
  deal,
  discard,
  draw,
  effectDests,
  empower,
  friendlyAt,
  gainPoints,
  isBf,
  isUnit,
  kill,
  kw,
  locName,
  log,
  might,
  moveUnits,
  moveZone,
  pay,
  playToken,
  returnToHand,
  stun,
  targetable,
  tokenCard,
  units,
  unitsAt,
  yesNo,
} from './engine'
import type { Game, LocId, Obj, PID } from './types'

const ANY: Domain[] = [...DOMAINS]

// 187.11 e 187.1: caratteristiche dei token
export const SHADOW_CLONE = tokenCard(
  'Shadow Clone',
  0,
  [],
  'When I attack, you may banish a unit from your trash. If you do, give me [Assault 4] this turn.',
)
export const RECRUIT = tokenCard('Recruit', 1, ['Recruit'], '')

const enemyOf = (ctx: Ctx) => (o: Obj) => o.controller !== ctx.p
const mine = (ctx: Ctx) => (o: Obj) => o.controller === ctx.p
export const inCombat = (g: Game, o: Obj) => !!g.showdown?.combat && o.loc === g.showdown.loc

/** Il PC preferisce bersagliare unità nemiche forti con effetti dannosi e unità proprie con quelli utili. */
export const aiHarm = (ctx: Ctx, g: Game) => (o: Obj) => (o.controller !== ctx.p ? 10 + might(g, o) : -10)
export const aiHelp = (ctx: Ctx, g: Game) => (o: Obj) => (o.controller === ctx.p ? 10 + might(g, o) + (inCombat(g, o) ? 20 : 0) : -10)

function trashOf(g: Game, p: PID) {
  return g.players[p].trash.map((u) => g.objs.get(u)!)
}

/** Posizione per un token senza destinazione indicata: base o campo controllato (355.2.a); da nascosta, quel campo (811.1.d.5). */
export function* tokenLoc(g: Game, ctx: Ctx): Generator<import('./types').Decision, LocId, import('./types').Answer> {
  if (ctx.hiddenAt) return ctx.hiddenAt
  const locs: LocId[] = [baseOf(ctx.p), ...g.bfs.filter((b) => b.controller === ctx.p).map((b) => b.loc)]
  if (locs.length === 1) return locs[0]
  const r = yield* choose(g, ctx.p, 'Dove giochi il token?', locs.map((l) => ({ label: locName(g, l, ctx.p), loc: l, ai: isBf(l) ? 1 : 0 })), 1, 1, { rule: '355.2.a' })
  return locs[r?.[0] ?? 0]
}

function* playShadowClone(g: Game, ctx: Ctx, loc?: LocId) {
  yield* playToken(g, ctx.p, SHADOW_CLONE, loc ?? (yield* tokenLoc(g, ctx)))
}

export function giveMight(g: Game, o: Obj, n: number, source: string) {
  if (!alive(g, o)) return
  addMod(o, { source, might: n })
  log(g, `${o.card.name} ottiene ${n > 0 ? '+' : ''}${n} Might in questo turno.`, undefined, o.controller)
}

/** Sceglie una destinazione valida per un movimento causato da un effetto (355.4). */
function* chooseDest(g: Game, ctx: Ctx, o: Obj, aiPrefer: (l: LocId) => number) {
  const dests = effectDests(g, o)
  const r = yield* choose(g, ctx.p, `Dove sposti ${o.card.name}?`, dests.map((l) => ({ label: locName(g, l, ctx.p), loc: l, ai: aiPrefer(l) })), 1, 1, { cancel: true, rule: '355.4' })
  return r ? dests[r[0]] : null
}

// ---------------------------------------------------------------- rune e token

for (const r of ['Fury Rune', 'Calm Rune', 'Mind Rune', 'Body Rune', 'Chaos Rune', 'Order Rune']) register(r, {}) // 164.2

register('Recruit', {})
register('Shadow Clone', {
  attack: {
    label: 'esili un’unità dal tuo trash: Assault 4',
    prepare: function* (g, ctx) {
      // 383.3.a: "you may" all'inizio dell'effetto si decide alla finalizzazione
      if (!trashOf(g, ctx.p).some((o) => isUnit(o))) return false
      return !!(yield* yesNo(g, ctx.p, 'Shadow Clone: esili un’unità dal tuo trash per dargli [Assault 4]?', true, { rule: '187.11' }))
    },
    resolve: function* (g, ctx) {
      const cands = trashOf(g, ctx.p).filter((o) => isUnit(o))
      if (!cands.length) return
      const r = yield* choose(g, ctx.p, 'Quale unità esili dal trash?', cands.map((o) => ({ label: o.card.name, uid: o.uid, ai: -(o.card.energy ?? 0) })))
      yield* banish(g, cands[r?.[0] ?? 0], ctx.p)
      if (alive(g, ctx.self)) {
        addMod(ctx.self, { source: 'Shadow Clone', assault: 4 })
        log(g, 'Shadow Clone ottiene [Assault 4] in questo turno.', '807', ctx.p)
      }
    },
  },
})

// ---------------------------------------------------------------- Zed (Vendetta Showdown)

register('Zed - Master of Shadows', {
  banishOwn: {
    label: 'empower me',
    resolve: function* (g, ctx) {
      empower(g, g.objs.get(ctx.self.uid) ?? ctx.self)
    },
  },
  abilities: [
    {
      id: 'zed-legend',
      label: 'Disempower, esaurisci: scarta 1, poi pesca 1',
      speed: 'action',
      rule: '806.1.c.2',
      cost: () => ({ energy: 0, power: [] }),
      can: (_g, self) => self.empowered && !self.exhausted,
      payExtra: function* (_g, self) {
        self.empowered = false // 443
        self.exhausted = true // 415
        return true
      },
      resolve: function* (g, ctx) {
        yield* discard(g, ctx.p, 1)
        yield* draw(g, ctx.p, 1)
      },
    },
  ],
})

register('Zed, Without a Sound', {
  conquer: {
    label: 'gioca un token Shadow Clone nella base',
    resolve: function* (g, ctx) {
      yield* playShadowClone(g, ctx, baseOf(ctx.p))
    },
  },
  abilities: [
    {
      id: 'zed-swap',
      label: 'Scambia posto con uno Shadow Clone',
      speed: 'action',
      rule: '806.1.c.2',
      cost: () => ({ energy: 1, power: [['Chaos']] }),
      can: (g, self) => units(g).some((u) => u.controller === self.controller && u.card.name === 'Shadow Clone' && u.loc !== self.loc),
      prepare: function* (g, ctx) {
        const c = yield* chooseUnit(g, ctx, 'Con quale Shadow Clone scambi posto?', (u) => mine(ctx)(u) && u.card.name === 'Shadow Clone' && u.loc !== ctx.self.loc, (u) => (isBf(u.loc) ? 1 : 0), { cancel: true })
        if (!c) return false
        ctx.data.clone = c
        return true
      },
      resolve: function* (g, ctx) {
        const c = ctx.data.clone as Obj
        if (!alive(g, ctx.self) || !alive(g, c) || c.controller !== ctx.p) return
        const a = ctx.self.loc!
        const b = c.loc!
        yield* moveUnits(g, [ctx.self], b, 'abilità di Zed', '421')
        yield* moveUnits(g, [c], a, 'abilità di Zed', '421')
      },
    },
  ],
})

register('Zed, From the Shadows', {
  optional: { label: 'scarti 1 carta come costo aggiuntivo', discard: 1 },
  play: {
    label: 'gioca un token Shadow Clone',
    prepare: function* (_g, ctx) {
      return !!ctx.data.paid // 383.2.a.1: "if you paid the additional cost"
    },
    resolve: function* (g, ctx) {
      yield* playShadowClone(g, ctx)
    },
  },
})

register('Mel, Defiant Soul', {
  empower: { discard: 'spell' },
  empowered: {
    label: 'esilia un’unità nemica con 3 Might o meno in un campo',
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Mel: quale unità nemica esili?', (o) => enemyOf(ctx)(o) && isBf(o.loc) && might(g, o) <= 3, aiHarm(ctx, g))
      if (!t) return false // 355.8: senza bersagli validi non va sulla catena
      if (ctx.extraPower) pay(g, ctx.p, { energy: 0, power: Array(ctx.extraPower).fill(ANY) })
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (alive(g, t) && t.controller !== ctx.p && isBf(t.loc) && might(g, t) <= 3) yield* banish(g, t, ctx.p)
    },
  },
})

register('Morgana, Vindictive', {
  static: { ambush: true },
  play: {
    label: 'infligge a un’unità danni pari a quelli che ha già',
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Morgana: scegli un’unità', () => true, (o) => (o.controller !== ctx.p ? o.damage * 10 : -10))
      if (!t) return false
      if (ctx.extraPower) pay(g, ctx.p, { energy: 0, power: Array(ctx.extraPower).fill(ANY) })
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (alive(g, t) && t.damage > 0) deal(g, t, t.damage, 'Morgana')
    },
  },
})

register('Death Mark', {
  flow: { energy: 1, power: [ANY, ANY] },
  resolve: function* (g, ctx) {
    yield* burn(g, ctx.p, 3)
    yield* playShadowClone(g, ctx)
  },
  ai: () => 1,
})

register('Twilight Reveler', {
  attack: {
    label: 'prepara un’altra unità amica',
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Twilight Reveler: quale unità amica prepari?', (o) => mine(ctx)(o) && o !== ctx.self, (o) => (o.exhausted ? 10 + might(g, o) : 0))
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

/** Magia che sposta un'unità scelta: bersaglio e destinazione si scelgono quando si gioca (355.4). */
function moveSpell(filter: (g: Game, ctx: Ctx, o: Obj) => boolean, title: string, after?: (g: Game, ctx: Ctx, o: Obj) => void): Pick<CardImpl, 'canPlay' | 'prepare' | 'resolve'> {
  return {
    canPlay: (g, ctx) => units(g).some((o) => filter(g, ctx, o) && targetable(g, ctx.p, o)),
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, title, (o) => filter(g, ctx, o), (o) => (o.controller !== ctx.p ? (isBf(o.loc) ? 20 + might(g, o) : -5) : !isBf(o.loc) && !o.exhausted ? 5 : -5), { cancel: true })
      if (!t) return false
      const d = yield* chooseDest(g, ctx, t, (l) => (t.controller !== ctx.p ? (isBf(l) ? -1 : 1) : isBf(l) && bfAt(g, l).controller !== ctx.p ? 1 : 0))
      if (!d) return false
      ctx.data.t = t
      ctx.data.dest = d
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (!alive(g, t) || !filter(g, ctx, t)) return // 359.3.e.5
      yield* moveUnits(g, [t], ctx.data.dest as LocId, ctx.self.card.name, '421')
      after?.(g, ctx, t)
    },
  }
}

register('Twilight Step', {
  ...moveSpell((g, _ctx, o) => might(g, o) <= 3, 'Twilight Step: quale unità con 3 Might o meno sposti?'),
  flow: { energy: 4, power: [['Chaos']] },
  ai: (g, p) => (units(g).some((o) => o.controller !== p && isBf(o.loc) && might(g, o) <= 3) ? 2 : 0),
})

register('Perfect Execution', {
  canPlay: (g, ctx) => units(g).some((o) => targetable(g, ctx.p, o)),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Perfect Execution: quale unità prepari?', () => true, (o) => (o.controller === ctx.p ? (o.exhausted ? 20 : 5) + might(g, o) : -10), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (!alive(g, t)) return
    t.exhausted = false
    addMod(t, { source: 'Perfect Execution', assault: 3 })
    log(g, `${t.card.name} viene preparata e ottiene [Assault 3] in questo turno.`, '807', ctx.p)
  },
  flow: { energy: 3, power: [['Fury']] },
  ai: (g, p) => (g.phase === 'main' && units(g).some((o) => o.controller === p && o.exhausted && !isBf(o.loc) && (o.card.might ?? 0) >= 3) ? 1 : 0),
})

register('Wind and Ghosts', {
  static: { action: true },
  canPlay: (g, ctx) => units(g).some((o) => isBf(o.loc) && targetable(g, ctx.p, o)),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Wind and Ghosts: scegli un’unità in un campo', (o) => isBf(o.loc), aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (!alive(g, t) || !isBf(t.loc)) return
    if (might(g, t) <= 3) yield* banish(g, t, ctx.p)
    else yield* returnToHand(g, t)
  },
  ai: (g, p) => (units(g).some((o) => o.controller !== p && isBf(o.loc) && might(g, o) >= 3) ? 2 : 0),
})

register('Gust Monk', {
  optional: { label: 'paghi 1 energia come costo aggiuntivo', energy: 1 },
  play: {
    label: 'esilia una carta da un trash: un’unità ottiene Assault 2',
    prepare: function* (g, ctx) {
      if (!ctx.data.paid) return false
      const cards = [...trashOf(g, 0), ...trashOf(g, 1)]
      if (!cards.length || !units(g).length) return false
      const r = yield* choose(g, ctx.p, 'Gust Monk: quale carta esili da un trash?', cards.map((o) => ({ label: `${o.card.name} (trash di ${g.players[o.owner].name})`, uid: o.uid, ai: o.owner !== ctx.p ? 1 : 0 })))
      ctx.data.card = cards[r?.[0] ?? 0]
      const t = yield* chooseUnit(g, ctx, 'Gust Monk: quale unità ottiene [Assault 2]?', () => true, aiHelp(ctx, g))
      if (!t) return false
      if (ctx.extraPower) pay(g, ctx.p, { energy: 0, power: Array(ctx.extraPower).fill(ANY) })
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const c = ctx.data.card as Obj
      if (g.objs.get(c.uid) !== c || c.zone !== 'trash') return // 355.10.c.1: costo dentro l'istruzione
      yield* banish(g, c, ctx.p)
      const t = ctx.data.t as Obj
      if (alive(g, t)) {
        addMod(t, { source: 'Gust Monk', assault: 2 })
        log(g, `${t.card.name} ottiene [Assault 2] in questo turno.`, '807', ctx.p)
      }
    },
  },
})

register('Shadow Fiend', {
  empower: { energy: 2, power: ['Fury'] },
  keywords: (_g, self) => (self.empowered ? { assault: 3 } : {}),
})

register('Shadow Assassin', {
  entersReady: (g, self) => trashOf(g, self.controller).some((o) => o.card.name === 'Shadow Assassin'),
})

register('Ravenbloom Prefect', {
  opponentGear: (g, self, gear) => ({
    controller: self.controller,
    label: 'Ravenbloom Prefect: esilia me per esiliare il gear',
    source: self.uid,
    prepare: function* () {
      return !!(yield* yesNo(g, self.controller, `Ravenbloom Prefect: esili Ravenbloom Prefect per esiliare ${gear.card.name}?`, true))
    },
    resolve: function* () {
      if (!alive(g, self)) return // 355.10.c.1: il costo non si può pagare
      yield* banish(g, self, self.controller)
      if (alive(g, gear)) yield* banish(g, gear, self.controller)
    },
  }),
})

register('Traveling Merchant', {
  move: {
    label: 'scarta 1, poi pesca 1',
    resolve: function* (g, ctx) {
      yield* discard(g, ctx.p, 1)
      yield* draw(g, ctx.p, 1)
    },
  },
})

register('Shadow Order Disciple', {
  move: {
    label: 'Burn 1 per +1 Might',
    prepare: function* (g, ctx) {
      // 383.3.b: il costo subito dopo "you may" si paga alla finalizzazione
      const yes = yield* yesNo(g, ctx.p, 'Shadow Order Disciple: fai [Burn 1] per dargli +1 Might?', true, { rule: '383.3.b' })
      if (!yes) return false
      yield* burn(g, ctx.p, 1)
      return true
    },
    resolve: function* (g, ctx) {
      giveMight(g, ctx.self, 1, 'Shadow Order Disciple')
    },
  },
})

register('Punching Poro', {
  empower: { discard: 'any' },
  might: (_g, self) => (self.empowered ? 1 : 0),
})

register('Ruthless Strike', {
  static: { action: true },
  optional: { label: 'scarti 1 carta come costo aggiuntivo (5 danni invece di 3)', discard: 1 },
  canPlay: (g, ctx) => units(g).some((o) => isBf(o.loc) && targetable(g, ctx.p, o)),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, `Ruthless Strike: a quale unità in un campo infliggi ${ctx.paid ? 5 : 3}?`, (o) => isBf(o.loc), aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (alive(g, t) && isBf(t.loc)) deal(g, t, ctx.paid ? 5 : 3, 'Ruthless Strike')
  },
  ai: (g, p) => (units(g).some((o) => o.controller !== p && isBf(o.loc) && might(g, o) - o.damage <= 5) ? 2 : 0),
})

register('Shadowblade Lurker', {
  discount: (g, p, self) => ({ energy: 2 * trashOf(g, p).filter((o) => o.card.name === self.card.name).length }),
})

register('Blade Twirler', {
  move: {
    label: 'un giocatore fa Burn 1',
    when: (_g, self) => self.moves === 1, // "the first time I move each turn"
    prepare: function* (g, ctx) {
      const r = yield* choose(g, ctx.p, 'Blade Twirler: quale giocatore fa [Burn 1]?', g.players.map((pl) => ({ label: pl.name, ai: pl.id === ctx.p ? 0 : 1 })))
      ctx.data.who = (r?.[0] ?? 0) as PID
      return true
    },
    resolve: function* (g, ctx) {
      yield* burn(g, ctx.data.who as PID, 1)
    },
  },
})

register('Kinkou Lifeblade', {
  empower: { energy: 2 },
  might: (_g, self) => (self.empowered ? 1 : 0),
  keywords: (_g, self) => (self.empowered ? { ganking: true } : {}),
})

register('Zaun Warrens', {
  bfConquer: {
    label: 'scarta 1, poi pesca 1',
    resolve: function* (g, ctx) {
      yield* discard(g, ctx.p, 1)
      yield* draw(g, ctx.p, 1)
    },
  },
})

register('Shadow Temple', {
  bfHold: {
    label: 'Burn 3',
    resolve: function* (g, ctx) {
      yield* burn(g, ctx.p, 3)
    },
  },
})

register('Threshold of the Gray', {
  // 430.2: un'abilità innescata che aggiunge risorse si risolve subito
  bfCombatStart: (g) => {
    const sd = g.showdown!
    addEnergy(g, sd.attacker!, 1, 'Threshold of the Gray')
    addEnergy(g, sd.defender!, 1, 'Threshold of the Gray')
  },
})

// ---------------------------------------------------------------- Shen (Vendetta Showdown)

register('Shen - Eye of Twilight', {
  abilities: [
    {
      id: 'shen-legend',
      label: 'Esaurisci: un’unità amica ottiene Tank',
      speed: 'action',
      rule: '806.1.c.2',
      cost: () => ({ energy: 0, power: [] }),
      can: (g, self) => !self.exhausted && units(g).some((u) => u.controller === self.controller),
      prepare: function* (g, ctx) {
        const t = yield* chooseUnit(g, ctx, 'Quale unità amica ottiene [Tank]?', mine(ctx), aiHelp(ctx, g), { cancel: true })
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
        if (alive(g, t)) {
          addMod(t, { source: 'Shen', tank: true })
          log(g, `${t.card.name} ottiene [Tank] in questo turno.`, '815', ctx.p)
        }
      },
    },
  ],
})

export const exactlyOneOther = (g: Game, self: Obj) => friendlyAt(g, self.controller, self.loc).filter((o) => o !== self).length === 1

register('Shen, Leader of the Kinkou Order', {
  static: { shield: 1 },
  hold: {
    label: 'segna 1 punto',
    when: (g, self) => exactlyOneOther(g, self),
    resolve: function* (g, ctx) {
      gainPoints(g, ctx.p, 1, '470.2', 'Shen, Leader of the Kinkou Order')
    },
  },
})

register('Shen, Scourge of Shadows', {
  hold: {
    label: 'pesca 1',
    when: (g, self) => exactlyOneOther(g, self),
    resolve: function* (g, ctx) {
      yield* draw(g, ctx.p, 1)
    },
  },
})

register('Shen, Kinkou', { static: { reaction: true, shield: 2, tank: true } })

register('Shadow Dash', {
  ...moveSpellToMine(),
  flow: { energy: 5, power: [ANY, ANY] },
  ai: (g, p) => (units(g).some((o) => o.controller !== p) && g.bfs.some((b) => friendlyAt(g, p, b.loc).length) ? 1 : 0),
})

function moveSpellToMine(): Pick<CardImpl, 'canPlay' | 'prepare' | 'resolve'> {
  const spots = (g: Game, p: PID, o: Obj) => g.bfs.filter((b) => b.loc !== o.loc && friendlyAt(g, p, b.loc).length).map((b) => b.loc)
  return {
    canPlay: (g, ctx) => units(g).some((o) => o.controller !== ctx.p && targetable(g, ctx.p, o) && spots(g, ctx.p, o).length),
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Shadow Dash: quale unità nemica sposti?', (o) => o.controller !== ctx.p && spots(g, ctx.p, o).length > 0, (o) => 10 - might(g, o), { cancel: true })
      if (!t) return false
      const s = spots(g, ctx.p, t)
      const r = yield* choose(g, ctx.p, 'In quale campo dove hai unità?', s.map((l) => ({ label: locName(g, l, ctx.p), loc: l })), 1, 1, { cancel: true })
      if (!r) return false
      ctx.data.t = t
      ctx.data.dest = s[r[0]]
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      const dest = ctx.data.dest as LocId
      if (!alive(g, t) || t.controller === ctx.p || !friendlyAt(g, ctx.p, dest).length) return
      yield* moveUnits(g, [t], dest, 'Shadow Dash', '421')
      const mineThere = friendlyAt(g, ctx.p, dest)
      if (mineThere.length === 2) for (const o of mineThere) giveMight(g, o, 1, 'Shadow Dash')
    },
  }
}

register('Steel Paws', {
  static: { deflect: 1 },
  empower: { energy: 7 },
  might: (_g, self) => (self.empowered ? 7 : 0),
})

const kennenStun: TrigDef = {
  label: 'paga 2 per stordire un’unità',
  prepare: function* (g, ctx) {
    if (!canPay(g, ctx.p, { energy: 2, power: [] })) return false
    const hasTarget = units(g).some((o) => targetable(g, ctx.p, o) && (!ctx.hiddenAt || o.loc === ctx.hiddenAt))
    if (!hasTarget) return false
    const yes = yield* yesNo(g, ctx.p, 'Kennen: paghi 2 per stordire un’unità?', true, { rule: '383.3.b' })
    if (!yes) return false
    const t = yield* chooseUnit(g, ctx, 'Kennen: quale unità stordisci?', (o) => !o.stunned || o.controller !== ctx.p, aiHarm(ctx, g), { baseCost: { energy: 2, power: [] } })
    if (!t) return false
    pay(g, ctx.p, { energy: 2, power: Array(ctx.extraPower).fill(ANY) })
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (alive(g, t)) stun(g, t)
  },
}

register('Kennen, Keeper of Balance', {
  static: { hidden: true },
  play: kennenStun,
  attack: kennenStun,
  might: (g, self) => (unitsAt(g, self.loc).some((o) => o.controller !== self.controller && o.stunned) ? 2 : 0),
})

register('Sacred Protector', {
  noCombatDamage: (g, self) => !(isBf(self.loc) && exactlyOneOther(g, self)),
})

register('Resonating Strike', {
  static: { hidden: true, reaction: true },
  canPlay: (g, ctx) =>
    g.bfs.some((b) => b.controller === ctx.p && (!ctx.hiddenAt || b.loc === ctx.hiddenAt) && units(g).some((o) => o.controller === ctx.p && o.loc !== b.loc && targetable(g, ctx.p, o))),
  prepare: function* (g, ctx) {
    const bfs = g.bfs.filter((b) => b.controller === ctx.p && (!ctx.hiddenAt || b.loc === ctx.hiddenAt) && units(g).some((o) => o.controller === ctx.p && o.loc !== b.loc))
    const r = yield* choose(g, ctx.p, 'Resonating Strike: quale campo che controlli?', bfs.map((b) => ({ label: bfName(g, b.loc), loc: b.loc, ai: g.showdown?.loc === b.loc ? 2 : 1 })), 1, 1, { cancel: true })
    if (!r) return false
    const bf = bfs[r[0]]
    // 811.1.d.2: "at a different location" rende impossibile la restrizione al campo nascosto
    ctx.data.__noHiddenRestriction = true
    const t = yield* chooseUnit(g, ctx, 'Quale tua unità sposti lì?', (o) => o.controller === ctx.p && o.loc !== bf.loc, (o) => might(g, o), { cancel: true })
    if (!t) return false
    ctx.data.bf = bf.loc
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    const loc = ctx.data.bf as LocId
    if (!alive(g, t) || t.controller !== ctx.p || bfAt(g, loc).controller !== ctx.p || t.loc === loc) return
    yield* moveUnits(g, [t], loc, 'Resonating Strike', '421')
    giveMight(g, t, 2, 'Resonating Strike')
  },
  ai: (g, p) => (g.showdown?.combat && g.showdown.defender === p ? 2 : 0),
})

register('Ki Barrier', {
  static: { reaction: true },
  canPlay: (g, ctx) => units(g).some((o) => targetable(g, ctx.p, o)),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Ki Barrier: quale unità proteggi?', () => true, aiHelp(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (!alive(g, t)) return
    t.prevent += 7
    log(g, `I prossimi 7 danni a ${t.card.name} in questo turno vengono prevenuti.`, '438', ctx.p)
  },
  ai: (g, p) => (g.showdown?.combat && units(g).some((o) => o.controller === p && inCombat(g, o)) ? 1 : 0),
})

register('Discipline', {
  static: { reaction: true },
  canPlay: (g, ctx) => units(g).some((o) => targetable(g, ctx.p, o)),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Discipline: quale unità ottiene +2 Might?', () => true, aiHelp(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    giveMight(g, ctx.data.t as Obj, 2, 'Discipline')
    yield* draw(g, ctx.p, 1)
  },
  ai: (g, p) => (g.showdown?.combat && units(g).some((o) => o.controller === p && inCombat(g, o)) ? 1 : 0),
})

register('Noxian Emissary', {
  empower: { energy: 1, power: ['Order'] },
  deathknell: {
    label: 'gioca due token Recruit da 1 nella base',
    when: (_g, self) => self.empowered, // [Empowered][>] [Deathknell]
    resolve: function* (g, ctx) {
      yield* playToken(g, ctx.p, RECRUIT, baseOf(ctx.p))
      yield* playToken(g, ctx.p, RECRUIT, baseOf(ctx.p))
    },
  },
})

register('Pakaa Protector', {
  move: {
    label: 'rivela la prima carta del mazzo',
    resolve: function* (g, ctx) {
      const pl = g.players[ctx.p]
      if (!pl.deck.length) return // 432.1.c: rivelare non causa Burn Out
      const top = g.objs.get(pl.deck[0])!
      log(g, `Pakaa Protector rivela ${top.card.name}.`, '425', ctx.p)
      if (isUnit(top)) moveZone(g, top, 'hand')
      else {
        moveZone(g, top, 'trash')
        giveMight(g, ctx.self, 2, 'Pakaa Protector')
      }
    },
  },
})

register('Lacerate', {
  canPlay: (g, ctx) => units(g).some((o) => targetable(g, ctx.p, o)),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Lacerate: scegli un’unità', () => true, (o) => (o.controller !== ctx.p ? (might(g, o) <= 3 || o.empowered ? 20 : 5) + might(g, o) : -10), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (!alive(g, t)) return
    if (t.empowered) {
      t.empowered = false // 443
      log(g, `${t.card.name} perde Empowered.`, '443', ctx.p)
    }
    if (might(g, t) <= 3) yield* kill(g, [t], 'Lacerate')
  },
  flow: { energy: 4, power: [['Order'], ['Order']] },
  ai: (g, p) => (units(g).some((o) => o.controller !== p && might(g, o) <= 3 + (o.empowered ? 7 : 0)) ? 2 : 0),
})

register('Mournful Witness', {
  combatEnd: {
    label: 'empower me',
    resolve: function* (g, ctx) {
      if (alive(g, ctx.self)) empower(g, ctx.self)
    },
  },
  might: (_g, self) => (self.empowered ? 2 : 0),
})

register('Disciple of Shen', {
  static: { hidden: true },
  keywords: (g, self) => (isBf(self.loc) && exactlyOneOther(g, self) ? { shield: 3 } : {}),
})

register('Hand Hammer', { equip: ['Calm'] })

register('Twilight Shroud', {
  canPlay: (g, ctx) => units(g).some((o) => o.controller === ctx.p),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Twilight Shroud: quale unità amica?', mine(ctx), aiHelp(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (!alive(g, t)) return
    addMod(t, { source: 'Twilight Shroud', might: 1, untargetable: true })
    log(g, `${t.card.name} ottiene +1 Might e non può essere scelta da magie e abilità nemiche in questo turno.`, undefined, ctx.p)
  },
  flow: { energy: 2, power: [] },
})

register('Soulspinner', { static: { ambush: true } })

register('Keeper of Law', {
  discount: (g, p) => (g.bfs.some((b) => b.controller === p && unitsAt(g, b.loc).length === 2) ? { energy: 2, power: ['Order'] } : {}),
})

register('Field Musicians', {
  play: {
    label: 'un’unità ottiene +3 Might',
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Field Musicians: quale unità ottiene +3 Might?', () => true, aiHelp(ctx, g))
      if (!t) return false
      if (ctx.extraPower) pay(g, ctx.p, { energy: 0, power: Array(ctx.extraPower).fill(ANY) })
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      giveMight(g, ctx.data.t as Obj, 3, 'Field Musicians')
    },
  },
})

register('Charm', {
  ...moveSpell((_g, ctx, o) => o.controller !== ctx.p, 'Charm: quale unità nemica sposti?'),
  ai: (g, p) => (units(g).some((o) => o.controller !== p && isBf(o.loc)) ? 1 : 0),
})

register('Serene Ascetic', {
  empower: { energy: 3 },
  keywords: (_g, self) => (self.empowered ? { deflect: 1, shield: 3 } : {}),
})

register('Loyal Poro', {
  deathknell: {
    label: 'se non sono morto da solo, pesca 1',
    resolve: function* (g, ctx) {
      if (!ctx.data.alone) yield* draw(g, ctx.p, 1)
    },
  },
})

register('Dragon Form', {
  canPlay: (g, ctx) => units(g).some((o) => targetable(g, ctx.p, o)),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Dragon Form: la Might base di quale unità diventa 5?', () => true, (o) => (o.controller === ctx.p ? 10 - (o.card.might ?? 0) : (o.card.might ?? 0) - 5), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (!alive(g, t)) return
    addMod(t, { source: 'Dragon Form', baseMight: 5 })
    log(g, `La Might base di ${t.card.name} diventa 5 in questo turno.`, '143.2.a', ctx.p)
  },
  flow: { energy: 3, power: [] },
  ai: (g, p) => (units(g).some((o) => o.controller === p && (o.card.might ?? 0) <= 2 && isBf(o.loc)) ? 1 : 0),
})

register('Kinkou Temple', {
  bfMight: (g, u) => (kw(g, u).tank ? 1 : 0),
})

register('Grove of the God-Willow', {
  bfHold: {
    label: 'pesca 1',
    resolve: function* (g, ctx) {
      yield* draw(g, ctx.p, 1)
    },
  },
})

