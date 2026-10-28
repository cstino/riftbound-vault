// Copertura del motore: ogni carta registrata ha un test, e i mazzi dichiarati giocabili lo sono davvero.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REGISTRY, deckCoverage } from '../lib/game'
import { db, officialDeck } from './gameHelpers'

/** Nomi testati: ogni `card('Nome', ...)` nei file src/test/game-cards*.test.ts. */
const TESTED = new Set(
  readdirSync('src/test')
    .filter((f) => /^game-cards.*\.test\.ts$/.test(f))
    .flatMap((f) => [...readFileSync(`src/test/${f}`, 'utf8').matchAll(/card\('((?:[^'\\]|\\.)+)'/g)].map((m) => m[1].replace(/\\'/g, "'"))),
)
// le rune base sono testate a parte con un ciclo
for (const r of ['Fury Rune', 'Chaos Rune', 'Calm Rune', 'Order Rune', 'Mind Rune', 'Body Rune']) TESTED.add(r)

const PLAYABLE = ['Zed', 'Shen', 'Vi', 'Rumble', 'Seraphine', 'Evelynn']

describe('copertura', () => {
  for (const name of PLAYABLE) {
    it(`il mazzo ${name} è giocabile e ogni sua carta è testata`, () => {
      const deck = officialDeck(name)
      const cov = deckCoverage(deck, db)
      expect(cov.missing).toEqual([])
      expect(cov.playable).toBe(true)
      const ids = [deck.legendId!, ...Object.keys(deck.main), ...Object.keys(deck.runes), ...deck.battlefields]
      for (const id of ids) expect(TESTED.has(db.byId.get(id)!.name), db.byId.get(id)!.name).toBe(true)
    })
  }

  it('ogni carta registrata ha un test', () => {
    for (const n of REGISTRY.keys()) expect(TESTED.has(n), n).toBe(true)
  })

  it('le parole chiave dichiarate compaiono nel testo stampato', () => {
    const words: Record<string, string> = {
      action: 'Action',
      reaction: 'Reaction',
      ambush: 'Ambush',
      hidden: 'Hidden',
      shield: 'Shield',
      tank: 'Tank',
      assault: 'Assault',
      deflect: 'Deflect',
      backline: 'Backline',
      ganking: 'Ganking',
      accelerate: 'Accelerate',
      disarm: 'Disarm',
      deploy: 'Deploy',
    }
    for (const [name, impl] of REGISTRY) {
      const c = db.cards.find((x) => x.name === name)
      if (!c || !impl.static) continue
      for (const k of Object.keys(impl.static)) expect(c.text ?? '', `${name}: ${words[k]}`).toContain(`[${words[k]}`)
    }
  })
})
