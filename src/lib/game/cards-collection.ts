// Carte della collezione fuori dai mazzi ufficiali (blocco 1: parole chiave note ed effetti semplici).
// Ogni carta segue il testo stampato; i test sono in src/test/game-cards-collection.test.ts.
import { register, type Ctx } from './registry'
import {
  alive,
  board,
  buffUnit,
  channel,
  choose,
  chooseUnit,
  deal,
  draw,
  friendlyAt,
  gainPoints,
  isBf,
  isGear,
  isUnit,
  kill,
  log,
  might,
  moveZone,
  playToken,
  predict,
  returnToHand,
  stun,
  units,
} from './engine'
import { RECRUIT, aiHarm, aiHelp, giveMight } from './cards'
import type { Game, LocId, Obj, PID } from './types'

const enemyOf = (ctx: Ctx) => (o: Obj) => o.controller !== ctx.p
const mineOf = (ctx: Ctx) => (o: Obj) => o.controller === ctx.p
const gears = (g: Game) => board(g).filter(isGear)
const runeCount = (g: Game, p: PID) => g.players[p].runes.length
/** Qualcosa che controlli è Empowered (Legend, unità o equipaggiamento). */
const anyEmpowered = (g: Game, p: PID) => [g.objs.get(g.players[p].legend)!, ...board(g).filter((o) => o.controller === p)].some((o) => o.empowered)

/** Sceglie un equipaggiamento (gli equipaggiamenti non hanno Deflect: si sceglie liberamente). */
function* chooseGear(g: Game, p: PID, title: string, filter: (o: Obj) => boolean, optional: boolean) {
  const list = gears(g).filter(filter)
  if (!list.length) return null
  const r = yield* choose(g, p, title, list.map((o) => ({ label: `${o.card.name} (${o.controller === p ? 'tuo' : 'nemico'})`, uid: o.uid, ai: o.controller === p ? -10 : 5 + (o.card.energy ?? 0) })), optional ? 0 : 1, 1)
  return r?.length ? list[r[0]] : null
}

// ---------------------------------------------------------------- Fury

register('Bilgewater Tracker', {
  play: {
    label: 'infliggi 1 a ciascuna di fino a 2 unità',
    prepare: function* (g, ctx) {
      const list = units(g).filter((o) => o !== ctx.self && (!ctx.hiddenAt || o.loc === ctx.hiddenAt))
      const r = yield* choose(g, ctx.p, 'Bilgewater Tracker: a quali unità infliggi 1? (fino a 2)', list.map((o) => ({ label: o.card.name, uid: o.uid, detail: `${might(g, o)} Might`, ai: aiHarm(ctx, g)(o) })), 0, 2)
      ctx.data.ts = (r ?? []).map((i) => list[i])
      return true
    },
    resolve: function* (g, ctx) {
      for (const t of ctx.data.ts as Obj[]) if (alive(g, t)) deal(g, t, 1, 'Bilgewater Tracker')
    },
  },
})

register('Brawl', {
  static: { action: true },
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Brawl: quale unità ottiene [Assault] pari alla sua Might?', () => true, aiHelp(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (!alive(g, t)) return
    const n = Math.max(0, might(g, t)) // Assault pari alla Might al momento della risoluzione
    t.mods.push({ source: 'Brawl', assault: n })
    log(g, `${t.card.name} ottiene [Assault ${n}] in questo turno.`, '807', t.controller)
  },
  ai: (g, p) => (g.showdown?.combat && units(g).some((o) => o.controller === p && o.role === 'attacker') ? 1 : 0),
})

/** "Occupied enemy battlefield": campo controllato da un avversario e con unità. */
const occupiedEnemyBfs = (g: Game, p: PID) => g.bfs.filter((b) => b.controller !== null && b.controller !== p && units(g).some((o) => o.loc === b.loc)).map((b) => b.loc)

