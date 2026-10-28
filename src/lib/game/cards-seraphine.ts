// Carte del mazzo Seraphine (Radiance). Test in src/test/game-cards-seraphine.test.ts.
import { register } from './registry'
import {
  addMod,
  alive,
  banish,
  baseOf,
  board,
  burn,
  canPay,
  channel,
  choose,
  chooseUnit,
  deal,
  discard,
  draw,
  exhaustUnits,
  friendlyAt,
  isBf,
  isGear,
  isUnit,
  log,
  might,
  moveZone,
  pay,
  playCard,
  playToken,
  predict,
  units,
  yesNo,
} from './engine'
import { RECRUIT, aiHarm, aiHelp, giveMight, inCombat, tokenLoc } from './cards'
import { BIRD } from './cards-vi'
import { MECH } from './cards-rumble'
import type { Game, Obj, PID } from './types'

const exhaustedMine = (g: Game, p: PID) => units(g).filter((o) => o.controller === p && o.exhausted).length

function weaken(g: Game, o: Obj, n: number, source: string) {
  if (!alive(g, o) || n <= 0) return
  addMod(o, { source, might: -n })
  log(g, `${o.card.name} ottiene -${n} Might in questo turno.`, undefined, o.controller)
}

register('Seraphine - Starry-Eyed Songstress', {
  // "As an additional cost to play a spell, you may exhaust me and three friendly units to reduce the cost by [2]"
  spellCostOption: {
    label: 'Seraphine: esaurisci la Legend e tre tue unità per ridurre il costo di 2',
    energy: 2,
    can: (g, self) => !self.exhausted && units(g).filter((o) => o.controller === self.controller && !o.exhausted).length >= 3,
    pay: function* (g, self) {
      const ready = units(g).filter((o) => o.controller === self.controller && !o.exhausted)
      const r = yield* choose(g, self.controller, 'Quali tre unità esaurisci?', ready.map((o) => ({ label: o.card.name, uid: o.uid, detail: `${might(g, o)} Might`, ai: -might(g, o) })), 3, 3, { rule: '356.2.b' })
      self.exhausted = true
      exhaustUnits(g, (r ?? []).map((i) => ready[i]), self.controller)
      return true
    },
  },
})

register('Seraphine, Inspiring', {
  static: { disarm: 2 },
  exhaustMany: {
    label: 'puoi pescare 1',
    when: (g, self) => self.zone === 'board' && !g.turnFlags.has(`inspiring-${self.uid}`), // "once each turn"
    prepare: function* (g, ctx) {
      g.turnFlags.add(`inspiring-${ctx.self.uid}`)
      return !!(yield* yesNo(g, ctx.p, 'Seraphine, Inspiring: peschi 1?', true))
    },
    resolve: function* (g, ctx) {
      yield* draw(g, ctx.p, 1)
    },
  },
})

const notAloneRecruit = {
  label: 'gioca un token Recruit nella base',
  resolve: function* (g: Game, ctx: import('./registry').Ctx) {
    yield* playToken(g, ctx.p, RECRUIT, baseOf(ctx.p))
  },
}

register('Seraphine, Not Alone', {
  play: notAloneRecruit,
  exhausted: notAloneRecruit,
  might: (g, self) => units(g).filter((o) => o.controller === self.controller && o !== self && o.exhausted).length,
})

