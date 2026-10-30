import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set } from 'idb-keyval'
import type { Deck } from './types'
import { asset, type CardDb } from './data'
import { syncBoxes } from './deck'

// Collezione e mazzi restano nel browser (IndexedDB). Al primo avvio vengono caricati
// dai file del repository; l'esportazione JSON permette di salvarli o spostarli.

const idbStorage: StateStorage = {
  getItem: async (name) => (await get(name)) ?? null,
  setItem: (name, value) => set(name, value),
  removeItem: (name) => del(name),
}

interface VaultState {
  seeded: boolean
  owned: Record<string, number>
  decks: Deck[]
  setQty: (cardId: string, qty: number) => void
  addQty: (cardId: string, delta: number) => void
  saveDeck: (deck: Deck) => void
  deleteDeck: (id: string) => void
  /** Aggiunge alla collezione (o toglie) tutte le carte di un mazzo che possiedi fisicamente. */
  setDeckOwned: (deck: Deck, owned: boolean) => void
  /** Libera (o rimette nella scatola) le carte di un mazzo posseduto. */
  setDeckReleased: (id: string, released: boolean) => void
  /** Allinea le carte chiuse nelle scatole dei mazzi posseduti alle loro liste attuali. */
  syncBoxes: (db: CardDb) => void
  /** Aggiunge (o toglie, con quantità negative) più carte in una volta. */
  addMany: (cards: Record<string, number>) => void
  importData: (data: { owned: Record<string, number>; decks: Deck[] }) => void
  seed: (owned: Record<string, number>, decks: Deck[]) => void
}

export const useVault = create<VaultState>()(
  persist(
    (setState) => ({
      seeded: false,
      owned: {},
      decks: [],
      setQty: (cardId, qty) =>
        setState((s) => {
          const owned = { ...s.owned }
          if (qty <= 0) delete owned[cardId]
          else owned[cardId] = qty
          return { owned }
        }),
      addQty: (cardId, delta) =>
        setState((s) => {
          const owned = { ...s.owned }
          const qty = (owned[cardId] ?? 0) + delta
          if (qty <= 0) delete owned[cardId]
          else owned[cardId] = qty
          return { owned }
        }),
      saveDeck: (deck) =>
        setState((s) => {
          const next = { ...deck, updatedAt: Date.now() }
          const i = s.decks.findIndex((d) => d.id === deck.id)
          const decks = i < 0 ? [next, ...s.decks] : s.decks.map((d, j) => (j === i ? next : d))
          return { decks }
        }),
      deleteDeck: (id) => setState((s) => ({ decks: s.decks.filter((d) => d.id !== id) })),
      setDeckOwned: (deck, isOwned) =>
        setState((s) => {
          const owned = { ...s.owned }
          let added: Record<string, number> | undefined
          if (isOwned && !deck.addedToCollection) {
            added = {}
            const put = (id: string | null, q: number) => {
              if (!id || q <= 0) return
              added![id] = (added![id] ?? 0) + q
            }
            put(deck.legendId, 1)
            for (const [id, q] of Object.entries(deck.main)) put(id, q)
            for (const [id, q] of Object.entries(deck.runes)) put(id, q)
            for (const id of deck.battlefields) put(id, 1)
            for (const [id, q] of Object.entries(added)) owned[id] = (owned[id] ?? 0) + q
          } else if (!isOwned && deck.addedToCollection) {
            for (const [id, q] of Object.entries(deck.addedToCollection)) {
              const left = (owned[id] ?? 0) - q
              if (left > 0) owned[id] = left
              else delete owned[id]
            }
          } else {
            return {}
          }
          const decks = s.decks.map((d) => (d.id === deck.id ? { ...d, addedToCollection: added, released: false } : d))
          return { owned, decks }
        }),
      setDeckReleased: (id, released) => setState((s) => ({ decks: s.decks.map((d) => (d.id === id ? { ...d, released } : d)) })),
      syncBoxes: (db) =>
        setState((s) => {
          const decks = syncBoxes(s.decks, s.owned, db)
          return decks === s.decks ? {} : { decks }
        }),
      addMany: (cards) =>
        setState((s) => {
          const owned = { ...s.owned }
          for (const [id, q] of Object.entries(cards)) {
            const next = (owned[id] ?? 0) + q
            if (next > 0) owned[id] = next
            else delete owned[id]
          }
          return { owned }
        }),
      importData: (data) => setState({ owned: data.owned, decks: data.decks, seeded: true }),
      seed: (owned, decks) => setState({ owned, decks, seeded: true }),
    }),
    // l'idratazione parte da DbProvider, dopo il caricamento delle carte
    { name: 'riftbound-vault', storage: createJSONStorage(() => idbStorage), version: 1, skipHydration: true },
  ),
)

export async function loadSeed() {
  const [collection, presets] = await Promise.all([
    fetch(asset('data/collection.json')).then((r) => r.json() as Promise<{ card_id: string; qty: number }[]>),
    fetch(asset('data/decks.json')).then((r) => r.json()),
  ])
  const owned: Record<string, number> = {}
  for (const { card_id, qty } of collection) owned[card_id] = (owned[card_id] ?? 0) + qty
  return { owned, presets }
}

export function exportVault() {
  const { owned, decks } = useVault.getState()
  const blob = new Blob([JSON.stringify({ app: 'riftbound-vault', version: 1, owned, decks }, null, 1)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `riftbound-vault-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
