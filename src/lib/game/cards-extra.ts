// Carte aggiunte per i mazzi modificati dagli utenti (per ora lo Zed con le carte del Bilgewater).
// Ogni carta segue il testo stampato; i test sono in src/test/game-cards-extra.test.ts.
import type { Ctx } from './registry'
import { register } from './registry'
import { choose, isBf, locName, might, playToken, returnToHand, tokenCard, unitsAt, yesNo, chooseUnit } from './engine'
import { tokenLoc } from './cards'
import type { Game, LocId } from './types'

/** 187.10: Tentacle, token unità senza dominio da 1 Might con il tag Bilgewater. */
export const TENTACLE = tokenCard('Tentacle', 1, ['Bilgewater'], '')
register('Tentacle', {})

register('Up from the Deep', {
  // "Play two 1 [M] Tentacle unit tokens"; Flow [3]: si può giocare dal trash, poi va esiliata (829)
  flow: { energy: 3, power: [] },
  resolve: function* (g, ctx) {
    const loc = yield* tokenLoc(g, ctx) // 355.2.a: base o un campo che controlli
    for (let i = 0; i < 2; i++) yield* playToken(g, ctx.p, TENTACLE, loc)
  },
  ai: () => 1,
})

/** Valore per il PC di rimandare in mano un'unità nemica. */
const bounceValue = (g: Game, ctx: Ctx) => (o: Parameters<typeof might>[1]) => (o.controller === ctx.p ? -100 : might(g, o) + (o.card.energy ?? 0))

register('Bedeviling Stranger', {
  static: { hidden: true }, // 811
  play: {
    label: 'scegli un campo: con 4 o più unità, puoi rimandare in mano un’unità nemica lì',
    prepare: function* (g, ctx) {
      // giocata da nascosta, i bersagli sono solo nel campo in cui era (811.1.d.2)
      const locs: LocId[] = ctx.hiddenAt ? [ctx.hiddenAt] : g.bfs.map((b) => b.loc)
      const score = (l: LocId) => (unitsAt(g, l).length >= 4 ? 10 + unitsAt(g, l).filter((o) => o.controller !== ctx.p).length : 0)
      const r = yield* choose(g, ctx.p, 'Bedeviling Stranger: scegli un campo', locs.map((l) => ({ label: locName(g, l, ctx.p), loc: l, detail: `${unitsAt(g, l).length} unità`, ai: score(l) })), 1, 1)
      if (!r) return false
      ctx.data.loc = locs[r[0]]
      return true
    },
    resolve: function* (g, ctx) {
      const loc = ctx.data.loc as LocId
      if (!isBf(loc) || unitsAt(g, loc).length < 4) return // il numero si controlla alla risoluzione
      const enemies = unitsAt(g, loc).filter((o) => o.controller !== ctx.p)
      if (!enemies.length) return
      if (!(yield* yesNo(g, ctx.p, 'Rimandi in mano un’unità nemica in questo campo?', true))) return
      const t = yield* chooseUnit(g, ctx, 'Quale unità nemica torna in mano?', (o) => o.controller !== ctx.p && o.loc === loc, bounceValue(g, ctx), { cancel: true })
      if (t) yield* returnToHand(g, t)
    },
  },
})
