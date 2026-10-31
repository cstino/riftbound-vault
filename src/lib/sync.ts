// Sincronizzazione di collezione e mazzi con Supabase: una riga per utente (tabella vault) e, per
// chi fa parte di un gruppo (vault_members), una riga condivisa con collezione e mazzi posseduti
// (shared_vault, vedi shared.ts). Il browser tiene una copia locale (IndexedDB) per aprire subito
// l'app; quella online è la versione di riferimento.
import { supabase } from './supabase'
import { useVault } from './store'
import type { Deck } from './types'
import { joinVault, mergeShared, sameShared, splitVault, type SharedData } from './shared'

interface VaultData {
  owned: Record<string, number>
  decks: Deck[]
}

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error' | 'unreachable'
let status: SyncStatus = 'idle'
const listeners = new Set<(s: SyncStatus) => void>()
const setStatus = (s: SyncStatus) => {
  status = s
  for (const l of listeners) l(s)
}
export const syncStatus = () => status
/** La versione online non si è potuta leggere: si lavora sulla copia del dispositivo. */
export const markUnreachable = () => setStatus(navigator.onLine ? 'unreachable' : 'offline')
export function onSyncStatus(fn: (s: SyncStatus) => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

/** Gruppo dell'utente e ultima versione condivisa letta (base per unire le modifiche). */
let group: string | null = null
let base: SharedData | null = null
let baseAt: string | null = null

async function readShared() {
  const { data, error } = await supabase!.from('shared_vault').select('data, updated_at').eq('group_id', group!).maybeSingle()
  if (error) throw new Error(error.message)
  return data as { data: SharedData; updated_at: string } | null
}

export async function loadRemote(userId: string): Promise<VaultData | null> {
  group = base = baseAt = null
  const [mine, member] = await Promise.all([
    supabase!.from('vault').select('data').eq('user_id', userId).maybeSingle(),
    supabase!.from('vault_members').select('group_id').eq('user_id', userId).maybeSingle(),
  ])
  if (mine.error) throw new Error(mine.error.message)
  const personal = (mine.data?.data as VaultData | undefined) ?? null
  if (member.error || !member.data) return personal // senza gruppo (o tabella assente): solo i dati dell'account
  group = member.data.group_id as string
  const shared = await readShared()
  if (!shared) return personal
  base = shared.data
  baseAt = shared.updated_at
  return joinVault(shared.data, personal?.decks ?? [])
}

/** Porta nel dispositivo una versione unita, tenendo i mazzi personali di qui. */
function apply(merged: SharedData) {
  const { owned, decks } = useVault.getState()
  const local = splitVault(owned, decks)
  if (sameShared(merged, local.shared)) return
  useVault.setState(joinVault(merged, local.personal))
}

/** Salva la parte condivisa unendola a quella online; riprova se nel frattempo qualcuno ha salvato. */
async function saveShared(local: SharedData) {
  if (base && sameShared(local, base)) return true
  for (let i = 0; i < 4; i++) {
    const remote = await readShared()
    const merged = remote ? mergeShared(base ?? remote.data, local, remote.data) : local
    const at = new Date().toISOString()
    const res = remote
      ? await supabase!.from('shared_vault').update({ data: merged, updated_at: at }).eq('group_id', group!).eq('updated_at', remote.updated_at).select('group_id')
      : await supabase!.from('shared_vault').insert({ group_id: group!, data: merged, updated_at: at }).select('group_id')
    if (res.error && !remote && res.error.code === '23505') continue // creata da un altro nel frattempo
    if (res.error) return false
    if (!res.data?.length) continue // salvata da un altro nel frattempo: si unisce di nuovo
    base = merged
    baseAt = at
    apply(merged)
    return true
  }
  return false
}

async function save(userId: string) {
  const { owned, decks } = useVault.getState()
  const { shared, personal } = splitVault(owned, decks)
  setStatus('saving')
  // nel gruppo la riga dell'account tiene i mazzi personali (e una copia della collezione)
  const { error } = await supabase!.from('vault').upsert({ user_id: userId, data: { owned, decks: group ? personal : decks }, updated_at: new Date().toISOString() })
  const ok = !error && (!group || (await saveShared(shared).catch(() => false)))
  setStatus(ok ? 'saved' : navigator.onLine ? 'error' : 'offline')
  return ok
}

/** Quando si torna sull'app, prende le modifiche salvate dagli altri del gruppo. */
async function refresh() {
  if (!group || document.visibilityState !== 'visible') return
  try {
    const remote = await readShared()
    if (!remote || remote.updated_at === baseAt) return
    const { owned, decks } = useVault.getState()
    const merged = mergeShared(base ?? remote.data, splitVault(owned, decks).shared, remote.data)
    base = remote.data
    baseAt = remote.updated_at
    apply(merged) // se c'erano modifiche fatte qui, il salvataggio parte da solo
  } catch {
    // offline: si riprova al prossimo ritorno sull'app
  }
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
  const onVisible = () => void refresh()
  window.addEventListener('online', retry)
  document.addEventListener('visibilitychange', onVisible)
  stop = () => {
    unsub()
    clearTimeout(timer)
    window.removeEventListener('online', retry)
    document.removeEventListener('visibilitychange', onVisible)
  }
  if (now) void save(userId)
}

export function stopSync() {
  stop?.()
  stop = null
  setStatus('idle')
}
