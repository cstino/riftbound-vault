// Carte del mazzo Evelynn (Showdown Decks: Seraphine vs Evelynn). Test in src/test/game-cards-evelynn.test.ts.
import { implOf, register } from './registry'
import {
  addAnyPower,
  addMod,
  alive,
  baseOf,
  bfAt,
  canPay,
  channel,
  choose,
  chooseUnit,
  discard,
  draw,
  gainPoints,
  isBf,
  log,
  moveUnits,
  moveZone,
  pay,
  playToken,
  predict,
  stun,
  units,
} from './engine'
import { aiHarm, aiHelp, chooseDest, giveMight } from './cards'
import { GOLD } from './cards-vi'
import type { Obj } from './types'

const goldExhausted = function* (g: import('./types').Game, ctx: import('./registry').Ctx) {
  yield* playToken(g, ctx.p, GOLD, baseOf(ctx.p), { exhausted: true })
}

register("Evelynn - Agony's Embrace", {
  // "Once each turn, when you play a card from face down, draw 1. Then, if it's not your turn, discard 1."
  facedownPlays: {
    label: 'pesca 1 (e scarta 1 se non è il tuo turno)',
    when: (g, self) => !g.turnFlags.has(`agony-${self.controller}`),
    prepare: function* (g, ctx) {
      g.turnFlags.add(`agony-${ctx.p}`)
      return true
    },
    resolve: function* (g, ctx) {
      yield* draw(g, ctx.p, 1)
      if (g.turnPlayer !== ctx.p) yield* discard(g, ctx.p, 1)
    },
  },
})

register('Evelynn, Consuming', {
  static: { ambush: true },
  facedownPlays: {
    label: 'mi prepara e mi dà +1 Might in questo turno',
    resolve: function* (g, ctx) {
      if (!alive(g, ctx.self)) return
      ctx.self.exhausted = false
      giveMight(g, ctx.self, 1, 'Evelynn, Consuming')
    },
  },
})

register('Evelynn, In Control', {
  static: { disarm: 1 },
  hold: {
    label: 'se controlli una carta coperta qui, 1 punto',
    resolve: function* (g, ctx) {
      const loc = ctx.self.loc
      if (!isBf(loc) || !bfAt(g, loc).facedown.some((u) => g.objs.get(u)!.controller === ctx.p)) return
      gainPoints(g, ctx.p, 1, '471', 'Evelynn, In Control')
    },
  },
})

register('Evelynn, Entrancing', {
  static: { hidden: true, backline: true },
  play: {
    label: 'puoi spostare qui un’unità nemica da un’altra posizione',
    // "When you play me from face down on your turn"
    when: (g, self) => g.turnPlayer === self.controller,
    prepare: function* (g, ctx) {
      if (!ctx.hiddenAt) return false
      // 811.1.d.3: "at a different location" non si può scegliere nel campo, quindi la scelta è libera
      ctx.data.__noHiddenRestriction = true
      const t = yield* chooseUnit(g, ctx, 'Evelynn: quale unità nemica sposti nel suo campo?', (o) => o.controller !== ctx.p && o.loc !== ctx.self.loc, aiHarm(ctx, g), { cancel: true })
      if (!t) return false
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (alive(g, t) && alive(g, ctx.self) && isBf(ctx.self.loc)) yield* moveUnits(g, [t], ctx.self.loc, 'Evelynn, Entrancing', '448')
    },
  },
})

register('Last Caress', {
  static: { reaction: true },
  resolve: function* (g, ctx) {
    g.players[ctx.p].anyBf = 1
    log(g, 'La prossima unità che giochi in questo turno può andare in qualsiasi campo e riceverà un buff.', undefined, ctx.p)
  },
  ai: (g, p) => (g.turnPlayer === p && g.phase === 'main' && !g.chain.length && g.players[p].hand.length >= 2 ? 0.4 : 0),
})

register('Bushwhack Trap', {
  static: { deploy: true },
  // "While you or an ally control this battlefield, that player may hide an additional card here"
  hideExtra: (_g, self, bf) => (bf.controller === self.controller ? 1 : 0),
})

register("K'Sante, Courageous", {
  static: { accelerate: true, shield: 2 },
  hold: {
    label: 'canalizza 1 runa',
    resolve: function* (g, ctx) {
      yield* channel(g, ctx.p, 1)
    },
  },
})

