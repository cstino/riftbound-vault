// Carte del mazzo Vex (Champion Deck). Test in src/test/game-cards-vex.test.ts.
import { register, type TrigDef } from './registry'
import {
  addMod,
  alive,
  baseOf,

  buffUnit,
  canPay,
  channel,
  choose,
  chooseUnit,
  draw,
  effectDests,
  gainXp,
  isBf,
  kill,
  locName,
  log,
  might,
  moveUnits,
  pay,
  playToken,
  predict,
  returnToHand,
  stun,
  tokenCard,
  units,
  unitsAt,
  yesNo,
} from './engine'
import { aiHarm, aiHelp, giveMight } from './cards'
import type { Game, LocId, Obj, PID } from './types'

export const SPRITE = tokenCard('Sprite', 3, ['Fae'], '[Temporary]') // 187.2
register('Sprite', { static: { temporary: true } })

const xp = (g: Game, p: PID) => g.players[p].xp
const enemyStunned = (g: Game, p: PID) => units(g).some((o) => o.controller !== p && o.stunned)

/** Sposta un'unità nemica scelta in una destinazione valida (355.4); chi la sposta è ctx.p. */
function* moveEnemy(g: Game, ctx: import('./registry').Ctx, title: string, to?: LocId) {
  const t = yield* chooseUnit(g, ctx, title, (o) => o.controller !== ctx.p && (!to || o.loc !== to), aiHarm(ctx, g), { cancel: true })
  if (!t) return null
  let dest = to ?? null
  if (!dest) {
    const dests = effectDests(g, t)
    const r = yield* choose(g, ctx.p, `Dove sposti ${t.card.name}?`, dests.map((l) => ({ label: locName(g, l, ctx.p), loc: l, ai: l === baseOf(t.controller) ? 2 : 0 })), 1, 1, { cancel: true, rule: '355.4' })
    if (!r) return null
    dest = dests[r[0]]
  }
  return { t, dest }
}

register('Vex - Gloomist', {
  // "When you or an ally hold, you may exhaust me to draw 1."
  playerHold: {
    label: 'esaurisci me per pescare 1',
    when: (_g, self) => !self.exhausted,
    prepare: function* (g, ctx) {
      if (ctx.self.exhausted || !(yield* yesNo(g, ctx.p, 'Vex: esaurisci la Legend per pescare 1?', true))) return false
      ctx.self.exhausted = true
      return true
    },
    resolve: function* (g, ctx) {
      yield* draw(g, ctx.p, 1)
    },
  },
})

register('Vex, Apathetic', {
  static: { deflect: 1 },
  enemyPlays: {
    label: 'Stun all’unità appena giocata, che non può muoversi in questo turno',
    when: (_g, self) => isBf(self.loc),
    resolve: function* (g, ctx) {
      const u = ctx.data.unit as Obj
      if (!alive(g, u)) return
      stun(g, u, ctx.p)
      addMod(u, { source: 'Vex, Apathetic', noMove: true })
    },
  },
})

register('Vex, Cheerless', { spellCostInCombat: true })

register('Vex, Mocking', {
  static: { shield: 1, tank: true },
  stunEnemy: {
    label: 'puoi spostarmi nel campo dell’unità stordita',
    when: (_g, self) => self.zone === 'board',
    prepare: function* (g, ctx) {
      const u = ctx.data.unit as Obj
      if (!isBf(u.loc) || ctx.self.loc === u.loc) return false
      return !!(yield* yesNo(g, ctx.p, `Vex, Mocking: ti sposti a ${locName(g, u.loc, ctx.p)}?`, true))
    },
    resolve: function* (g, ctx) {
      const u = ctx.data.unit as Obj
      if (alive(g, ctx.self) && isBf(u.loc)) yield* moveUnits(g, [ctx.self], u.loc, 'Vex, Mocking', '421', ctx.p)
    },
  },
})

register('Mutated Mouser', { static: { shield: 2, tank: true } })

register('Monch', {
  discount: (g, p) => (enemyStunned(g, p) ? { energy: 2 } : {}),
  entersReady: (g, self) => enemyStunned(g, self.controller),
})

