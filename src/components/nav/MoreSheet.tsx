import { NavLink } from 'react-router-dom'
import { useT, type Key } from '../../i18n'
import styles from './MoreSheet.module.css'

interface Item {
  to:       string
  labelKey: Key
  icon:     string
}

const ITEMS: Item[] = [
  { to: '/week',     labelKey: 'nav.week',     icon: '▤' },
  { to: '/month',    labelKey: 'nav.month',    icon: '▥' },
  { to: '/goals',    labelKey: 'nav.goals',    icon: '◉' },
  { to: '/habits',   labelKey: 'nav.habits',   icon: '◆' },
  { to: '/settings', labelKey: 'nav.settings', icon: '⊞' },
]

interface Props {
  onClose: () => void
}

/** Mobile-only overflow sheet — the five sidebar items that don't fit in the
 *  5-item bottom bar (see NavBar.tsx). Desktop never renders this. */
export default function MoreSheet({ onClose }: Props) {
  const t = useT()
  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={t('nav.moreAria')}>
        <div className={styles.handle} />
        <div className={styles.header}>
          <span className={styles.headerLabel}>{t('nav.moreTitle')}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        <ul className={styles.list}>
          {ITEMS.map(({ to, labelKey, icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) => `${styles.row}${isActive ? ' ' + styles.rowActive : ''}`}
                onClick={onClose}
              >
                <span className={styles.icon}>{icon}</span>
                <span className={styles.label}>{t(labelKey)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
