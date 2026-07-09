import { NavLink } from 'react-router-dom'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import styles from './NavBar.module.css'

interface NavItem {
  to:    string
  label: string
  icon:  string
  end?:  boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/tree',     label: 'Tree',     icon: '✦' },
  { to: '/',         label: 'Today',    icon: '◎', end: true },
  { to: '/planner',  label: 'Planner',  icon: '▦' },
  { to: '/inbox',    label: 'Inbox',    icon: '⌵' },
  { to: '/habits',   label: 'Habits',   icon: '◆' },
  { to: '/settings', label: 'Settings', icon: '⊞' },
]

interface Props {
  online: boolean
}

export default function NavBar({ online }: Props) {
  const { canInstall, triggerInstall } = useInstallPrompt()

  return (
    <nav className={styles.nav}>
      <div className={styles.logo}>
        <span className={styles.logoStar}>✦</span>
        <span className={styles.logoWord}>NORTHSTAR</span>
        <span className={styles.logoVer}>v2</span>
      </div>

      <ul className={styles.list}>
        {NAV_ITEMS.map(({ to, label, icon, end }) => (
          <li key={to} className={styles.item}>
            <NavLink
              to={to}
              end={end ?? false}
              className={({ isActive }) =>
                `${styles.link} ${isActive ? styles.active : ''}`
              }
            >
              <span className={styles.icon}>{icon}</span>
              <span className={styles.label}>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Desktop-only footer: offline indicator + install button */}
      <div className={styles.footer}>
        {!online && (
          <div className={styles.offlineBadge} title="You're offline — changes are queued">
            <span className={styles.offlineDot} />
            <span className={styles.offlineLabel}>OFFLINE</span>
          </div>
        )}
        {canInstall && (
          <button className={styles.installBtn} onClick={triggerInstall} title="Install Northstar">
            <span className={styles.installIcon}>⊕</span>
            <span className={styles.installLabel}>Install App</span>
          </button>
        )}
      </div>

      {/* Mobile: offline dot overlay on the logo area */}
      {!online && <span className={styles.mobileOfflineDot} title="Offline" />}
    </nav>
  )
}
