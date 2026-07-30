import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useT, type Key } from '../../i18n'
import MoreSheet from './MoreSheet'
import styles from './NavBar.module.css'

interface NavItem {
  to:       string
  labelKey: Key
  icon:     string
  end?:     boolean
}

// Desktop sidebar — full nine-item structure per SPEC §7.
const DESKTOP_ITEMS: NavItem[] = [
  { to: '/',         labelKey: 'nav.today',    icon: '◎', end: true },
  { to: '/day',      labelKey: 'nav.day',      icon: '▦' },
  { to: '/week',     labelKey: 'nav.week',     icon: '▤' },
  { to: '/month',    labelKey: 'nav.month',    icon: '▥' },
  { to: '/goals',    labelKey: 'nav.goals',    icon: '◉' },
  { to: '/inbox',    labelKey: 'nav.inbox',    icon: '⌵' },
  { to: '/tree',     labelKey: 'nav.tree',     icon: '✦' },
  { to: '/habits',   labelKey: 'nav.habits',   icon: '◆' },
  { to: '/settings', labelKey: 'nav.settings', icon: '⊞' },
]

// Mobile bottom bar — five items to stay clear of the 44px tap-target
// minimum (nine items at 375px would be ~42px each). The rest live behind
// "More". See MoreSheet.tsx for that list.
const MOBILE_ITEMS: NavItem[] = [
  { to: '/',      labelKey: 'nav.today', icon: '◎', end: true },
  { to: '/day',   labelKey: 'nav.day',   icon: '▦' },
  { to: '/inbox', labelKey: 'nav.inbox', icon: '⌵' },
  { to: '/tree',  labelKey: 'nav.tree',  icon: '✦' },
]

const MORE_ROUTES = ['/week', '/month', '/goals', '/habits', '/settings']

interface Props {
  online: boolean
}

export default function NavBar({ online }: Props) {
  const { canInstall, triggerInstall } = useInstallPrompt()
  const isMobile = useIsMobile()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const t = useT()

  // Close the More sheet on any route change — including navigation that
  // didn't originate from a click inside the sheet (back/forward, a link
  // elsewhere). NavBar is always mounted, so nothing else would do this.
  useEffect(() => {
    setMoreOpen(false)
  }, [location.pathname])

  const items = isMobile ? MOBILE_ITEMS : DESKTOP_ITEMS
  const moreActive = isMobile && MORE_ROUTES.includes(location.pathname)

  return (
    <nav className={styles.nav}>
      <div className={styles.logo}>
        <span className={styles.logoStar}>✦</span>
        <span className={styles.logoWord}>NORTHSTAR</span>
        <span className={styles.logoVer}>v3</span>
      </div>

      <ul className={styles.list}>
        {items.map(({ to, labelKey, icon, end }) => (
          <li key={to} className={styles.item}>
            <NavLink
              to={to}
              end={end ?? false}
              className={({ isActive }) =>
                `${styles.link} ${isActive ? styles.active : ''}`
              }
            >
              <span className={styles.icon}>{icon}</span>
              <span className={styles.label}>{t(labelKey)}</span>
            </NavLink>
          </li>
        ))}

        {isMobile && (
          <li className={styles.item}>
            <button
              type="button"
              className={`${styles.link} ${styles.moreLink}${moreActive ? ' ' + styles.active : ''}`}
              onClick={() => setMoreOpen(true)}
              aria-label={t('nav.more')}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
            >
              <span className={styles.icon}>⋯</span>
              <span className={styles.label}>{t('nav.more')}</span>
            </button>
          </li>
        )}
      </ul>

      {/* Desktop-only footer: offline indicator + install button */}
      <div className={styles.footer}>
        {!online && (
          <div className={styles.offlineBadge} title={t('nav.offlineTooltip')}>
            <span className={styles.offlineDot} />
            <span className={styles.offlineLabel}>{t('nav.offline')}</span>
          </div>
        )}
        {canInstall && (
          <button className={styles.installBtn} onClick={triggerInstall} title={t('nav.installTooltip')}>
            <span className={styles.installIcon}>⊕</span>
            <span className={styles.installLabel}>{t('nav.installApp')}</span>
          </button>
        )}
      </div>

      {/* Mobile: offline dot overlay on the logo area */}
      {!online && <span className={styles.mobileOfflineDot} title={t('nav.offline')} />}

      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
    </nav>
  )
}
