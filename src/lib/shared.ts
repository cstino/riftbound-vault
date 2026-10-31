// Collezione condivisa da un gruppo di account (tabelle vault_members e shared_vault): le carte
// possedute e i mazzi posseduti (quelli con la scatola) sono del gruppo, gli altri mazzi restano
// di ogni account. Quando più persone salvano, le modifiche si uniscono rispetto all'ultima
// versione letta: le quantità si sommano come differenze, un mazzo cambiato da qui vince.
import type { Deck } from './types'

export interface SharedData {
  owned: Record<string, number>
  decks: Deck[]
}

/** Un mazzo è del gruppo quando le sue carte fanno parte della collezione ("Ho questo mazzo"). */
export const isSharedDeck = (d: Deck) => !!d.addedToCollection

export function splitVault(owned: Record<string, number>, decks: Deck[]) {
  return { shared: { owned, decks: decks.filter(isSharedDeck) }, personal: decks.filter((d) => !isSharedDeck(d)) }
}

/** Mazzi del gruppo più quelli personali; a parità di id vince quello del gruppo. */
export function joinVault(shared: SharedData, personal: Deck[]) {
  const ids = new Set(shared.decks.map((d) => d.id))
  return { owned: shared.owned, decks: [...shared.decks, ...personal.filter((d) => !ids.has(d.id))] }
}

/** Confronto che non dipende dall'ordine delle chiavi (il database le riordina). */
const stable = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, stable(x)])) : v
const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b))

/** Unione a tre vie: `base` è l'ultima versione del gruppo letta da qui, `local` quella di qui. */
export function mergeShared(base: SharedData, local: SharedData, remote: SharedData): SharedData {
  const owned: Record<string, number> = {}
  for (const id of new Set([...Object.keys(remote.owned), ...Object.keys(local.owned), ...Object.keys(base.owned)])) {
    const q = (remote.owned[id] ?? 0) + (local.owned[id] ?? 0) - (base.owned[id] ?? 0)
    if (q > 0) owned[id] = q
  }
  const byId = (ds: Deck[]) => new Map(ds.map((d) => [d.id, d]))
  const b = byId(base.decks)
  const l = byId(local.decks)
  const r = byId(remote.decks)
  const decks: Deck[] = []
  for (const id of new Set([...r.keys(), ...l.keys()])) {
    const changedHere = !same(l.get(id), b.get(id))
    const d = changedHere ? l.get(id) : r.get(id)
    if (d) decks.push(d)
  }
  return { owned, decks }
}

export const sameShared = same
