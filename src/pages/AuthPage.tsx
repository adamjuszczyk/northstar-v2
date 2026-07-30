import { useState, type FormEvent } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { useT } from '../i18n'
import styles from './AuthPage.module.css'

export default function AuthPage() {
  const t = useT()
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
          <span className={styles.wordmark}>{t('pages.authWordmark')}</span>
          <span className={styles.version}>{t('pages.authVersion')}</span>
        </div>

        <p className={styles.sub}>{t('pages.authSubtitle')}</p>

        {!supabaseConfigured && (
          <p className={styles.error}>
            {t('pages.authMissingCredentials')}
          </p>
        )}

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <label className={styles.label}>
            <span className={styles.labelText}>{t('pages.authEmailLabel')}</span>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={styles.input}
              placeholder={t('pages.authEmailPlaceholder')}
              autoComplete="email"
              required
            />
          </label>

          <label className={styles.label}>
            <span className={styles.labelText}>{t('pages.authPasswordLabel')}</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={styles.input}
              placeholder={t('pages.authPasswordPlaceholder')}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? t('pages.authSigningIn') : t('pages.authSignIn')}
          </button>
        </form>
      </div>
    </div>
  )
}
