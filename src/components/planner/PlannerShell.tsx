import { useState, type CSSProperties } from 'react'
import { format, parseISO, addDays, addWeeks, addMonths, subWeeks, subMonths } from 'date-fns'
import { weekStart, weekDisplayStart, monthStart, formatWeekRange, formatMonthYear } from '../../lib/dates'
import { useSettings } from '../../hooks/useSettings'
import { useTodayISO } from '../../hooks/useTodayISO'
import DayView  from '../day/DayView'
import WeekView from '../week/WeekView'
import MonthView from '../month/MonthView'
import styles from './PlannerShell.module.css'

type Tab = 'day' | 'week' | 'month'

interface Props {
  initialDate?: string
}

export default function PlannerShell({ initialDate }: Props) {
  const today = useTodayISO()
  const { settings } = useSettings()
  const wso = settings.weekStartsOn

  const [tab,      setTab]      = useState<Tab>('day')
  const [dayDate,  setDayDate]  = useState(initialDate ?? today)
  // wkStart is always the canonical Monday key — never derived from wso.
  const [wkStart,  setWkStart]  = useState(weekStart(initialDate ?? today))
  const [moStart,  setMoStart]  = useState(monthStart(initialDate ?? today))

  // ── Navigation ──────────────────────────────────────────────────────────────

  function navPrev() {
    if (tab === 'day')   setDayDate(d => format(addDays(parseISO(d), -1), 'yyyy-MM-dd'))
    if (tab === 'week')  setWkStart(w => weekStart(subWeeks(parseISO(w), 1)))
    if (tab === 'month') setMoStart(m => monthStart(subMonths(parseISO(m), 1)))
  }
  function navNext() {
    if (tab === 'day')   setDayDate(d => format(addDays(parseISO(d),  1), 'yyyy-MM-dd'))
    if (tab === 'week')  setWkStart(w => weekStart(addWeeks(parseISO(w), 1)))
    if (tab === 'month') setMoStart(m => monthStart(addMonths(parseISO(m), 1)))
  }
  function navToday() {
    if (tab === 'day')   setDayDate(today)
    if (tab === 'week')  setWkStart(weekStart(today))
    if (tab === 'month') setMoStart(monthStart(today))
  }

  // ── Heading ─────────────────────────────────────────────────────────────────

  function headingText(): string {
    if (tab === 'day')   return format(parseISO(dayDate), 'EEE d MMM yyyy').toUpperCase()
    if (tab === 'week')  return formatWeekRange(weekDisplayStart(wkStart, wso))
    return formatMonthYear(moStart)
  }

  // ── Cross-view navigation ───────────────────────────────────────────────────

  function handleDaySelectFromWeek(date: string) {
    setDayDate(date)
    setTab('day')
  }
  function handleDaySelectFromMonth(date: string) {
    setDayDate(date)
    setTab('day')
  }

  const isToday_ =
    tab === 'day'   ? dayDate === today :
    tab === 'week'  ? wkStart === weekStart(today) :
    moStart === monthStart(today)

  return (
    <div className={styles.shell}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className={styles.topBar}>

        {/* Tabs */}
        <div className={styles.tabs}>
          {(['day', 'week', 'month'] as Tab[]).map(t => (
            <button
              key={t}
              className={`${styles.tab}${tab === t ? ' ' + styles.tabActive : ''}`}
              onClick={() => setTab(t)}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Heading + nav */}
        <div className={styles.nav}>
          <button className={styles.navBtn} onClick={navPrev} aria-label="Previous">‹</button>
          <span className={styles.heading}>{headingText()}</span>
          <button className={styles.navBtn} onClick={navNext} aria-label="Next">›</button>
        </div>

        {/* Today shortcut */}
        <button
          className={`${styles.todayBtn}${isToday_ ? ' ' + styles.todayBtnActive : ''}`}
          onClick={navToday}
          disabled={isToday_}
        >
          TODAY
        </button>
      </div>

      {/* ── View area ───────────────────────────────────────────────────────── */}
      <div className={styles.viewArea}>
        {tab === 'day' && (
          <DayView date={dayDate} />
        )}
        {tab === 'week' && (
          <WeekView weekStart={wkStart} onDaySelect={handleDaySelectFromWeek} />
        )}
        {tab === 'month' && (
          <MonthView monthStart={moStart} onDaySelect={handleDaySelectFromMonth} />
        )}
      </div>

    </div>
  )
}
