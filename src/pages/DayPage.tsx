import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTodayISO } from '../hooks/useTodayISO'
import DayView from '../components/day/DayView'

export default function DayPage() {
  const today = useTodayISO()
  const [searchParams] = useSearchParams()
  const urlDate = searchParams.get('date')
  const [date, setDate] = useState(urlDate ?? today)

  // Re-sync if a new ?date= arrives while this page is already mounted
  // (e.g. a link elsewhere navigates to /day?date=X again) — plain useState
  // only seeds the initial value, matching the same guard PlannerShell used
  // to have for its day tab.
  useEffect(() => {
    if (urlDate) setDate(urlDate)
  }, [urlDate])

  return <DayView date={date} onDateChange={setDate} />
}
