import { useState, type FormEvent } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import styles from './AuthPage.module.css'

export default function AuthPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
    setLoading(false)
  }

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.star}>✦</span>
          <span className={styles.wordmark}>NORTHSTAR</span>
          <span className={styles.version}>v2</span>
        </div>

        <p className={styles.sub}>Sign in with your Overload account.</p>

        {!supabaseConfigured && (
          <p className={styles.error}>
            No Supabase credentials found. Copy <code>.env.example</code> to{' '}
            <code>.env</code> and add your Overload project URL and anon key.
          </p>
        )}

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <label className={styles.label}>
            <span className={styles.labelText}>Email</span>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={styles.input}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label className={styles.label}>
            <span className={styles.labelText}>Password</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={styles.input}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