register('Existential Dread', {
  static: { action: true },
  repeat: { energy: 2 },
  canPlay: (g, ctx) => units(g).some((o) => o.controller !== ctx.p && o.role === 'attacker'),
  resolve: function* (g, ctx) {
    for (let i = 0; i < (ctx.repeat ? 2 : 1); i++) {
      const t = yield* chooseUnit(g, ctx, `Existential Dread${ctx.repeat ? ` (${i + 1} di 2)` : ''}: quale unità nemica in attacco?`, (o) => o.controller !== ctx.p && o.role === 'attacker', (o) => (o.stunned ? 20 : 10) + might(g, o))
      if (!t) return
      if (t.stunned) yield* returnToHand(g, t)
      else stun(g, t, ctx.p)
    }
  },
  ai: (g, p) => (g.showdown?.combat && g.showdown.defender === p ? 1 : 0),
})

register('Allay, Eager Admirer', {
  static: { deflect: 1 },
  // "While I'm at a battlefield, your other units here have [Deflect]."
  aura: (_g, self, t) => (isBf(self.loc) && t !== self && t.loc === self.loc ? { deflect: 1 } : null),
})

register('Back Off', {
  static: { hidden: true, action: true },
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Back Off: quale unità stordisci?', () => true, aiHarm(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    const t = ctx.data.t as Obj
    if (alive(g, t)) stun(g, t, ctx.p)
    if (ctx.data.src === 'hand') yield* draw(g, ctx.p, 1)
  },
  ai: (g, p) => (g.showdown?.combat && units(g).some((o) => o.controller !== p && o.loc === g.showdown!.loc) ? 1 : 0),
})

register('Enthusiastic Promoter', {
  static: { backline: true },
  hold: {
    label: 'buff a tutte le unità qui',
    resolve: function* (g, ctx) {
      for (const o of unitsAt(g, ctx.self.loc!)) buffUnit(g, o)
    },
  },
})

register('Trevor Snoozebottom', {
  static: { shield: 1 },
  hold: {
    label: 'gioca qui un token Sprite da 3, pronto, con Temporary',
    resolve: function* (g, ctx) {
      if (isBf(ctx.self.loc)) yield* playToken(g, ctx.p, SPRITE, ctx.self.loc, { ready: true })
    },
  },
})

register('Blast Cone', {
  play: {
    label: 'puoi spostare un’unità nemica',
    when: (g, self) => units(g).some((o) => o.controller !== self.controller),
    prepare: function* (g, ctx) {
      const m = yield* moveEnemy(g, ctx, 'Blast Cone: quale unità nemica sposti? (puoi annullare)')
      if (!m) return false
      ctx.data.m = m
      return true
    },
    resolve: function* (g, ctx) {
      const m = ctx.data.m as { t: Obj; dest: LocId }
      if (alive(g, m.t)) yield* moveUnits(g, [m.t], m.dest, 'Blast Cone', '421', ctx.p)
    },
  },
  enemyMoved: {
    label: 'puoi esaurirmi per stordire l’unità spostata',
    when: (_g, self) => !self.exhausted,
    prepare: function* (g, ctx) {
      const u = ctx.data.unit as Obj
      if (ctx.self.exhausted || !(yield* yesNo(g, ctx.p, `Blast Cone: esaurisci per stordire ${u.card.name}?`, true))) return false
      ctx.self.exhausted = true
      return true
    },
    resolve: function* (g, ctx) {
      const u = ctx.data.unit as Obj
      if (alive(g, u)) stun(g, u, ctx.p)
    },
  },
})

register('Megatusk', {
  abilities: [
    {
      id: 'megatusk',
      label: 'Spendi 3 XP: le tue unità qui ottengono Ganking',
      speed: 'normal',
      rule: '730.2',
      cost: () => ({ energy: 0, power: [] }),
      can: (g, self) => self.zone === 'board' && xp(g, self.controller) >= 3,
      payExtra: function* (g, self) {
        g.players[self.controller].xp -= 3
        log(g, 'Spende 3 XP.', '730.2', self.controller)
        return true
      },
      resolve: function* (g, ctx) {
        for (const o of units(g).filter((o) => o.controller === ctx.p && o.loc === ctx.self.loc)) addMod(o, { source: 'Megatusk', ganking: true })
        log(g, 'Le tue unità lì ottengono Ganking in questo turno.', undefined, ctx.p)
      },
    },
  ],
})

