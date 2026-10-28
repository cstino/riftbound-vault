import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set } from 'idb-keyval'
import type { Deck } from './types'
import { asset } from './data'

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
