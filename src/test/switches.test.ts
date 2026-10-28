// Switch suggeriti e ordine delle carte da togliere: euristiche, ma con vincoli fissi.
import { describe, expect, it } from 'vitest'
import { fitsIdentity, removalOrder, suggestSwitches } from '../lib/deck'
import { db, officialDeck } from './gameHelpers'

const deck = () => ({ ...officialDeck('Rumble'), id: 'test', name: 'Rumble' })
const ownedOf = (d: ReturnType<typeof deck>) => ({ ...d.main })

describe('switch suggeriti', () => {
  it('propongono solo carte possedute, legali e non già tutte nel mazzo', () => {
    const d = deck()
    const legend = db.byId.get(d.legendId!)!
    const owned: Record<string, number> = ownedOf(d)
    // aggiunge alla collezione tutte le carte legali in una copia
    for (const c of db.cards) if (/Unit|Spell|Gear/.test(c.type) && !/Token|Champion|Signature/.test(c.type) && fitsIdentity(c, legend.domains)) owned[c.id] = (owned[c.id] ?? 0) + 1
    const s = suggestSwitches(d, db, owned)
    for (const x of s) {
      expect(owned[x.in.id]).toBeGreaterThan(0)
      expect(fitsIdentity(x.in, legend.domains)).toBe(true)
      expect(x.reasons.length).toBeGreaterThan(0)
      expect(x.gain).toBeGreaterThanOrEqual(2)
    }
    // una proposta per carta
    expect(new Set(s.map((x) => x.out.name)).size).toBe(s.length)
    expect(new Set(s.map((x) => x.in.name)).size).toBe(s.length)
  })

  it('senza carte possedute in più non propone niente', () => {
    const d = deck()
    expect(suggestSwitches(d, db, ownedOf(d))).toEqual([])
    expect(suggestSwitches(d, db, {})).toEqual([])
  })

  it('un mazzo pieno di carte fuori tema riceve switch verso carte a tema', () => {
    const d = deck()
    const owned = ownedOf(d)
    // al posto di una carta del mazzo, una carta legale senza parole chiave né tag
    const legend = db.byId.get(d.legendId!)!
    const vanilla = db.cards.find((c) => /^Unit$/.test(c.type) && fitsIdentity(c, legend.domains) && !c.tags.length && !/\[/.test(c.text ?? ''))!
    const [outId] = Object.keys(d.main).filter((id) => id !== d.championId)
    const removed = db.byId.get(outId)!
    d.main[vanilla.id] = d.main[outId]
    delete d.main[outId]
    owned[outId] = 3
    const s = suggestSwitches(d, db, owned)
    if (removed.tags.length || /\[/.test(removed.text ?? '')) expect(s.some((x) => x.out.name === vanilla.name)).toBe(true)
  })
})

describe('carte da togliere', () => {
  it('il campione scelto resta sempre con almeno una copia (103.3.a)', () => {
    const d = deck()
    d.main[d.championId!] = 1
    expect(removalOrder(d, db).some((o) => o.card.id === d.championId)).toBe(false)
  })
})