register('Nami, Headstrong', {
  optional: { label: 'paga 1 Calm come costo aggiuntivo per stordire un’unità nemica', power: ['Calm'] },
  play: {
    label: 'se hai pagato il costo aggiuntivo, Stun a un’unità nemica',
    when: (g, self) => units(g).some((o) => o.controller !== self.controller),
    prepare: function* (g, ctx) {
      if (!ctx.paid) return false
      const t = yield* chooseUnit(g, ctx, 'Nami: quale unità nemica stordisci?', (o) => o.controller !== ctx.p, aiHarm(ctx, g))
      if (!t) return false
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (alive(g, t)) stun(g, t, ctx.p)
    },
  },
  hold: {
    label: 'la prossima unità che giochi in questo turno si prepara e riceve un buff',
    resolve: function* (g, ctx) {
      g.players[ctx.p].namiNext = 1
      log(g, 'La prossima unità che giochi in questo turno si preparerà e riceverà un buff.', undefined, ctx.p)
    },
  },
})

const iascyllaMove: TrigDef = {
  label: 'Iascylla: puoi spostare un’unità nemica in quel campo',
  prepare: function* (g, ctx) {
    const loc = ctx.data.loc as LocId
    if (!units(g).some((o) => o.controller !== ctx.p && o.loc !== loc)) return false
    const m = yield* moveEnemy(g, ctx, 'Iascylla: quale unità nemica sposti? (puoi annullare)', loc)
    if (!m) return false
    ctx.data.m = m
    return true
  },
  resolve: function* (g, ctx) {
    const m = ctx.data.m as { t: Obj; dest: LocId }
    if (alive(g, m.t)) yield* moveUnits(g, [m.t], m.dest, 'Iascylla', '421', ctx.p)
  },
}

register('Iascylla', {
  hold: {
    label: 'all’inizio della tua prossima fase principale potrai spostare qui un’unità nemica',
    resolve: function* (g, ctx) {
      if (!isBf(ctx.self.loc)) return
      g.players[ctx.p].atMain.push({ card: 'Iascylla', loc: ctx.self.loc })
    },
  },
  atMainStart: iascyllaMove,
})

register('Shadow', {
  entersReady: (_g, self) => isBf(self.loc),
  abilities: [
    {
      id: 'shadow',
      label: '1 energia, 1 Power, esaurisci: Stun a un’unità nemica che attacca qui',
      speed: 'action',
      rule: '377.1',
      cost: () => ({ energy: 1, power: [['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order']] }),
      can: (g, self) => self.zone === 'board' && !self.exhausted && units(g).some((o) => o.controller !== self.controller && o.role === 'attacker' && o.loc === self.loc),
      payExtra: function* (_g, self) {
        self.exhausted = true
        return true
      },
      prepare: function* (g, ctx) {
        const t = yield* chooseUnit(g, ctx, 'Shadow: quale unità nemica che attacca qui stordisci?', (o) => o.controller !== ctx.p && o.role === 'attacker' && o.loc === ctx.self.loc, aiHarm(ctx, g))
        if (!t) return false
        ctx.data.t = t
        return true
      },
      resolve: function* (g, ctx) {
        const t = ctx.data.t as Obj
        if (alive(g, t)) stun(g, t, ctx.p)
      },
    },
  ],
})

register("Scryer's Bloom", {
  entersExhausted: true,
  abilities: [
    {
      id: 'bloom',
      label: 'Uccidimi, 1 energia, esaurisci: Predict 2, pesca 1, 1 XP',
      speed: 'normal',
      rule: '377.1',
      cost: () => ({ energy: 1, power: [] }),
      can: (_g, self) => self.zone === 'board' && !self.exhausted,
      payExtra: function* (g, self) {
        self.exhausted = true
        yield* kill(g, [self], 'costo di Scryer’s Bloom', '357.2')
        return true
      },
      resolve: function* (g, ctx) {
        yield* predict(g, ctx.p, 2)
        yield* draw(g, ctx.p, 1)
        gainXp(g, ctx.p, 1, "Scryer's Bloom")
      },
    },
  ],
})

register('Soul Sword', { equip: ['Calm'] })

register('Mister Root', {
  static: { accelerate: true },
  move: {
    label: 'se mi sposto in un campo, 2 XP',
    when: (_g, self) => isBf(self.loc),
    resolve: function* (g, ctx) {
      gainXp(g, ctx.p, 2, 'Mister Root')
    },
  },
})

