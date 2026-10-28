import { useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { asset } from '../lib/data'
import './login.css'

/** Accesso con email e password. Non c'è registrazione: gli account li crea l'amministratore. */
export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(/invalid/i.test(error.message) ? 'Email o password non corretti.' : navigator.onLine ? `Accesso non riuscito: ${error.message}` : 'Sei offline: serve la connessione per entrare.')
  }

  return (
    <div className="login-shell">
      <motion.form className="login-card" onSubmit={submit} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
        <img className="login-logo" src={asset('backs/legend.webp')} alt="" />
        <h1>Rift Vault</h1>
        <p className="muted">Entra con l’account che ti ha dato l’amministratore.</p>
        <label>
          <span>Email</span>
          <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Accesso…' : 'Entra'}
        </button>
        <p className="tiny muted">Non hai un account? Chiedilo all’amministratore: qui non ci si può registrare.</p>
      </motion.form>
    </div>
  )
}