register('Rally for War', {
  canPlay: (g, ctx) => occupiedEnemyBfs(g, ctx.p).length > 0,
  prepare: function* (g, ctx) {
    const locs = occupiedEnemyBfs(g, ctx.p)
    const r = yield* choose(g, ctx.p, 'Rally for War: in quale campo nemico occupato giochi i Recruit?', locs.map((l) => ({ label: g.bfs.find((b) => b.loc === l)!.card.name, loc: l })), 1, 1, { cancel: true })
    if (!r) return false
    ctx.data.loc = locs[r[0]]
    return true
  },
  resolve: function* (g, ctx) {
    for (let i = 0; i < 3; i++) yield* playToken(g, ctx.p, RECRUIT, ctx.data.loc as LocId)
  },
  ai: () => 1,
})

register('Lost to the Sands', {
  static: { action: true },
  canPlay: (g) => units(g).some((o) => isBf(o.loc)) || gears(g).length > 0,
  prepare: function* (g, ctx) {
    const modes = [
      { label: 'Infliggi 4 a un’unità in un campo', ok: units(g).some((o) => isBf(o.loc)), ai: 2 },
      { label: 'Uccidi un equipaggiamento', ok: gears(g).some((o) => o.controller !== ctx.p), ai: 1 },
    ]
    const ok = modes.map((m, i) => ({ ...m, i })).filter((m) => m.ok)
    const r = yield* choose(g, ctx.p, 'Lost to the Sands: scegli una modalità', ok.map((m) => ({ label: m.label, ai: m.ai })), 1, 1, { cancel: true })
    if (!r) return false
    ctx.data.mode = ok[r[0]].i
    if (ctx.data.mode === 0) {
      const t = yield* chooseUnit(g, ctx, 'Lost to the Sands: a quale unità in un campo infliggi 4?', (o) => isBf(o.loc), aiHarm(ctx, g), { cancel: true })
      if (!t) return false
      ctx.data.t = t
    } else {
      const t = yield* chooseGear(g, ctx.p, 'Lost to the Sands: quale equipaggiamento uccidi?', () => true, false)
      if (!t) return false
      ctx.data.t = t
    }
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (!alive(g, t)) return
    if (ctx.data.mode === 0) deal(g, t, 4, 'Lost to the Sands')
    else yield* kill(g, [t], 'Lost to the Sands')
  },
  ai: () => 1,
})

register('Black Rose Dignitary', {
  static: { assault: 1 },
  deathknell: {
    label: 'canalizza 1 runa esausta',
    resolve: function* (g, ctx) {
      yield* channel(g, ctx.p, 1, true)
    },
  },
})

register('Brittle Steel', {
  flow: { energy: 4, power: [['Fury']] },
  canPlay: (g) => gears(g).length > 0,
  prepare: function* (g, ctx) {
    const t = yield* chooseGear(g, ctx.p, 'Brittle Steel: quale equipaggiamento uccidi?', () => true, false)
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (alive(g, t)) yield* kill(g, [t], 'Brittle Steel')
  },
  ai: (g, p) => (gears(g).some((o) => o.controller !== p) ? 1 : 0),
})

register('Eclipse Dragon', {
  static: { accelerate: true },
  move: {
    label: 'se controlli 4 rune o meno, pesca 1',
    resolve: function* (g, ctx) {
      if (runeCount(g, ctx.p) <= 4) yield* draw(g, ctx.p, 1)
    },
  },
})

register('Decree of Rage', {
  static: { action: true },
  uncounterable: true,
  canPlay: (g, ctx) => units(g).some((o) => o.controller !== ctx.p && o.card.domains.includes('Calm')),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Decree of Rage: a quale unità nemica Calm infliggi 4?', (o) => o.controller !== ctx.p && o.card.domains.includes('Calm'), aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (alive(g, t)) deal(g, t, 4, 'Decree of Rage')
  },
  ai: () => 1,
})

register('Consuming Curse', {
  static: { action: true },
  canPlay: (g) => units(g).some((o) => isBf(o.loc)),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Consuming Curse: a quale unità in un campo infliggi i danni?', (o) => isBf(o.loc), aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (!alive(g, t)) return
    // 2 più 1 danno bonus per ogni carta con questo nome nel tuo trash (contato alla risoluzione)
    const bonus = g.players[ctx.p].trash.filter((u) => g.objs.get(u)!.card.name === 'Consuming Curse').length
    deal(g, t, 2 + bonus, 'Consuming Curse')
  },
  ai: () => 1,
})

// ---------------------------------------------------------------- Calm

