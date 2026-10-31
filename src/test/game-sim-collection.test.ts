// Partite complete PC contro PC con le carte della collezione (src/lib/game/cards-collection.ts)
// inserite nei mazzi ufficiali: il motore non deve bloccarsi né creare stati illegali.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Match, deckToSpec } from '../lib/game'
import { units } from '../lib/game/engine'
import { fitsIdentity, identityOf } from '../lib/deck'
import { db, officialDeck } from './gameHelpers'

/** Le carte registrate nel file della collezione, tranne i campi di battaglia. */
const NAMES = [...readFileSync('src/lib/game/cards-collection.ts', 'utf8').matchAll(/register\('([^']+)'/g)]
  .map((m) => db.cards.find((c) => c.name === m[1] && !c.alt_art)!)
  .filter((c) => c && c.type !== 'Battlefield')
const DECKS = ['Zed', 'Shen', 'Vi', 'Rumble', 'Seraphine', 'Evelynn', 'Fiora', 'Vex']

/** Il mazzo ufficiale con fino a 12 carte sostituite da carte della collezione dei suoi domini. */
function withCollection(name: string) {
  const d = officialDeck(name)
  const fit = NAMES.filter((c) => fitsIdentity(c, identityOf(d, db))).slice(0, 12)
  const main = { ...d.main }
  const out = Object.keys(main).filter((id) => id !== d.championId)
  fit.forEach((c, k) => {
    const o = out[k % out.length]
    if (--main[o] <= 0) delete main[o]
    main[c.id] = (main[c.id] ?? 0) + 1
  })
  return { deck: { ...d, main }, added: fit.length }
}

describe('partite con le carte della collezione', () => {
  for (const [i, name] of DECKS.entries()) {
    for (const seed of [11, 12, 13]) {
      it(`${name} con carte della collezione, seed ${seed}`, () => {
        const { deck, added } = withCollection(name)
        expect(added).toBeGreaterThan(0)
        const opp = officialDeck(DECKS[(i + 3) % DECKS.length])
        const m = new Match([deckToSpec(deck, db), deckToSpec(opp, db)], ['A', 'B'], null, seed)
        let d = m.next()
        for (let n = 0; d && n < 300000; n++) {
          for (const u of units(m.g)) {
            // 107.1.c: le unità stanno solo nella base di chi le controlla
            if (u.loc === 'base0') expect(u.controller).toBe(0)
            if (u.loc === 'base1') expect(u.controller).toBe(1)
          }
          d = m.next(m.aiAnswer(d))
        }
        expect(m.g.winner).not.toBeNull()
      })
    }
  }
})
