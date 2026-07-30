import { useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import { useAccentColour } from '../hooks/useAccentColour'
import { useSignOut } from '../hooks/useSignOut'
import { useT } from '../i18n'
import TemplateList from '../components/templates/TemplateList'
import styles from './SettingsPage.module.css'

export default function SettingsPage() {
  const { settings, update } = useSettings()
  const { accent, options: accentOptions, setAccent } = useAccentColour()
  const signOut = useSignOut()
  const [signingOut, setSigningOut] = useState(false)
  const t = useT()

  async function handleSignOut() {
    if (signingOut) return
    if (!window.confirm(t('settings.signOutConfirm'))) return
    setSigningOut(true)
    await signOut()
  }

  return (
    <div className={styles.page}>
      <p className={styles.pageTitle}>{t('settings.title')}</p>

      {/* ── Accent colour ───────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>{t('settings.accentColour')}</span>
        <div className={styles.swatches}>
          {accentOptions.map(opt => {
            const label = t(opt.labelKey)
            const ariaLabel = t('settings.accentAriaLabel', { label }) +
              (accent === opt.hex ? ` (${t('settings.active')})` : '')
            return (
              <button
                key={opt.hex}
                className={`${styles.swatch}${accent === opt.hex ? ' ' + styles.swatchActive : ''}`}
                style={{ background: opt.hex }}
                onClick={() => setAccent(opt)}
                title={label}
                aria-label={ariaLabel}
              />
            )
          })}
        </div>
      </section>

      {/* ── Appearance ──────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>{t('settings.appearance')}</span>
        <div className={styles.settingRow}>
          <span className={styles.settingKey}>{t('settings.theme')}</span>
          <div className={styles.pill} role="group" aria-label={t('settings.theme')}>
            {(['dark', 'light'] as const).map(th => (
              <button
                key={th}
                className={`${styles.pillBtn}${settings.theme === th ? ' ' + styles.pillBtnActive : ''}`}
                onClick={() => update({ theme: th })}
                aria-pressed={settings.theme === th}
              >
                {th === 'dark' ? t('settings.dark') : t('settings.light')}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Language ────────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>{t('settings.language')}</span>
        <div className={styles.settingRow}>
          <span className={styles.settingKey}>{t('settings.language')}</span>
          <div className={styles.pill} role="group" aria-label={t('settings.language')}>
            {(['en', 'pl'] as const).map(l => (
              <button
                key={l}
                className={`${styles.pillBtn}${settings.lang === l ? ' ' + styles.pillBtnActive : ''}`}
                onClick={() => update({ lang: l })}
                aria-pressed={settings.lang === l}
              >
                {/* Language switcher labels are language codes, not translated content — a
                    Polish speaker still needs to recognise "EN" to switch back. */}
                {l === 'en' ? 'EN' : 'PL'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Planner ─────────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>{t('settings.planner')}</span>
        <div className={styles.settingRow}>
          <span className={styles.settingKey}>{t('settings.weekStartsOn')}</span>
          <div className={styles.pill} role="group" aria-label={t('settings.weekStartsOn')}>
            {([1, 0] as const).map(d => (
              <button
                key={d}
                className={`${styles.pillBtn}${settings.weekStartsOn === d ? ' ' + styles.pillBtnActive : ''}`}
                onClick={() => update({ weekStartsOn: d })}
                aria-pressed={settings.weekStartsOn === d}
              >
                {d === 1 ? t('settings.monday') : t('settings.sunday')}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Day templates ───────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>{t('settings.dayTemplates')}</span>
        <TemplateList />
      </section>

      {/* ── Account ─────────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>{t('settings.account')}</span>
        <button className={styles.signOutBtn} onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? t('settings.signingOut') : t('settings.signOut')}
        </button>
      </section>

      <p className={styles.hint}>
        {t('settings.hint')}
      </p>
    </div>
  )
}
