import { useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import { useAccentColour } from '../hooks/useAccentColour'
import { useSignOut } from '../hooks/useSignOut'
import styles from './SettingsPage.module.css'

export default function SettingsPage() {
  const { settings, update } = useSettings()
  const { accent, options: accentOptions, setAccent } = useAccentColour()
  const signOut = useSignOut()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    if (signingOut) return
    if (!window.confirm('Sign out of Northstar?')) return
    setSigningOut(true)
    await signOut()
  }

  return (
    <div className={styles.page}>
      <p className={styles.pageTitle}>SETTINGS</p>

      {/* ── Accent colour ───────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>ACCENT COLOUR</span>
        <div className={styles.swatches}>
          {accentOptions.map(opt => (
            <button
              key={opt.hex}
              className={`${styles.swatch}${accent === opt.hex ? ' ' + styles.swatchActive : ''}`}
              style={{ background: opt.hex }}
              onClick={() => setAccent(opt)}
              title={opt.label}
              aria-label={`${opt.label} accent${accent === opt.hex ? ' (active)' : ''}`}
            />
          ))}
        </div>
      </section>

      {/* ── Appearance ──────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>APPEARANCE</span>
        <div className={styles.settingRow}>
          <span className={styles.settingKey}>THEME</span>
          <div className={styles.pill} role="group" aria-label="Theme">
            {(['dark', 'light'] as const).map(t => (
              <button
                key={t}
                className={`${styles.pillBtn}${settings.theme === t ? ' ' + styles.pillBtnActive : ''}`}
                onClick={() => update({ theme: t })}
                aria-pressed={settings.theme === t}
              >
                {t === 'dark' ? 'DARK' : 'LIGHT'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Planner ─────────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>PLANNER</span>
        <div className={styles.settingRow}>
          <span className={styles.settingKey}>WEEK STARTS ON</span>
          <div className={styles.pill} role="group" aria-label="Week start">
            {([1, 0] as const).map(d => (
              <button
                key={d}
                className={`${styles.pillBtn}${settings.weekStartsOn === d ? ' ' + styles.pillBtnActive : ''}`}
                onClick={() => update({ weekStartsOn: d })}
                aria-pressed={settings.weekStartsOn === d}
              >
                {d === 1 ? 'MON' : 'SUN'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Account ─────────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>ACCOUNT</span>
        <button className={styles.signOutBtn} onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </section>

      <p className={styles.hint}>
        Settings are saved locally to this device.
      </p>
    </div>
  )
}
