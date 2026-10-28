import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Card } from '../lib/types'
import type { CardDb } from '../lib/data'
import { validateDeck } from '../lib/deck'
import { type Product, productDeckToDeck } from '../lib/products'

const cards: Card[] = JSON.parse(readFileSync('public/data/cards.json', 'utf8'))
const products: Product[] = JSON.parse(readFileSync('public/data/products.json', 'utf8'))
const db: CardDb = {
  cards,
  byId: new Map(cards.map((c) => [c.id, c])),
  champions: new Set(cards.filter((c) => c.type === 'Champion Unit').map((c) => c.short_name)),
  tags: new Set(cards.flatMap((c) => c.tags)),
}

describe('mazzi ufficiali in vendita', () => {
  for (const p of products) {
    for (const d of p.decks) {
      it(`${p.name}: il mazzo ${d.name} è legale`, () => {
        expect(validateDeck(productDeckToDeck(d, db), db)).toEqual([])
      })
    }
  }
  it('le carte incerte sono segnalate e spiegate', () => {
    const uncertain = products.flatMap((p) => p.decks.flatMap((d) => d.cards.filter((e) => e.uncertain)))
    expect(uncertain.map((e) => e.uncertain!.printed)).toEqual(['Shadowcloaked Assassin'])
  })
})
