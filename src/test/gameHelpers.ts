// Utilità condivise dai test del motore di partita.
import { readFileSync } from 'node:fs'
import type { Card } from '../lib/types'
import type { CardDb } from '../lib/data'
import { type Product, productDeckToDeck } from '../lib/products'
import { deckToSpec, type DeckSpec } from '../lib/game'

export const cards: Card[] = JSON.parse(readFileSync('public/data/cards.json', 'utf8'))
export const products: Product[] = JSON.parse(readFileSync('public/data/products.json', 'utf8'))
export const db: CardDb = {
  cards,
  byId: new Map(cards.map((c) => [c.id, c])),
  champions: new Set(cards.filter((c) => c.type === 'Champion Unit').map((c) => c.short_name)),
  tags: new Set(cards.flatMap((c) => c.tags)),
}

export function officialDeck(name: string) {
  for (const p of products) for (const d of p.decks) if (d.name === name) return productDeckToDeck(d, db)
  throw new Error(`mazzo ${name} non trovato`)
}

export const spec = (name: string): DeckSpec => deckToSpec(officialDeck(name), db)

export const byName = (name: string) => {
  const c = cards.find((x) => x.name === name && !x.alt_art && !x.signature)
  if (!c) throw new Error(`carta ${name} non trovata`)
  return c
}