register('Gutter Guardian', {
  static: { hidden: true },
  showOff: { label: 'una carta con Hidden', filter: (_g, o) => o.zone !== 'facedown' && !!implOfHidden(o) },
  play: {
    label: 'se hai mostrato una carta, aggiungi 1 Power di qualsiasi dominio',
    prepare: function* (_g, ctx) {
      return !!ctx.data.showed
    },
    resolve: function* (g, ctx) {
      addAnyPower(g, ctx.p, 1, 'Gutter Guardian')
    },
  },
})

function implOfHidden(o: Obj) {
  return implOf(o.card.name).static?.hidden // 811.5
}

register('Demon Shade', {
  static: { hidden: true },
  canPlay: (g, ctx) => units(g).some((o) => o.controller === ctx.p),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Demon Shade: quale tua unità?', (o) => o.controller === ctx.p, aiHelp(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    const open = g.bfs.filter((b) => b.controller === null && !units(g).some((o) => o.loc === b.loc)) // 170.11.c
    const r = yield* choose(
      g,
      ctx.p,
      'Demon Shade: scegli un effetto',
      [
        { label: 'Spostala in un campo libero', ai: open.length ? 2 : 0 },
        { label: 'Ganking in questo turno, se non ci sono campi liberi', ai: open.length ? 0 : 1 },
      ],
      1,
      1,
      { cancel: true, rule: '355.3' },
    )
    if (!r) return false
    ctx.data.mode = r[0]
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (!alive(g, t)) return
    const open = g.bfs.filter((b) => b.controller === null && !units(g).some((o) => o.loc === b.loc))
    if (ctx.data.mode === 0) {
      if (!open.length) return
      const r = open.length === 1 ? [0] : yield* choose(g, ctx.p, `In quale campo libero sposti ${t.card.name}?`, open.map((b) => ({ label: b.card.name, loc: b.loc })), 1, 1)
      if (r) yield* moveUnits(g, [t], open[r[0]].loc, 'Demon Shade', '448')
    } else if (!open.length) {
      addMod(t, { source: 'Demon Shade', ganking: true })
      log(g, `${t.card.name} ottiene Ganking in questo turno.`, undefined, t.controller)
    }
  },
  ai: (g, p) => (g.turnPlayer === p && g.bfs.some((b) => b.controller === null && !units(g).some((o) => o.loc === b.loc)) ? 0.6 : 0),
})

register('The Good Stuff', {
  static: { deploy: true },
  play: {
    label: 'scarta 1, poi pesca 3',
    resolve: function* (g, ctx) {
      yield* discard(g, ctx.p, 1)
      yield* draw(g, ctx.p, 3)
    },
  },
  hold: {
    label: 'torna nella mano del proprietario',
    resolve: function* (g, ctx) {
      if (!alive(g, ctx.self)) return
      log(g, `${ctx.self.card.name} torna nella mano del proprietario.`, undefined, ctx.p)
      moveZone(g, ctx.self, 'hand')
    },
  },
})

register('Elnuk Herd', {
  static: { hidden: true },
  play: {
    label: 'un’altra tua unità +3 Might in questo turno; riciclami se giocata da coperta',
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Elnuk Herd: quale altra tua unità ottiene +3 Might?', (o) => o.controller === ctx.p && o !== ctx.self, aiHelp(ctx, g))
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj | null
      if (t) giveMight(g, t, 3, 'Elnuk Herd')
      if (ctx.hiddenAt && alive(g, ctx.self)) {
        log(g, 'Elnuk Herd torna in fondo al mazzo (giocata da coperta).', '417', ctx.p)
        moveZone(g, ctx.self, 'deck', { bottom: true })
      }
    },
  },
})

register('Reckless Innovator', {
  static: { accelerate: true },
  exhausted: {
    label: 'token Gold esausto, oppure paga 1 Chaos per pescare 1',
    prepare: function* (g, ctx) {
      const canDraw = canPay(g, ctx.p, { energy: 0, power: [['Chaos']] })
      const opts = [{ label: 'Gioca un token Gold esausto', ai: 1 }, ...(canDraw ? [{ label: 'Paga 1 Chaos per pescare 1', ai: 0.5 }] : [])]
      const r = yield* choose(g, ctx.p, 'Reckless Innovator: scegli un effetto', opts, 1, 1, { rule: '355.3' })
      ctx.data.mode = r?.[0] ?? 0
      // 740.4.a.2: "Pay [C] to draw 1" si paga alla finalizzazione
      if (ctx.data.mode === 1) pay(g, ctx.p, { energy: 0, power: [['Chaos']] })
      return true
    },
    resolve: function* (g, ctx) {
      if (ctx.data.mode === 0) return yield* goldExhausted(g, ctx)
      yield* draw(g, ctx.p, 1)
    },
  },
})