register('Disarming Rake', {
  play: {
    label: 'puoi uccidere un equipaggiamento',
    when: (g) => gears(g).length > 0,
    prepare: function* (g, ctx) {
      const t = yield* chooseGear(g, ctx.p, 'Disarming Rake: quale equipaggiamento uccidi? (puoi non sceglierne)', () => true, true)
      ctx.data.t = t
      return !!t
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (alive(g, t)) yield* kill(g, [t], 'Disarming Rake')
    },
  },
})

register('Ribbon Dancer', {
  move: {
    label: 'un’altra unità amica ottiene +1 Might',
    when: (g, self) => isBf(self.loc) && units(g).some((o) => o.controller === self.controller && o !== self),
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Ribbon Dancer: quale altra unità amica ottiene +1 Might?', (o) => mineOf(ctx)(o) && o.uid !== ctx.self.uid, aiHelp(ctx, g))
      if (!t) return false
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      giveMight(g, ctx.data.t as Obj, 1, 'Ribbon Dancer')
    },
  },
})

register('Iridescent Avian', {
  abilities: [
    {
      id: 'avian',
      label: 'Esaurisci: buff a un’unità (o +2 Might se ha già un buff)',
      speed: 'normal',
      rule: '702',
      cost: () => ({ energy: 0, power: [] }),
      can: (_g, self) => self.zone === 'board' && !self.exhausted,
      prepare: function* (g, ctx) {
        const t = yield* chooseUnit(g, ctx, 'Iridescent Avian: quale unità?', () => true, aiHelp(ctx, g), { cancel: true })
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
        if (!alive(g, t)) return
        if (t.buff) giveMight(g, t, 2, 'Iridescent Avian')
        else buffUnit(g, t)
      },
    },
  ],
})

register('Tomb-Raider Barbara', {
  play: {
    label: 'con 7 o più rune: disempower o uccidi un equipaggiamento nemico',
    when: (g, self) => runeCount(g, self.controller) >= 7 && gears(g).some((o) => o.controller !== self.controller),
    prepare: function* (g, ctx) {
      const t = yield* chooseGear(g, ctx.p, 'Tomb-Raider Barbara: quale equipaggiamento nemico scegli?', enemyOf(ctx), false)
      if (!t) return false
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (!alive(g, t)) return
      if (t.empowered) {
        t.empowered = false
        log(g, `${t.card.name} non è più Empowered.`, '712', t.controller)
      } else yield* kill(g, [t], 'Tomb-Raider Barbara')
    },
  },
})

register('Horns of the Dragon', { static: { tank: true } })

register('Masa, Crashing Thunder', {
  optional: { label: 'paga 1 Order come costo aggiuntivo per stordire un’unità nemica in un campo', power: ['Order'] },
  play: {
    label: 'se hai pagato il costo aggiuntivo, stordisci un’unità nemica in un campo',
    prepare: function* (g, ctx) {
      if (!ctx.data.paid) return false
      const t = yield* chooseUnit(g, ctx, 'Masa: quale unità nemica in un campo stordisci?', (o) => enemyOf(ctx)(o) && isBf(o.loc), aiHarm(ctx, g))
      if (!t) return false
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (alive(g, t)) stun(g, t, ctx.p)
    },
  },
})

register('Reluctant Leader', {
  allyPlays: {
    label: 'ho giocato un’altra unità: +2 Might',
    prepare: function* (_g, ctx) {
      const u = ctx.data.unit as Obj
      return isUnit(u) && u.uid !== ctx.self.uid
    },
    resolve: function* (g, ctx) {
      giveMight(g, ctx.self, 2, 'Reluctant Leader')
    },
  },
})

