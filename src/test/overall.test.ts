// Overall: vittorie attese in proporzione al mazzo migliore dei tornei recenti.
import { describe, expect, it } from 'vitest'
import { cardUsage, deckOverall, type MetaData } from '../lib/deck'
import { db, officialDeck } from './gameHelpers'

const deck = () => ({ ...officialDeck('Zed'), id: 't', name: 'Zed' })
const metaFor = (rate: number, cards: Record<string, number>, games = 1000): MetaData => {
  const legend = db.byId.get(deck().legendId!)!.name
  return {
    source: '',
    sourceUrl: '',
    days: 365,
    generatedAt: 0,
    goodRule: '',
    model: { days: 90, lists: 100, beta: 1, kl: 100, k: 40, best: 0.6 },
    legends: { [legend]: { lists: 10, good: 5, cards: {}, model: { rate, games, cards } } },
  }
}

describe('overall', () => {
  it('è il tasso di vittorie attese diviso quello del mazzo migliore', () => {
    const o = deckOverall(deck(), db, metaFor(0.48, {}))!
    expect(o.expected).toBeCloseTo(0.48)
    expect(o.overall).toBe(80) // 48% / 60%
    expect(o.low).toBeLessThan(o.expected)
    expect(o.high).toBeGreaterThan(o.expected)
  })

  it('le carte con effetto positivo lo alzano, in proporzione alle copie', () => {
    const d = deck()
    const [id, q] = Object.entries(d.main)[0]
    const name = db.byId.get(id)!.name
    const base = deckOverall(d, db, metaFor(0.48, {}))!
    const up = deckOverall(d, db, metaFor(0.48, { [name]: 0.2 }))!
    expect(up.expected).toBeCloseTo(0.48 + (0.2 * q) / 40)
    expect(up.overall).toBeGreaterThan(base.overall)
    expect(up.top[0].name).toBe(name)
  })

  it('senza dati sulla Legend non inventa un numero; con poche partite lo segnala', () => {
    const m = metaFor(0.5, {})
    m.legends = {}
    expect(deckOverall(deck(), db, m)).toBeNull()
    expect(deckOverall(deck(), db, metaFor(0.5, {}, 120))!.weak).toBe(true)
    expect(deckOverall(deck(), db, metaFor(0.9, {}))!.overall).toBe(100) // mai oltre 100
  })
})

describe('usabilità delle carte', () => {
  it('conta solo le liste delle Legend che possono usare la carta', () => {
    const zed = db.byId.get(deck().legendId!)!
    const other = db.cards.find((c) => /Legend/.test(c.type) && c.domains.every((d) => !zed.domains.includes(d)) && c.tags.length)!
    const card = db.cards.find((c) => c.type === 'Unit' && c.domains.length === 1 && zed.domains.includes(c.domains[0]) && !other.domains.includes(c.domains[0]))!
    const m: MetaData = {
      source: '',
      sourceUrl: '',
      days: 365,
      generatedAt: 0,
      goodRule: '',
      legends: {
        [zed.name]: { lists: 20, good: 10, cards: { [card.name]: { share: 0.4, copies: 2 } } },
        [other.name]: { lists: 50, good: 30, cards: {} },
      },
    }
    const u = cardUsage(db, m).get(card.name)!
    expect(u.possible).toBe(10) // le 30 liste dell'altra Legend non contano: non può usarla
    expect(u.used).toBe(4)
    expect(u.share).toBeCloseTo(0.4)
  })
})
