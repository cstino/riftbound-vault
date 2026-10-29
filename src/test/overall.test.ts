// Overall: vittorie attese in proporzione al mazzo migliore dei tornei recenti.
import { describe, expect, it } from 'vitest'
import { deckOverall, type MetaData } from '../lib/deck'
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
