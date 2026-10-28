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

/** Quante carte del mazzo principale possiedi già. */
export function ownedCoverage(deck: Deck, db: CardDb, owned: Record<string, number>) {
  const byName = ownedByName(db, owned)
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
