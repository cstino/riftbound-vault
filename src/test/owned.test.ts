// Copie disponibili: le carte di un mazzo posseduto restano nella sua scatola finché non si liberano.
import { describe, expect, it } from 'vitest'
import { availableCopies, lockedCopies, ownedCoverage } from '../pages/deckUtils'
import { syncBoxes } from '../lib/deck'
import type { Deck } from '../lib/types'
import { db, officialDeck } from './gameHelpers'

const boxed = (name: string, released = false): Deck => {
  const d = { ...officialDeck(name), id: `preset-${name.toLowerCase()}` }
  const added: Record<string, number> = {}
  for (const [id, q] of Object.entries(d.main)) added[id] = (added[id] ?? 0) + q
  return { ...d, addedToCollection: added, released }
}

describe('copie disponibili', () => {
  it('le carte di un mazzo posseduto non contano per gli altri mazzi', () => {
    const rumble = boxed('Rumble')
    const owned = { ...rumble.addedToCollection! }
    const id = Object.keys(owned)[0]
    owned[id] += 1 // una copia sfusa in più
    expect(lockedCopies([rumble])[id]).toBe(rumble.addedToCollection![id])
    expect(availableCopies(owned, [rumble])[id]).toBe(1) // per un altro mazzo: solo la sfusa
    expect(availableCopies(owned, [rumble], rumble.id)[id]).toBe(owned[id]) // per il mazzo stesso: tutte
  })

  it('liberato, il mazzo rende disponibili le sue carte', () => {
    const rumble = boxed('Rumble', true)
    const owned = { ...rumble.addedToCollection! }
    expect(availableCopies(owned, [rumble])).toEqual(owned)
  })

  it('"possiedi X/40" di un mazzo conta le sfuse e le sue, non quelle chiuse in altri mazzi', () => {
    const zed = boxed('Zed')
    const shen = boxed('Shen')
    const owned: Record<string, number> = {}
    for (const d of [zed, shen]) for (const [id, q] of Object.entries(d.addedToCollection!)) owned[id] = (owned[id] ?? 0) + q
    const custom: Deck = { ...officialDeck('Zed'), id: 'mio-zed', name: 'Il mio Zed' }
    expect(ownedCoverage(zed, db, owned, [zed, shen]).have).toBe(ownedCoverage(zed, db, owned, [zed, shen]).need)
    // un mazzo creato da me con la stessa lista di Zed: le carte sono tutte chiuse nella scatola di Zed
    const shared = ownedCoverage(custom, db, owned, [zed, shen]).have
    expect(shared).toBeLessThan(ownedCoverage(custom, db, owned, []).have)
    expect(ownedCoverage(custom, db, owned, [{ ...zed, released: true }, shen]).have).toBe(ownedCoverage(custom, db, owned, []).have)
  })

  it('modificando un mazzo posseduto, le carte tolte tornano sfuse e quelle messe entrano nella scatola', () => {
    const zed = boxed('Zed')
    const shen = boxed('Shen')
    const [outId] = Object.keys(zed.main).filter((id) => !shen.addedToCollection![id])
    const inCard = db.cards.find((c) => c.type === 'Unit' && !zed.main[c.id] && !shen.main[c.id])!
    const owned: Record<string, number> = { [inCard.id]: 2 }
    for (const d of [zed, shen]) for (const [id, q] of Object.entries(d.addedToCollection!)) owned[id] = (owned[id] ?? 0) + q
    const out = zed.main[outId]
    const edited: Deck = { ...zed, main: { ...zed.main, [inCard.id]: out } }
    delete edited.main[outId]
    const [z2, s2] = syncBoxes([edited, shen], owned, db)
    expect(z2.addedToCollection![outId]).toBeUndefined()
    expect(z2.addedToCollection![inCard.id]).toBe(Math.min(out, 2))
    expect(s2.addedToCollection).toEqual(shen.addedToCollection) // le altre scatole non cambiano
    expect(availableCopies(owned, [z2, s2])[outId]).toBe(out) // la carta tolta è di nuovo sfusa
    expect(availableCopies(owned, [z2, s2])[inCard.id] ?? 0).toBe(2 - Math.min(out, 2))
    // senza modifiche non cambia niente
    expect(syncBoxes([z2, s2], owned, db)[0]).toBe(z2)
  })
})
