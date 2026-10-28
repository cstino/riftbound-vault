import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Configurazione pubblica: URL e chiave "publishable" sono fatti per stare nel browser e finiscono
// comunque nell'app scaricata. La protezione dei dati sta nelle regole Row Level Security di
// supabase/schema.sql e nelle registrazioni disattivate, non nel segreto della chiave.
// Le variabili VITE_SUPABASE_* (Vercel o .env.local) permettono di usare un altro progetto.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://lbbzwftbwigtatrqxyij.supabase.co'
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_lqwwLzlNmqHA5XIfqawMPA_ujnS7Mtw'

export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null
