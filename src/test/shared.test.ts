// Collezione condivisa: le modifiche fatte da due account nello stesso momento si uniscono.
import { describe, expect, it } from 'vitest'
import { joinVault, mergeShared, splitVault } from '../lib/shared'
import type { Deck } from '../lib/types'

const deck = (id: string, main: Record<string, number>, boxed = true): Deck => ({
  id,
  name: id,
  legendId: null,
  championId: null,
  main,
  runes: {},
  battlefields: [],
  addedToCollection: boxed ? { ...main } : undefined,
  updatedAt: 0,
})

describe('collezione condivisa', () => {
  it('i mazzi posseduti sono del gruppo, gli altri restano personali', () => {
    const zed = deck('zed', { a: 2 })
    const mio = deck('mio', { b: 1 }, false)
    const { shared, personal } = splitVault({ a: 2 }, [zed, mio])
    expect(shared.decks).toEqual([zed])
    expect(personal).toEqual([mio])
    // a parità di id vince la versione del gruppo
    expect(joinVault(shared, [deck('zed', { x: 1 }, false), mio]).decks).toEqual([zed, mio])
  })

  it('due persone che aggiungono carte insieme: si sommano entrambe le aggiunte', () => {
    const base = { owned: { a: 1, b: 2 }, decks: [] }
    const local = { owned: { a: 3, b: 2 }, decks: [] } // qui: +2 a
    const remote = { owned: { a: 1, b: 1, c: 1 }, decks: [] } // altrove: -1 b, +1 c
    expect(mergeShared(base, local, remote).owned).toEqual({ a: 3, b: 1, c: 1 })
  })

  it('un mazzo cambiato qui vince, gli altri prendono la versione online', () => {
    const zed = deck('zed', { a: 2 })
    const shen = deck('shen', { b: 2 })
    const base = { owned: {}, decks: [zed, shen] }
    const zedQui = deck('zed', { a: 1, c: 1 })
    const shenAltrove = deck('shen', { b: 1, d: 1 })
    const merged = mergeShared(base, { owned: {}, decks: [zedQui, shen] }, { owned: {}, decks: [zed, shenAltrove] })
    expect(merged.decks).toEqual([zedQui, shenAltrove])
    // tolto qui ("non ho più questo mazzo"): sparisce anche online
    expect(mergeShared(base, { owned: {}, decks: [shen] }, base).decks).toEqual([shen])
    // lo stesso mazzo con le chiavi in un altro ordine (come lo restituisce il database) non è una modifica
    const riordinato = Object.fromEntries(Object.entries(zed).reverse()) as unknown as Deck
    expect(mergeShared({ owned: {}, decks: [riordinato] }, { owned: {}, decks: [zed] }, { owned: {}, decks: [zedQui] }).decks).toEqual([zedQui])
  })
})
