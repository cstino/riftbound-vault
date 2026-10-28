import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Card } from '../lib/types'
import type { CardDb } from '../lib/data'
import { deckFromLines, linesToCounts, parseList } from '../lib/importList'

const cards: Card[] = JSON.parse(readFileSync('public/data/cards.json', 'utf8'))
const db: CardDb = {
  cards,
  byId: new Map(cards.map((c) => [c.id, c])),
  champions: new Set(cards.filter((c) => c.type === 'Champion Unit').map((c) => c.short_name)),
  tags: new Set(cards.flatMap((c) => c.tags)),
}

// Lista ufficiale del mazzo Evelynn, copiata dalla pagina "The Radiance Overview" di Riot
const EVELYNN = `Evelynn Preconstructed Decklist
Legend:
Agony’s Embrace
Champion Options:
1 Evelynn, Consuming
1 Evelynn, In Control
2 Evelynn, Entrancing
Main Deck:
1 Last Caress
1 Bushwhack Trap
1 K'Sante, Courageous
2 Gutter Guardian
1 Demon Shade
1 The Good Stuff
2 Elnuk Herd
2 Reckless Innovator
2 Wind and Ghosts
1 Pitiless Stalker
3 Sneaky Zeebles
3 Siren of the Shallows
2 Hold 'Em
2 The Waters' Wage
2 Momentary Companion
2 Suave Negotiator
2 Pakaa Cub
2 Wrath of the Freljord
2 Black Market Broker
2 Siren's Song
Battlefields:
Bandle Scouts' Academy
Rakelstake
Bandle Tree`

describe('importazione di una lista', () => {
  const lines = parseList(EVELYNN, db)

  it('riconosce tutte le carte della lista ufficiale', () => {
    const missing = lines.filter((l) => !l.card).map((l) => l.raw)
    // Solo il titolo della lista non è una carta
    expect(missing).toEqual(['Evelynn Preconstructed Decklist'])
  })

  it('conta 40 carte del mazzo principale, la Legend e 3 campi', () => {
    const deck = deckFromLines(lines, 'Evelynn', db)
    expect(Object.values(deck.main).reduce((a, b) => a + b, 0)).toBe(40)
    expect(db.byId.get(deck.legendId!)?.name).toBe("Evelynn - Agony's Embrace")
    expect(deck.battlefields).toHaveLength(3)
    expect(db.byId.get(deck.championId!)?.tags).toContain('Evelynn')
  })

  it('accetta i formati "3x Nome" e "Nome x3"', () => {
    const l = parseList('3x Elnuk Herd\nElnuk Herd x2', db)
    expect(linesToCounts(l)).toEqual({ [l[0].card!.id]: 5 })
  })
})
