import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { stopSync } from './sync'
import { Login } from '../pages/Login'

interface Auth {
  userId: string
  email: string
  signOut: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)
export const useAuth = () => useContext(AuthContext)!

/** Nessuna pagina dell'app si apre senza login; gli account si creano solo dal pannello di Supabase. */
export function AuthGate({ children, fallback }: { children: (userId: string) => ReactNode; fallback: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!supabase) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>Login non configurato</h1>
          <p className="muted">Mancano VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nelle variabili d’ambiente.</p>
        </div>
      </div>
    )
  }
  if (session === undefined) return <>{fallback}</>
  if (!session) return <Login />
  const auth: Auth = {
    userId: session.user.id,
    email: session.user.email ?? '',
    signOut: async () => {
      stopSync()
      await supabase!.auth.signOut()
      // ricarica per svuotare dalla memoria i dati dell'utente
      window.location.replace(window.location.pathname)
    },
  }
  return <AuthContext.Provider value={auth}>{children(session.user.id)}</AuthContext.Provider>
}
