import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Configurazione pubblica (URL e chiave "anon" sono fatti per stare nel browser): la protezione dei
// dati sta nelle regole Row Level Security di supabase/schema.sql, non nel segreto della chiave.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null
