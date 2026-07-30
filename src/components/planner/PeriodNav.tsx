import { useT } from '../../i18n'
import styles from './PeriodNav.module.css'

interface Props {
  heading: string
  onPrev:  () => void
  onNext:  () => void
  onToday: () => void
  isToday: boolean
}

/** Prev/next/heading + Today button, shared by WeekPage and MonthPage — the
 *  date-nav strip PlannerShell used to render above its tab switcher, now
 *  that Day/Week/Month are separate routes instead of tabs. DayView renders
 *  its own equivalent header internally (via its onDateChange prop), so
 *  DayPage doesn't use this. */
export default function PeriodNav({ heading, onPrev, onNext, onToday, isToday }: Props) {
  const t = useT()

  return (
    <div className={styles.topBar}>
      <div className={styles.nav}>
        <button className={styles.navBtn} onClick={onPrev} aria-label={t('planner.previous')}>‹</button>
        <span className={styles.heading}>{heading}</span>
        <button className={styles.navBtn} onClick={onNext} aria-label={t('planner.next')}>›</button>
      </div>
      <button
        className={`${styles.todayBtn}${isToday ? ' ' + styles.todayBtnActive : ''}`}
        onClick={onToday}
        disabled={isToday}
      >
        {t('day.todaySuperLabel')}
      </button>
    </div>
  )
}
