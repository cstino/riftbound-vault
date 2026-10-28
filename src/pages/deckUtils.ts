import type { Deck } from '../lib/types'
import type { CardDb } from '../lib/data'

/** Copie possedute per nome di carta (tutte le stampe contano). */
export function ownedByName(db: CardDb, owned: Record<string, number>) {
  const m = new Map<string, number>()
  for (const [id, q] of Object.entries(owned)) {
    const c = db.byId.get(id)
    if (c) m.set(c.name, (m.get(c.name) ?? 0) + q)
  }
  return m
}

/**
 * Copie chiuse nei mazzi posseduti e non liberati, per id di stampa. `except`: il mazzo che si sta
 * guardando, le cui carte sono a sua disposizione.
 */
export function lockedCopies(decks: Deck[], except?: string) {
  const out: Record<string, number> = {}
  for (const d of decks) {
    if (!d.addedToCollection || d.released || d.id === except) continue
    for (const [id, q] of Object.entries(d.addedToCollection)) out[id] = (out[id] ?? 0) + q
  }
  return out
}

/** Copie utilizzabili: quelle sfuse, più quelle del mazzo `forDeck` stesso. */
export function availableCopies(owned: Record<string, number>, decks: Deck[], forDeck?: string) {
  const locked = lockedCopies(decks, forDeck)
  const out: Record<string, number> = {}
  for (const [id, q] of Object.entries(owned)) {
    const left = q - (locked[id] ?? 0)
    if (left > 0) out[id] = left
  }
  return out
}

/** Quante carte del mazzo principale hai a disposizione per questo mazzo. */
export function ownedCoverage(deck: Deck, db: CardDb, owned: Record<string, number>, decks: Deck[] = []) {
  const byName = ownedByName(db, availableCopies(owned, decks, deck.id))
  const needByName = new Map<string, number>()
  for (const [id, q] of Object.entries(deck.main)) {
    const c = db.byId.get(id)
    if (c) needByName.set(c.name, (needByName.get(c.name) ?? 0) + q)
  }
  let need = 0
  let have = 0
  for (const [name, q] of needByName) {
    need += q
    have += Math.min(q, byName.get(name) ?? 0)
  }
  return { need, have }
}