register('Pitiless Stalker', {
  abilities: [
    {
      id: 'stalker',
      label: 'Esaurisci: Stun a un’unità nemica',
      speed: 'normal',
      rule: '377.1',
      cost: () => ({ energy: 0, power: [] }),
      can: (g, self) => self.zone === 'board' && !self.exhausted && units(g).some((o) => o.controller !== self.controller),
      payExtra: function* (_g, self) {
        self.exhausted = true
        return true
      },
      prepare: function* (g, ctx) {
        const t = yield* chooseUnit(g, ctx, 'Pitiless Stalker: quale unità nemica stordisci?', (o) => o.controller !== ctx.p, aiHarm(ctx, g))
        if (!t) return false
        ctx.data.t = t
        return true
      },
      resolve: function* (g, ctx) {
        const t = ctx.data.t as Obj
        if (alive(g, t)) stun(g, t)
      },
    },
  ],
})

register('Sneaky Zeebles', {
  conquer: {
    label: 'aggiungi 1 Power di qualsiasi dominio',
    resolve: function* (g, ctx) {
      addAnyPower(g, ctx.p, 1, 'Sneaky Zeebles')
    },
  },
})

register('Siren of the Shallows', { static: { disarm: 1, ganking: true } })

register("Hold 'Em", {
  static: { action: true },
  discount: (g, p) => (g.turnFlags.has(`bfplay-${p}`) ? { energy: 2 } : {}),
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, "Hold 'Em: quale unità ottiene +3 Might?", () => true, aiHelp(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    giveMight(g, ctx.data.t as Obj, 3, "Hold 'Em")
  },
  ai: (g, p) => (g.showdown?.combat && units(g).some((o) => o.controller === p && o.loc === g.showdown!.loc) ? 1 : 0),
})

register("The Waters' Wage", {
  static: { hidden: true },
  resolve: function* (g, ctx) {
    if (g.turnPlayer === ctx.p && ctx.hiddenAt) {
      for (let i = 0; i < 3; i++) yield* playToken(g, ctx.p, GOLD, baseOf(ctx.p))
    } else yield* goldExhausted(g, ctx)
  },
  ai: () => 0.4,
})

register('Momentary Companion', {
  static: { hidden: true },
  play: {
    label: 'se non è il tuo turno, ottengo Temporary',
    when: (g, self) => g.turnPlayer !== self.controller,
    resolve: function* (g, ctx) {
      if (!alive(g, ctx.self)) return
      ctx.self.temporary = true
      log(g, `${ctx.self.card.name} ottiene Temporary.`, '816', ctx.p)
    },
  },
})

register('Suave Negotiator', {
  play: {
    label: 'tu e l’avversario pescate 1',
    resolve: function* (g, ctx) {
      yield* draw(g, ctx.p, 1)
      yield* draw(g, ctx.p === 0 ? 1 : 0, 1)
    },
  },
})

register('Pakaa Cub', { static: { hidden: true } })

register('Wrath of the Freljord', { static: { shield: 3 }, entersReady: () => true })

register('Black Market Broker', {
  facedownPlays: { label: 'gioca un token Gold esausto', resolve: goldExhausted },
})

register("Siren's Song", {
  static: { reaction: true },
  canPlay: (g, ctx) => units(g).some((o) => o.controller !== ctx.p && o.moves > 0),
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, "Siren's Song: quale unità nemica, mossa in questo turno, sposti?", (o) => o.controller !== ctx.p && o.moves > 0, aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    const dest = yield* chooseDest(g, ctx, t, (l) => (l === baseOf(t.controller) ? 2 : 0))
    if (!dest) return false
    ctx.data.t = t
    ctx.data.dest = dest
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (alive(g, t)) yield* moveUnits(g, [t], ctx.data.dest as import('./types').LocId, "Siren's Song", '448')
  },
  ai: (g, p) => (g.showdown?.combat && units(g).some((o) => o.controller !== p && o.moves > 0 && o.loc === g.showdown!.loc) ? 1 : 0),
})

register("Bandle Scouts' Academy", {
  bfHide: { label: 'gioca un token Gold esausto', resolve: goldExhausted },
})

register('Rakelstake', {
  // "For each player, the first time they play a unit or gear here each turn, they [Predict]."
  bfPermPlayed: {
    label: 'Predict',
    when: (g, self) => !g.turnFlags.has(`rakel-${self.controller}`),
    prepare: function* (g, ctx) {
      g.turnFlags.add(`rakel-${ctx.p}`)
      return true
    },
    resolve: function* (g, ctx) {
      yield* predict(g, ctx.p, 1)
    },
  },
})

register('Bandle Tree', { hideExtra: () => 1 })
