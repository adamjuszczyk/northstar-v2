import { format } from 'date-fns'
import DayView from '../components/day/DayView'

export default function TodayPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  return <DayView date={today} />
}