register('One-Two Punch', {
  static: { action: true },
  canPlay: (g, ctx) => units(g).some((o) => o.controller === ctx.p) || units(g).some((o) => o.controller !== ctx.p),
  prepare: function* (g, ctx) {
    const f = units(g).some(mineOf(ctx)) ? yield* chooseUnit(g, ctx, 'One-Two Punch: a quale unità amica dai un buff?', mineOf(ctx), aiHelp(ctx, g), { cancel: true }) : null
    const e = units(g).some(enemyOf(ctx)) ? yield* chooseUnit(g, ctx, 'One-Two Punch: quale unità nemica stordisci?', enemyOf(ctx), aiHarm(ctx, g), { cancel: true }) : null
    if (!f && !e) return false
    ctx.data.f = f
    ctx.data.e = e
    return true
  },
  resolve: function* (g, ctx) {
    const f = ctx.data.f as Obj | null
    const e = ctx.data.e as Obj | null
    if (f && alive(g, f)) buffUnit(g, f)
    if (e && alive(g, e)) stun(g, e, ctx.p)
  },
  ai: (g, p) => (units(g).some((o) => o.controller !== p && isBf(o.loc)) ? 1 : 0),
})

register('Mournful Spirit', {
  deathknell: {
    label: 'puoi uccidere un’unità o un equipaggiamento qui',
    prepare: function* (g, ctx) {
      const loc = ctx.self.loc
      const list = board(g).filter((o) => o.loc === loc && o.uid !== ctx.self.uid && (isUnit(o) || isGear(o)))
      if (!list.length) return false
      const r = yield* choose(g, ctx.p, 'Mournful Spirit: cosa uccidi qui? (puoi non scegliere nulla)', list.map((o) => ({ label: o.card.name, uid: o.uid, ai: o.controller !== ctx.p ? 10 + (o.card.energy ?? 0) : -10 })), 0, 1)
      if (!r?.length) return false
      ctx.data.t = list[r[0]]
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (alive(g, t)) yield* kill(g, [t], 'Mournful Spirit')
    },
  },
})

// ---------------------------------------------------------------- Mind

register('Mysterious Chronomancer', {
  static: { disarm: 2 },
  play: {
    label: 'Predict 2',
    resolve: function* (g, ctx) {
      yield* predict(g, ctx.p, 2)
    },
  },
})

register('Trinket Peddler', { static: { disarm: 1 } })

register('Aspiring Engineer', {
  play: {
    label: 'riprendi in mano un equipaggiamento dal trash',
    when: (g, self) => g.players[self.controller].trash.some((u) => isGear(g.objs.get(u)!)),
    prepare: function* (g, ctx) {
      const list = g.players[ctx.p].trash.map((u) => g.objs.get(u)!).filter(isGear)
      const r = yield* choose(g, ctx.p, 'Aspiring Engineer: quale equipaggiamento riprendi dal trash?', list.map((o) => ({ label: o.card.name, uid: o.uid, ai: o.card.energy ?? 0 })), 1, 1)
      if (!r) return false
      ctx.data.t = list[r[0]]
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (t.zone !== 'trash') return
      moveZone(g, t, 'hand')
      log(g, `${t.card.name} torna in mano dal trash.`, undefined, ctx.p)
    },
  },
})

register('Cloud Drake', {
  play: {
    label: 'pesca 1',
    resolve: function* (g, ctx) {
      yield* draw(g, ctx.p, 1)
    },
  },
})

register('Dredge Up', {
  flow: { energy: 2, power: [] },
  resolve: function* (g, ctx) {
    yield* draw(g, ctx.p, 1)
  },
  ai: () => 1,
})

register('Mesmerize', {
  static: { reaction: true },
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const modes = [
      { label: 'Rimanda in mano un’unità amica', ok: units(g).some(mineOf(ctx)) },
      { label: 'Un’unità nemica ottiene -2 Might', ok: units(g).some(enemyOf(ctx)) },
    ]
    const ok = modes.map((m, i) => ({ ...m, i })).filter((m) => m.ok)
    const r = yield* choose(g, ctx.p, 'Mesmerize: scegli una modalità', ok.map((m) => ({ label: m.label, ai: m.i })), 1, 1, { cancel: true })
    if (!r) return false
    ctx.data.mode = ok[r[0]].i
    const t =
      ctx.data.mode === 0
        ? yield* chooseUnit(g, ctx, 'Mesmerize: quale unità amica torna in mano?', mineOf(ctx), (o) => (o.damage > 0 ? 10 : 0), { cancel: true })
        : yield* chooseUnit(g, ctx, 'Mesmerize: quale unità nemica ottiene -2 Might?', enemyOf(ctx), aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (!alive(g, t)) return
    if (ctx.data.mode === 0) yield* returnToHand(g, t)
    else giveMight(g, t, -2, 'Mesmerize')
  },
  ai: (g, p) => (g.showdown?.combat && units(g).some((o) => o.controller !== p && o.loc === g.showdown!.loc) ? 1 : 0),
})

