// Partita contro il PC in corso. Vive solo in memoria: ricaricando la pagina si torna alla scelta dei mazzi.
import { create } from 'zustand'
import type { Match } from './game'

interface GameState {
  match: Match | null
  /** Mazzi scelti (id) per la rivincita. */
  decks: { mine: string; pc: string } | null
  version: number
  start: (m: Match, decks: { mine: string; pc: string }) => void
  bump: () => void
  quit: () => void
}

export const useGame = create<GameState>()((set) => ({
  match: null,
  decks: null,
  version: 0,
  start: (match, decks) => set((s) => ({ match, decks, version: s.version + 1 })),
  bump: () => set((s) => ({ version: s.version + 1 })),
  quit: () => set({ match: null }),
}))
