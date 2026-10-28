// Partite complete PC contro PC: il motore non deve bloccarsi né creare stati illegali.
import { describe, expect, it } from 'vitest'
import { Match } from '../lib/game'
import { units } from '../lib/game/engine'
import { spec } from './gameHelpers'

describe('partite complete PC contro PC', () => {
  const PAIRS = [
    ['Zed', 'Shen'],
    ['Vi', 'Zed'],
    ['Shen', 'Vi'],
    ['Rumble', 'Vi'],
    ['Zed', 'Rumble'],
    ['Rumble', 'Shen'],
    ['Seraphine', 'Zed'],
    ['Vi', 'Seraphine'],
    ['Seraphine', 'Rumble'],
    ['Evelynn', 'Seraphine'],
    ['Shen', 'Evelynn'],
    ['Evelynn', 'Vi'],
    ['Fiora', 'Zed'],
    ['Rumble', 'Fiora'],
    ['Fiora', 'Evelynn'],
  ] as const
  for (let seed = 1; seed <= 90; seed++) {
    const pair = PAIRS[seed % PAIRS.length]
    const decks = seed % 2 ? pair : ([pair[1], pair[0]] as const)
    it(`${decks[0]} contro ${decks[1]}, seed ${seed}`, () => {
      const m = new Match([spec(decks[0]), spec(decks[1])], [decks[0], decks[1]], null, seed)
      let d = m.next()
      for (let i = 0; d && i < 300000; i++) {
        const g = m.g
        for (const u of units(g)) {
          // 107.1.c: le unità stanno solo nella base di chi le controlla
          if (u.loc === 'base0') expect(u.controller).toBe(0)
          if (u.loc === 'base1') expect(u.controller).toBe(1)
        }
        if (d.type === 'act' && d.context === 'main' && !g.chain.length) {
          for (const b of g.bfs) {
            const who = new Set(units(g).filter((u) => u.loc === b.loc).map((u) => u.controller))
            expect(who.size, 'due giocatori nello stesso campo fuori dal combattimento').toBeLessThan(2)
            // 323.5: chi controlla un campo ci ha almeno un'unità
            if (b.controller !== null) expect(who.has(b.controller)).toBe(true)
          }
          expect(g.players[g.turnPlayer].runes.length).toBeLessThanOrEqual(12)
        }
        d = m.next(m.aiAnswer(d))
      }
      expect(m.g.winner).not.toBeNull()
      expect(m.g.players[m.g.winner!].points).toBeGreaterThanOrEqual(8)
    })
  }
})
