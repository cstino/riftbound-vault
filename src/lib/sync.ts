// Sincronizzazione di collezione e mazzi con Supabase: una riga per utente (tabella vault).
// Il browser tiene una copia locale (IndexedDB) per aprire subito l'app; quella online è la
// versione di riferimento e viene sostituita a ogni modifica (vince l'ultima salvata).
import { supabase } from './supabase'
import { useVault } from './store'
import type { Deck } from './types'

interface VaultData {
  owned: Record<string, number>
  decks: Deck[]
}

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error'
let status: SyncStatus = 'idle'
const listeners = new Set<(s: SyncStatus) => void>()
const setStatus = (s: SyncStatus) => {
  status = s
  for (const l of listeners) l(s)
}
export const syncStatus = () => status
export function onSyncStatus(fn: (s: SyncStatus) => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

export async function loadRemote(userId: string): Promise<VaultData | null> {
  const { data, error } = await supabase!.from('vault').select('data').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.data as VaultData | undefined) ?? null
}

async function save(userId: string) {
  const { owned, decks } = useVault.getState()
  setStatus('saving')
  const { error } = await supabase!.from('vault').upsert({ user_id: userId, data: { owned, decks }, updated_at: new Date().toISOString() })
  if (error) {
    setStatus(navigator.onLine ? 'error' : 'offline')
    return false
  }
  setStatus('saved')
  return true
}

let stop: (() => void) | null = null

/**
 * Salva a ogni modifica (con un piccolo ritardo per raggruppare i tocchi). Con `now` salva anche
 * subito: solo se la versione online è già stata letta, per non sovrascriverla con una copia vecchia.
 */
export function startSync(userId: string, now: boolean) {
  stop?.()
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending = false
  const schedule = () => {
    pending = true
    clearTimeout(timer)
    timer = setTimeout(async () => {
      if (await save(userId)) pending = false
    }, 1200)
  }
  const unsub = useVault.subscribe((s, prev) => {
    if (s.owned !== prev.owned || s.decks !== prev.decks) schedule()
  })
  const retry = () => pending && schedule()
  window.addEventListener('online', retry)
  stop = () => {
    unsub()
    clearTimeout(timer)
    window.removeEventListener('online', retry)
  }
  if (now) void save(userId)
}

export function stopSync() {
  stop?.()
  stop = null
  setStatus('idle')
}