register('Encore', {
  prepare: function* (g, ctx) {
    const modes = ['Infliggi 2 a un’unità', 'Gioca due token Recruit', 'Fino a due unità ottengono +1 Might', 'Guarda le prime 2 carte, pescane 1 e ricicla l’altra']
    const r = yield* choose(g, ctx.p, 'Encore: scegli due effetti', modes.map((m, i) => ({ label: m, ai: [2, 3, 1, 2][i] })), 2, 2, { cancel: true, rule: '355.3' })
    if (!r) return false
    ctx.data.modes = r
    if (r.includes(0)) {
      const t = yield* chooseUnit(g, ctx, 'Encore: a quale unità infliggi 2?', () => true, aiHarm(ctx, g), { cancel: true })
      if (!t) return false
      ctx.data.dmg = t
    }
    if (r.includes(2)) {
      const list: Obj[] = []
      for (let i = 0; i < 2 && units(g).some((o) => !list.includes(o)); i++) {
        const t = yield* chooseUnit(g, ctx, `Encore: ${i ? 'seconda' : 'prima'} unità che ottiene +1 Might`, (o) => !list.includes(o), aiHelp(ctx, g), { cancel: true })
        if (!t) break
        list.push(t)
      }
      ctx.data.boost = list
    }
    return true
  },
  resolve: function* (g, ctx) {
    const modes = ctx.data.modes as number[]
    for (const m of [...modes].sort()) {
      if (m === 0 && alive(g, ctx.data.dmg as Obj)) deal(g, ctx.data.dmg as Obj, 2, 'Encore')
      if (m === 1) {
        const loc = yield* tokenLoc(g, ctx)
        yield* playToken(g, ctx.p, RECRUIT, loc)
        yield* playToken(g, ctx.p, RECRUIT, loc)
      }
      if (m === 2) for (const t of ctx.data.boost as Obj[]) giveMight(g, t, 1, 'Encore')
      if (m === 3) {
        const pl = g.players[ctx.p]
        const top = pl.deck.slice(0, 2).map((u) => g.objs.get(u)!)
        if (!top.length) continue
        const r = yield* choose(g, ctx.p, 'Encore: quale carta peschi? (l’altra si ricicla)', top.map((o) => ({ label: o.card.name, uid: o.uid, ai: o.card.energy ?? 0 })))
        const keep = top[r?.[0] ?? 0]
        moveZone(g, keep, 'hand')
        for (const o of top) if (o !== keep) moveZone(g, o, 'deck', { bottom: true })
        log(g, `Encore: pesca una delle prime due carte e ricicla l’altra.`, '417', ctx.p)
      }
    }
  },
  ai: () => 1,
})

register('Heimerdinger, Academy Instructor', {}) // la sostituzione dei token è in playToken (engine.ts)

register('Raucous Anthem', {
  canPlay: (g, ctx) => units(g).some((o) => o.controller === ctx.p),
  resolve: function* (g, ctx) {
    for (const o of units(g).filter((u) => u.controller === ctx.p)) {
      o.exhausted = false
      giveMight(g, o, 3, 'Raucous Anthem')
    }
    log(g, 'Le tue unità vengono preparate.', '416', ctx.p)
  },
  ai: (g, p) => (g.phase === 'main' && !g.showdown && units(g).filter((o) => o.controller === p).length >= 3 ? 2 : 0),
})

register('Piltovan Guidebot', {
  allyPlays: {
    label: 'la mia Might base può diventare il costo della carta',
    prepare: function* (g, ctx) {
      const played = ctx.data.unit as Obj
      if (played.uid === ctx.self.uid || !alive(g, ctx.self)) return false
      const e = played.card.energy ?? 0
      if (e <= might(g, ctx.self)) return false
      return !!(yield* yesNo(g, ctx.p, `Piltovan Guidebot: la sua Might base diventa ${e} in questo turno?`, true))
    },
    resolve: function* (g, ctx) {
      if (!alive(g, ctx.self)) return
      const e = (ctx.data.unit as Obj).card.energy ?? 0
      addMod(ctx.self, { source: 'Piltovan Guidebot', baseMight: e })
      log(g, `La Might base di Piltovan Guidebot diventa ${e} in questo turno.`, '143.2.a', ctx.p)
    },
  },
})

register('Dune Devourer', {
  static: { deflect: 1 },
  // "You may kill a friendly unit as an additional cost to play me. If you do, I cost [2] less."
  optional: { label: 'uccidi una tua unità come costo aggiuntivo (costo 2 in meno)', killFriendly: true, discountEnergy: 2 },
})

register('The Empyrean', {
  showOff: { label: 'una carta', filter: () => true },
  play: {
    label: 'Predict pari al costo in Power della carta mostrata, poi pesca 2',
    prepare: function* (_g, ctx) {
      return !!ctx.data.showed
    },
    resolve: function* (g, ctx) {
      const n = (ctx.data.showed as { power: number }).power
      if (n > 0) yield* predict(g, ctx.p, n)
      yield* draw(g, ctx.p, 2)
    },
  },
})

register('Steadfast Outrider', {
  static: { tank: true },
  might: (g, self) => (isBf(self.loc) && board(g).filter((o) => o !== self && o.controller === self.controller && o.loc === self.loc && (isUnit(o) || isGear(o))).length >= 2 ? 2 : 0),
})

