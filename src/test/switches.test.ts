// Scelta della carta da togliere quando il mazzo è pieno: solo fatti, nessun giudizio sulla forza.
import { describe, expect, it } from 'vitest'
import { replaceOptions } from '../lib/deck'
import { db, officialDeck } from './gameHelpers'

const deck = () => ({ ...officialDeck('Zed'), id: 'test', name: 'Zed' })

describe('carte da togliere', () => {
  it('il campione scelto resta sempre con almeno una copia (103.3.a)', () => {
    const d = deck()
    d.main[d.championId!] = 1
    expect(replaceOptions(d, db).some((o) => o.card.id === d.championId)).toBe(false)
  })

  it('prima le carte che non possiedi, con il conto delle copie', () => {
    const d = deck()
    const [first, ...rest] = Object.keys(d.main).filter((id) => id !== d.championId)
    const owned = Object.fromEntries(rest.map((id) => [id, 3]))
    const o = replaceOptions(d, db, owned)
    expect(o[0].card.id).toBe(first)
    expect(o[0].notes[0]).toMatch(/Ne possiedi 0 su/)
    expect(o.slice(1).every((x) => x.notes.length === 0 || x.card.id === d.championId)).toBe(true)
  })
})
