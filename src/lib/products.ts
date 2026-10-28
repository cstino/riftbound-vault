// Prodotti ufficiali (mazzi precostruiti) con le liste pubblicate da Riot: public/data/products.json,
// generato da scripts/import_precons.py.
import type { Deck } from './types'
import { type CardDb, legendChampionTag } from './data'

export interface ProductEntry {
  id: string
  qty: number
  section: 'legend' | 'champion' | 'main' | 'battlefield' | 'rune'
  /** Riga della lista ufficiale che non corrisponde con certezza a una carta. */
  uncertain?: { printed: string; note: string }
}

export interface Product {
  id: string
  name: string
  set: string
  kind: string
  source: string
  decks: { name: string; cards: ProductEntry[] }[]
}

/** Id del mazzo nel deck builder: lo stesso dei precostruiti importati all'inizio. */
export const presetDeckId = (deckName: string) => `preset-${deckName.toLowerCase()}`

/** Trasforma un mazzo di un prodotto nel formato del deck builder. `skip` esclude le righe incerte non confermate. */
export function productDeckToDeck(d: Product['decks'][number], db: CardDb, skip = new Set<string>()): Deck {
  const deck: Deck = {
    id: presetDeckId(d.name),
    name: d.name,
    legendId: null,
    championId: null,
    main: {},
    runes: {},
    battlefields: [],
    preset: true,
    updatedAt: Date.now(),
  }
  for (const e of d.cards) {
    if (e.uncertain && skip.has(e.uncertain.printed)) continue
    if (e.section === 'legend') deck.legendId = e.id
    else if (e.section === 'battlefield') deck.battlefields.push(e.id)
    else if (e.section === 'rune') deck.runes[e.id] = (deck.runes[e.id] ?? 0) + e.qty
    else deck.main[e.id] = (deck.main[e.id] ?? 0) + e.qty
  }
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  const tag = legend ? legendChampionTag(legend, db) : null
  deck.championId =
    d.cards.find((e) => e.section === 'champion' && tag && db.byId.get(e.id)?.tags.includes(tag))?.id ?? null
  return deck
}