register('Rousing Display', {
  showOff: { label: 'una carta con costo 7 o più', filter: (_g, o) => (o.card.energy ?? 0) >= 7 },
  resolve: function* (g, ctx) {
    const n = ctx.data.showed ? 4 : 2
    for (let i = 0; i < n; i++) yield* playToken(g, ctx.p, RECRUIT, baseOf(ctx.p))
  },
  ai: () => 1,
})

register('Supernova', {
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Supernova: a quale unità infliggi 10?', () => true, aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (alive(g, t)) deal(g, t, 10, 'Supernova')
    yield* draw(g, ctx.p, 2)
  },
  ai: (g, p) => (units(g).some((o) => o.controller !== p && might(g, o) >= 5) ? 2 : 0),
})

register('Burn Away', {
  canPlay: (g) => board(g).some((o) => (isUnit(o) && might(g, o) <= 3) || (isGear(o) && !isUnit(o))),
  prepare: function* (g, ctx) {
    const cands = board(g).filter((o) => (isUnit(o) && might(g, o) <= 3) || (isGear(o) && !isUnit(o)))
    const r = yield* choose(g, ctx.p, 'Burn Away: quale unità con 3 Might o meno, o gear, esili?', cands.map((o) => ({ label: o.card.name, uid: o.uid, detail: isUnit(o) ? `${might(g, o)} Might` : 'gear', ai: o.controller !== ctx.p ? 10 : -10 })), 1, 1, { cancel: true })
    if (!r) return false
    ctx.data.t = cands[r[0]]
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (alive(g, t) && (!isUnit(t) || might(g, t) <= 3)) yield* banish(g, t, ctx.p)
    yield* burn(g, ctx.p, 2)
  },
  ai: (g, p) => (board(g).some((o) => o.controller !== p && ((isUnit(o) && might(g, o) <= 3) || isGear(o))) ? 1 : 0),
})

register('Concert Poster', {
  static: { deploy: true },
  play: {
    label: 'puoi pagare 1 per un Recruit',
    prepare: function* (g, ctx) {
      if (!canPay(g, ctx.p, { energy: 1, power: [] })) return false
      if (!(yield* yesNo(g, ctx.p, 'Concert Poster: paghi 1 energia per un token Recruit nella base?', true, { rule: '383.3.b' }))) return false
      pay(g, ctx.p, { energy: 1, power: [] })
      return true
    },
    resolve: function* (g, ctx) {
      yield* playToken(g, ctx.p, RECRUIT, baseOf(ctx.p))
    },
  },
  playerConquer: {
    label: 'conquisti qui: puoi pagare 1 per un Recruit',
    prepare: function* (g, ctx) {
      if (ctx.data.loc !== ctx.self.loc || !alive(g, ctx.self) || !canPay(g, ctx.p, { energy: 1, power: [] })) return false
      if (!(yield* yesNo(g, ctx.p, 'Concert Poster: paghi 1 energia per un token Recruit nella base?', true, { rule: '383.3.b' }))) return false
      pay(g, ctx.p, { energy: 1, power: [] })
      return true
    },
    resolve: function* (g, ctx) {
      yield* playToken(g, ctx.p, RECRUIT, baseOf(ctx.p))
    },
  },
})

register('Strigian Oracle', {
  exhausted: {
    label: 'Predict',
    resolve: function* (g, ctx) {
      yield* predict(g, ctx.p, 1)
    },
  },
})

register('High Note', {
  static: { reaction: true },
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'High Note: quale unità indebolisci?', () => true, aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    weaken(g, ctx.data.t as Obj, exhaustedMine(g, ctx.p), 'High Note') // contato alla risoluzione
  },
  ai: (g, p) => (g.showdown?.combat && exhaustedMine(g, p) >= 2 && units(g).some((o) => o.controller !== p && inCombat(g, o)) ? 1 : 0),
})

register('Fanfare', {
  resolve: function* (g, ctx) {
    g.players[ctx.p].fanfare += 3
    log(g, 'Le prossime tre volte che giochi un’unità in questo turno, peschi 1.', '391', ctx.p)
  },
  ai: (g, p) => (g.players[p].hand.length >= 3 ? 1 : 0),
})

register('Hunting Dog', {
  deathknell: {
    label: 'gioca un token Bird nella base',
    resolve: function* (g, ctx) {
      yield* playToken(g, ctx.p, BIRD, baseOf(ctx.p))
    },
  },
})