register('Shock Blast', {
  static: { action: true },
  discount: (g, p) => (anyEmpowered(g, p) ? { energy: 2 } : {}),
  canPlay: (g) => units(g).some((o) => isBf(o.loc)),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Shock Blast: a quale unità in un campo infliggi 4?', (o) => isBf(o.loc), aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (alive(g, t)) deal(g, t, 4, 'Shock Blast')
  },
  ai: () => 1,
})

register('Apprentice Mage', {
  empower: { energy: 2 },
  might: (_g, self) => (self.empowered ? 1 : 0),
  empowered: {
    label: 'Predict 2',
    resolve: function* (g, ctx) {
      yield* predict(g, ctx.p, 2)
    },
  },
})

register('Sky Cruiser', {
  abilities: [
    {
      id: 'sky-cruiser',
      label: 'Scarta un equipaggiamento, [1], esaurisci: 4 danni a un’unità in un campo',
      speed: 'normal',
      rule: '415.5',
      cost: () => ({ energy: 1, power: [] }),
      can: (g, self) => self.zone === 'board' && !self.exhausted && g.players[self.controller].hand.some((u) => isGear(g.objs.get(u)!)) && units(g).some((o) => isBf(o.loc)),
      prepare: function* (g, ctx) {
        const t = yield* chooseUnit(g, ctx, 'Sky Cruiser: a quale unità in un campo infliggi 4?', (o) => isBf(o.loc), aiHarm(ctx, g), { cancel: true })
        if (!t) return false
        ctx.data.t = t
        return true
      },
      payExtra: function* (g, self) {
        const list = g.players[self.controller].hand.map((u) => g.objs.get(u)!).filter(isGear)
        const r = yield* choose(g, self.controller, 'Sky Cruiser: quale equipaggiamento scarti?', list.map((o) => ({ label: o.card.name, uid: o.uid, ai: -(o.card.energy ?? 0) })), 1, 1)
        if (!r) return false
        moveZone(g, list[r[0]], 'trash')
        log(g, `Scarta ${list[r[0]].card.name}.`, '359', self.controller)
        self.exhausted = true
        return true
      },
      resolve: function* (g, ctx) {
        const t = ctx.data.t as Obj
        if (alive(g, t)) deal(g, t, 4, 'Sky Cruiser')
      },
    },
  ],
})

register('Fate Weaver', {
  play: {
    label: 'guarda le prime 4 carte: puoi pescare una magia da 4 o più',
    resolve: function* (g, ctx) {
      const pl = g.players[ctx.p]
      const top = pl.deck.slice(0, 4).map((u) => g.objs.get(u)!)
      if (!top.length) return
      const ok = top.filter((o) => /Spell/.test(o.card.type) && (o.card.energy ?? 0) >= 4)
      const r = ok.length ? yield* choose(g, ctx.p, 'Fate Weaver: quale magia da 4 o più riveli e peschi? (puoi non sceglierne)', ok.map((o) => ({ label: o.card.name, uid: o.uid, ai: o.card.energy ?? 0 })), 0, 1) : []
      const taken = r?.length ? ok[r[0]] : null
      if (taken) {
        moveZone(g, taken, 'hand')
        log(g, `Rivela e pesca ${taken.card.name}.`, undefined, ctx.p)
      }
      // le altre si riciclano in fondo al mazzo (417)
      for (const o of top) if (o !== taken) moveZone(g, o, 'deck', { bottom: true })
      log(g, `Ricicla ${top.length - (taken ? 1 : 0)} carte.`, '417', ctx.p)
    },
  },
})

// ---------------------------------------------------------------- Body

register('Nazuman Ntofo', {
  equip: [],
  equipCost: () => ({ energy: 1, power: [] }),
})

register('Jagged Cutlass', { equip: ['Body'] })

const deployGearAt = (g: Game, p: PID, loc: LocId | null) => isBf(loc) && board(g).some((o) => isGear(o) && o.controller === p && o.loc === loc && o.attachedTo === null)

