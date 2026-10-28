import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type CardDb, loadCards } from './data'
import { loadSeed, useVault } from './store'
import { presetToDeck } from './deck'

const DbContext = createContext<CardDb | null>(null)

export function DbProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [db, setDb] = useState<CardDb | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadCards()
      .then(async (loaded) => {
        // Aspetta che IndexedDB sia letto prima di decidere se servono i dati iniziali
        await useVault.persist.rehydrate()
        if (!useVault.getState().seeded) {
          const { owned, presets } = await loadSeed()
          useVault.getState().seed(owned, presets.map((p: never) => presetToDeck(p, loaded)))
        }
        if (alive) setDb(loaded)
      })
      .catch((e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [])

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Non riesco a caricare le carte</h2>
        <p style={{ color: 'var(--text-2)', marginTop: 8 }}>{error}. Ricarica la pagina per riprovare.</p>
      </div>
    )
  }
  if (!db) return <>{fallback}</>
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>
}

export function useDb() {
  const db = useContext(DbContext)
  if (!db) throw new Error('useDb fuori da DbProvider')
  return db
}