register('Skyward Strike', {
  canPlay: (g, ctx) => units(g).some((o) => o.controller !== ctx.p),
  prepare: function* (g, ctx) {
    const m = yield* moveEnemy(g, ctx, 'Skyward Strike: quale unità nemica sposti?')
    if (!m) return false
    ctx.data.m = m
    return true
  },
  resolve: function* (g, ctx) {
    const m = ctx.data.m as { t: Obj; dest: LocId }
    if (alive(g, m.t)) yield* moveUnits(g, [m.t], m.dest, 'Skyward Strike', '421', ctx.p)
    // [Level 6]: Stun a un'unità nemica (824.1.b.1)
    if (xp(g, ctx.p) >= 6) {
      const t = yield* chooseUnit(g, ctx, 'Skyward Strike (Level 6): quale unità nemica stordisci?', (o) => o.controller !== ctx.p, aiHarm(ctx, g))
      if (t) stun(g, t, ctx.p)
    }
  },
  ai: (g, p) => (units(g).some((o) => o.controller !== p && isBf(o.loc)) ? 0.6 : 0),
})

register('Combat Experience', {
  static: { reaction: true },
  canPlay: (g) => units(g).length > 0,
  prepare: function* (g, ctx) {
    const t = yield* chooseUnit(g, ctx, 'Combat Experience: quale unità ottiene Might?', () => true, aiHelp(ctx, g), { cancel: true })
    if (!t) return false
    ctx.data.t = t
    return true
  },
  resolve: function* (g, ctx) {
    giveMight(g, ctx.data.t as Obj, xp(g, ctx.p) >= 6 ? 3 : 1, 'Combat Experience') // [Level 6]
  },
  ai: (g, p) => (g.showdown?.combat && units(g).some((o) => o.controller === p && o.loc === g.showdown!.loc) ? 1 : 0),
})

register('Herald of Spring', {
  static: { hunt: 1 },
  play: {
    label: '2 XP',
    resolve: function* (g, ctx) {
      gainXp(g, ctx.p, 2, 'Herald of Spring')
    },
  },
})

register('Wuju Apprentice', {
  static: { hunt: 1 },
  play: {
    label: '[Level 6] pesca 1',
    when: (g, self) => xp(g, self.controller) >= 6,
    resolve: function* (g, ctx) {
      yield* draw(g, ctx.p, 1)
    },
  },
})

register('Mosstomper', {
  static: { hunt: 2 },
  // [Level 3]: +1 Might e Deflect
  might: (g, self) => (xp(g, self.controller) >= 3 ? 1 : 0),
  keywords: (g, self) => (xp(g, self.controller) >= 3 ? { deflect: 1 } : {}),
})

register('Amateur Recital', {
  bfHold: {
    label: 'puoi spostare un’unità in un campo nella sua base',
    when: (g) => units(g).some((o) => isBf(o.loc)),
    prepare: function* (g, ctx) {
      const t = yield* chooseUnit(g, ctx, 'Amateur Recital: quale unità in un campo rimandi nella sua base? (puoi annullare)', (o) => isBf(o.loc), (o) => (o.controller !== ctx.p ? 10 + might(g, o) : -10), { cancel: true })
      if (!t) return false
      ctx.data.t = t
      return true
    },
    resolve: function* (g, ctx) {
      const t = ctx.data.t as Obj
      if (alive(g, t) && isBf(t.loc)) yield* moveUnits(g, [t], baseOf(t.controller), 'Amateur Recital', '421', ctx.p)
    },
  },
})

register('Gardens of Becoming', {
  // "Units here have '[E]: Gain 1 XP.'"
  bfUnitAbilities: [
    {
      id: 'gardens',
      label: 'Esaurisci: 1 XP',
      speed: 'normal',
      rule: '377.1',
      cost: () => ({ energy: 0, power: [] }),
      can: (_g, self) => !self.exhausted,
      payExtra: function* (_g, self) {
        self.exhausted = true
        return true
      },
      resolve: function* (g, ctx) {
        gainXp(g, ctx.p, 1, 'Gardens of Becoming')
      },
    },
  ],
})

register("Ripper's Bay", {
  bfReturn: {
    label: 'puoi pagare 1 energia per canalizzare 1 runa esausta',
    prepare: function* (g, ctx) {
      // 740.4.a.2: costo nella prima parte dell'effetto, si paga alla finalizzazione
      if (!canPay(g, ctx.p, { energy: 1, power: [] })) return false
      if (!(yield* yesNo(g, ctx.p, "Ripper's Bay: paghi 1 energia per canalizzare 1 runa esausta?", true))) return false
      pay(g, ctx.p, { energy: 1, power: [] })
      return true
    },
    resolve: function* (g, ctx) {
      yield* channel(g, ctx.p, 1, true)
    },
  },
})