register('Overloaded Traveler', {
  // "While there's a friendly gear with [Deploy] at my battlefield": gli equipaggiamenti non attaccati in un campo sono quelli con Deploy (830)
  might: (g, self) => (deployGearAt(g, self.controller, self.loc) ? 1 : 0),
})

register('Stalwart Goatherd', {
  static: { shield: 2 },
  play: {
    label: 'puoi uccidere un equipaggiamento da 4 o meno',
    when: (g) => gears(g).some((o) => (o.card.energy ?? 0) <= 4),
    prepare: function* (g, ctx) {
      const t = yield* chooseGear(g, ctx.p, 'Stalwart Goatherd: quale equipaggiamento da 4 o meno uccidi? (puoi non sceglierne)', (o) => (o.card.energy ?? 0) <= 4, true)
      ctx.data.t = t
      return !!t
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (alive(g, t)) yield* kill(g, [t], 'Stalwart Goatherd')
    },
  },
})

register('Avalanche', {
  resolve: function* (g) {
    for (const o of units(g).filter((u) => u.loc === 'base0' || u.loc === 'base1')) deal(g, o, 3, 'Avalanche')
  },
  ai: (g, p) => {
    const inBase = units(g).filter((u) => u.loc === 'base0' || u.loc === 'base1')
    return inBase.filter((o) => o.controller !== p).length > inBase.filter((o) => o.controller === p).length ? 1 : 0
  },
})

register('Primordial Roar', {
  showOff: { label: 'un’unità', filter: (_g, o) => isUnit(o) || /Unit/.test(o.card.type) },
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Primordial Roar: a quale unità infliggi danni pari alla Might dell’unità mostrata?', () => true, aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const shown = ctx.data.showed as { might: number } | undefined
    const t = ctx.data.t as Obj
    if (shown && alive(g, t)) deal(g, t, shown.might, 'Primordial Roar')
  },
  ai: (g, p) => (units(g).some((o) => o.controller !== p) ? 1 : 0),
})

register('Guttural Roar', {
  static: { action: true },
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Guttural Roar: quale unità ottiene +2 Might (+4 se Empowered)?', () => true, aiHelp(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (alive(g, t)) giveMight(g, t, t.empowered ? 4 : 2, 'Guttural Roar')
  },
  ai: (g, p) => (g.showdown?.combat && units(g).some((o) => o.controller === p && o.loc === g.showdown!.loc) ? 1 : 0),
})

register('Brutal Hunter', {
  empower: { energy: 3 },
  might: (_g, self) => (self.empowered ? 2 : 0),
  keywords: (_g, self) => (self.empowered ? { ganking: true } : {}),
})

register('Repair Specialist', {
  keywords: (g, self) => ({ assault: board(g).filter((o) => isGear(o) && o.controller === self.controller).length }),
})

// ---------------------------------------------------------------- Order

register('Solari Sunhawk', {
  empower: { energy: 2 },
  might: (_g, self) => (self.empowered ? 1 : 0),
  keywords: (_g, self) => (self.empowered ? { deflect: 2 } : {}),
})

// ---------------------------------------------------------------- Chaos

register('Disposal Expert', {
  static: { disarm: 2 },
  entersReady: (g, self) => !units(g).some((o) => o.controller === self.controller && o !== self),
})

register('Spiderling', {
  static: { hidden: true },
  might: (g, self) => (self.loc ? friendlyAt(g, self.controller, self.loc).filter((o) => o !== self && o.card.name === 'Spiderling').length : 0),
})

// ---------------------------------------------------------------- campi di battaglia

register('Packed Amphitheater', {
  bfMight: (_g, u) => (u.card.type === 'Champion Unit' ? 1 : 0),
})

register('Cosmic Vista', {
  bfHold: {
    label: 'se il tuo Rune Deck è vuoto, 1 punto',
    when: (g, self) => g.players[self.controller].runeDeck.length === 0,
    resolve: function* (g, ctx) {
      if (!g.players[ctx.p].runeDeck.length) gainPoints(g, ctx.p, 1, '470.2', 'Cosmic Vista') // "score 1 point" = guadagnare un punto, senza i limiti del punto finale (473.1.a.1)
    },
  },
})
