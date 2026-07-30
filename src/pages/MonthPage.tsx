import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { addMonths, subMonths, parseISO } from 'date-fns'
import { monthStart, formatMonthYear } from '../lib/dates'
import { useTodayISO } from '../hooks/useTodayISO'
import { useDateFnsLocale } from '../i18n'
import PeriodNav from '../components/planner/PeriodNav'
import MonthView from '../components/month/MonthView'
import styles from './PeriodPage.module.css'

export default function MonthPage() {
  const today = useTodayISO()
  const navigate = useNavigate()
  const dateLocale = useDateFnsLocale()
  const [searchParams] = useSearchParams()
  const urlDate = searchParams.get('date')

  const [moStart, setMoStart] = useState(monthStart(urlDate ?? today))

  // Re-sync if a new ?date= arrives while this page is already mounted.
  useEffect(() => {
    if (urlDate) setMoStart(monthStart(urlDate))
  }, [urlDate])

  function navPrev()  { setMoStart(m => monthStart(subMonths(parseISO(m), 1))) }
  function navNext()  { setMoStart(m => monthStart(addMonths(parseISO(m), 1))) }
  function navToday() { setMoStart(monthStart(today)) }
  function handleDaySelect(date: string) { navigate(`/day?date=${date}`) }

  return (
    <div className={styles.shell}>
      <PeriodNav
        heading={formatMonthYear(moStart, dateLocale)}
        onPrev={navPrev}
        onNext={navNext}
        onToday={navToday}
        isToday={moStart === monthStart(today)}
      />
      <div className={styles.viewArea}>
        <MonthView monthStart={moStart} onDaySelect={handleDaySelect} />
      </div>
    </div>
  )
}
