import { useState, type FormEvent } from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { supabase } from '../lib/supabase'
import { asset } from '../lib/data'
import './login.css'

/** Logo ufficiale dal CDN di Riot, come le immagini delle carte. */
const LOGO = 'https://cmsassets.rgpub.io/sanity/images/dsfx7636/news/23d41c7809a48a013f3d8a7204b81fb4d8bdb164-10000x4389.png?accountingTag=RB&w=900&fm=webp'

/** Accesso con email e password. Non c'è registrazione: gli account li crea l'amministratore. */
export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shake = useAnimationControls()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase!.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (!error) return
    setError(
      /invalid/i.test(error.message)
        ? 'Email o password non corretti.'
        : navigator.onLine
          ? `Accesso non riuscito: ${error.message}`
          : 'Sei offline: per entrare serve la connessione.',
    )
    void shake.start({
      x: [0, -10, 9, -6, 4, 0],
      transition: { duration: 0.42 },
    })
  }

  return (
    <div className="login-shell">
      <div className="login-rift" aria-hidden>
        <span className="login-rift-swirl" />
      </div>

      <main className="login-main">
        <motion.header className="login-brand" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          <img className="login-logo" src={LOGO} alt="Riftbound, Trading Card Game" />
          <p className="login-app">
            <strong>Rift Vault</strong>
            <span>Collezione, mazzi e partite di prova</span>
          </p>
        </motion.header>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}>
          <motion.form className="login-form" onSubmit={submit} animate={shake}>
            <label className="login-field">
              <span>Email</span>
              <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-invalid={!!error} />
            </label>
            <label className="login-field">
              <span>Password</span>
              <span className="login-pass">
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  aria-invalid={!!error}
                />
                <button type="button" className="login-eye" onClick={() => setShow((v) => !v)} aria-pressed={show}>
                  {show ? 'Nascondi' : 'Mostra'}
                </button>
              </span>
            </label>
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? 'Accesso in corso…' : 'Entra'}
            </button>
            <p className="login-note">Gli account li crea l’amministratore: qui non ci si registra.</p>
          </motion.form>
        </motion.div>
      </main>

      <div className="login-hand" aria-hidden>
        {['main', 'rune', 'legend'].map((b, i) => (
          <motion.img
            key={b}
            src={asset(`backs/${b}.webp`)}
            alt=""
            style={{ rotate: (i - 1) * 14, x: (i - 1) * 64 }}
            initial={{ y: 160 }}
            animate={{ y: i === 1 ? 0 : 18 }}
            transition={{
              duration: 0.8,
              delay: 0.15 + i * 0.08,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        ))}
      </div>
    </div>
  )
}
