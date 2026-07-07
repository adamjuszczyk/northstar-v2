import { useTodayISO } from '../hooks/useTodayISO'
import DayView from '../components/day/DayView'

export default function TodayPage() {
  const today = useTodayISO()
  return <DayView date={today} />
}
