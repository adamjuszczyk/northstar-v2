import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { addWeeks, subWeeks, parseISO } from 'date-fns'
import { weekStart, weekDisplayStart, formatWeekRange } from '../lib/dates'
import { useSettings } from '../hooks/useSettings'
import { useTodayISO } from '../hooks/useTodayISO'
import { useDateFnsLocale } from '../i18n'
import PeriodNav from '../components/planner/PeriodNav'
import WeekView from '../components/week/WeekView'
import styles from './PeriodPage.module.css'

export default function WeekPage() {
  const today = useTodayISO()
  const navigate = useNavigate()
  const dateLocale = useDateFnsLocale()
  const [searchParams] = useSearchParams()
  const urlDate = searchParams.get('date')
  const { settings } = useSettings()

  // wkStart is always the canonical Monday key — never derived from wso.
  const [wkStart, setWkStart] = useState(weekStart(urlDate ?? today))

  // Re-sync if a new ?date= arrives while this page is already mounted.
  useEffect(() => {
    if (urlDate) setWkStart(weekStart(urlDate))
  }, [urlDate])

  function navPrev()  { setWkStart(w => weekStart(subWeeks(parseISO(w), 1))) }
  function navNext()  { setWkStart(w => weekStart(addWeeks(parseISO(w), 1))) }
  function navToday() { setWkStart(weekStart(today)) }
  function handleDaySelect(date: string) { navigate(`/day?date=${date}`) }

  return (
    <div className={styles.shell}>
      <PeriodNav
        heading={formatWeekRange(weekDisplayStart(wkStart, settings.weekStartsOn), dateLocale)}
        onPrev={navPrev}
        onNext={navNext}
        onToday={navToday}
        isToday={wkStart === weekStart(today)}
      />
      <div className={styles.viewArea}>
        <WeekView weekStart={wkStart} onDaySelect={handleDaySelect} />
      </div>
    </div>
  )
}
