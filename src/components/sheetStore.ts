import { create } from 'zustand'

/** Pannello inferiore con la spiegazione di una parola chiave, apribile da qualsiasi testo di carta. */
export const useSheet = create<{ id: string | null; open: (id: string) => void; close: () => void }>((set) => ({
  id: null,
  open: (id) => set({ id }),
  close: () => set({ id: null }),
}))
