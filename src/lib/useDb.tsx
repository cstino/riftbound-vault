import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type CardDb, loadCards } from './data'
import { del, get } from 'idb-keyval'
import { loadSeed, useVault } from './store'
import { loadRemote, markUnreachable, startSync } from './sync'
import { presetToDeck } from './deck'

const DbContext = createContext<CardDb | null>(null)

/** Prima versione dell'app, senza account: i dati stavano sotto un'unica chiave del browser. */
const LEGACY_KEY = 'riftbound-vault'

/**
 * Carica i dati dell'utente: copia locale (una per account), poi quella online, che vince.
 * Un account nuovo prende i dati della vecchia versione senza login di questo dispositivo, se ci
 * sono; altrimenti parte con la collezione vuota e i mazzi ufficiali.
 */
async function openVault(userId: string, db: CardDb) {
  useVault.setState({ seeded: false, owned: {}, decks: [] })
  useVault.persist.setOptions({ name: `${LEGACY_KEY}:${userId}` })
  await useVault.persist.rehydrate()
  let remote: Awaited<ReturnType<typeof loadRemote>> = null
  let online = true
  try {
    remote = await loadRemote(userId)
  } catch {
    online = false // offline: si lavora sulla copia locale e si salva quando torna la rete
  }
  // dati della versione senza login su questo dispositivo: entrano se online la collezione è ancora vuota
  const legacy = online ? await get<string>(LEGACY_KEY) : undefined
  const old = legacy ? (JSON.parse(legacy) as { state?: { owned?: Record<string, number>; decks?: never[] } }).state : undefined
  const oldOk = !!old?.owned && !!old.decks && Object.keys(old.owned).length > 0
  if (oldOk && (!remote || Object.keys(remote.owned ?? {}).length === 0)) {
    useVault.getState().importData({ owned: old!.owned!, decks: old!.decks! })
    await del(LEGACY_KEY)
  } else if (remote) useVault.getState().importData(remote)
  else if (online && !useVault.getState().seeded) {
    const { presets } = await loadSeed()
    useVault.getState().seed({}, presets.map((p: never) => presetToDeck(p, db)))
  }
  // offline: si salvano solo le modifiche fatte da qui in poi, appena torna la rete
  startSync(userId, online)
  if (!online) markUnreachable()
}

export function DbProvider({ children, fallback, userId }: { children: ReactNode; fallback: ReactNode; userId: string }) {
  const [db, setDb] = useState<CardDb | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadCards()
      .then(async (loaded) => {
        await openVault(userId, loaded)
        if (alive) setDb(loaded)
      })
      .catch((e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [userId])

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