register('Industrious Mechsmith', {
  play: {
    label: 'gioca un token Mech qui',
    resolve: function* (g, ctx) {
      yield* playToken(g, ctx.p, MECH, ctx.self.loc ?? baseOf(ctx.p))
    },
  },
})

register('Faithful Manufactor', {
  play: {
    label: 'gioca un token Recruit qui',
    resolve: function* (g, ctx) {
      yield* playToken(g, ctx.p, RECRUIT, ctx.self.loc ?? baseOf(ctx.p))
    },
  },
})

register('Herald of the Emperor', {
  play: {
    label: 'la Might base di un’unità amica diventa 5',
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Herald of the Emperor: la Might base di quale unità amica diventa 5?', (o) => o.controller === ctx.p, (o) => 10 - (o.card.might ?? 0))
      if (!t) return false
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (!alive(g, t)) return
      addMod(t, { source: 'Herald of the Emperor', baseMight: 5 })
      log(g, `La Might base di ${t.card.name} diventa 5 in questo turno.`, '143.2.a', ctx.p)
    },
  },
})

register('Party Crasher', {
  static: { tank: true },
  discount: (g, p) => ({ energy: exhaustedMine(g, p) }),
})

register('Meticulous Restorationist', {
  trashPlays: {
    label: 'puoi giocarmi dal trash per [Order]',
    prepare: function* (g, ctx) {
      const played = ctx.data.unit as Obj
      if ((played.card.energy ?? 0) < 7 || ctx.self.zone !== 'trash' || g.objs.get(ctx.self.uid) !== ctx.self) return false
      if (!canPay(g, ctx.p, { energy: 0, power: [['Order']] })) return false
      return !!(yield* yesNo(g, ctx.p, 'Meticulous Restorationist: lo giochi dal trash per 1 Power Order?', true))
    },
    resolve: function* (g, ctx) {
      if (g.objs.get(ctx.self.uid) !== ctx.self) return
      yield* playCard(g, ctx.p, ctx.self, 'trash', { limited: true, cost: { energy: 0, power: [['Order']] } })
    },
  },
})

register('Moonlight Affliction', {
  static: { reaction: true },
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Moonlight Affliction: quale unità ottiene -10 Might?', () => true, aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    weaken(g, ctx.data.t as Obj, 10, 'Moonlight Affliction')
  },
  ai: (g, p) => (g.showdown?.combat && units(g).some((o) => o.controller !== p && inCombat(g, o) && might(g, o) >= 4) ? 2 : 0),
})

register('For Demacia!', {
  static: { reaction: true },
  prepare: function* (g, ctx) {
    const r = yield* choose(g, ctx.p, 'For Demacia!: quale campo?', g.bfs.map((b) => ({ label: b.card.name, loc: b.loc, ai: friendlyAt(g, ctx.p, b.loc).length + (g.showdown?.loc === b.loc ? 5 : 0) })), 1, 1, { cancel: true })
    if (!r) return false
    ctx.data.loc = g.bfs[r[0]].loc
    return true
  },
  resolve: function* (g, ctx) {
    for (const o of friendlyAt(g, ctx.p, ctx.data.loc as import('./types').LocId)) {
      addMod(o, { source: 'For Demacia!', shield: 2 })
      log(g, `${o.card.name} ottiene [Shield 2] in questo turno.`, '814', ctx.p)
    }
  },
  ai: (g, p) => (g.showdown?.combat && g.showdown.defender === p ? 2 : 0),
})

register('Black Rose Sanctum', {
  bfUnitDies: {
    label: 'gioca un token Recruit nella base',
    prepare: function* (g, ctx) {
      const key = `black-rose-${ctx.p}`
      if (g.turnFlags.has(key)) return false // "the first time each turn"
      g.turnFlags.add(key)
      return true
    },
    resolve: function* (g, ctx) {
      yield* playToken(g, ctx.p, RECRUIT, baseOf(ctx.p))
    },
  },
})

register('Ruined Monastery', {
  bfConquer: {
    label: 'puoi scartare 1 e canalizzare 1 runa esausta',
    prepare: function* (g, ctx) {
      if (!g.players[ctx.p].hand.length) return false
      return !!(yield* yesNo(g, ctx.p, 'Ruined Monastery: scarti 1 e canalizzi una runa esausta?', true))
    },
    resolve: function* (g, ctx) {
      const d = yield* discard(g, ctx.p, 1)
      if (d.length) yield* channel(g, ctx.p, 1, true)
    },
  },
})

