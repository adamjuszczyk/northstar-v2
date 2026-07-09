import { useNavigate } from 'react-router-dom'
import { useWeekFocus } from '../../hooks/useWeekFocus'
import { useMonthFocus } from '../../hooks/useMonthFocus'
import { weekStart, monthStart } from '../../lib/dates'
import styles from './FocusReminder.module.css'

interface Props {
  date: string
}

export default function FocusReminder({ date }: Props) {
  const navigate = useNavigate()
  const { data: weekItems  = [] } = useWeekFocus(weekStart(date))
  const { data: monthItems = [] } = useMonthFocus(monthStart(date))

  const weekCount  = weekItems.filter(i => !i.isComplete).length
  const monthCount = monthItems.filter(i => !i.isComplete).length

  if (weekCount === 0 && monthCount === 0) return null

  function goTo(tab: 'week' | 'month') {
    navigate(`/planner?date=${date}&tab=${tab}`)
  }

  return (
    <div className={styles.bar}>
      <span className={styles.arrow}>↗</span>
      {weekCount > 0 && (
        <button className={styles.chip} onClick={() => goTo('week')}>
          {weekCount} this week
        </button>
      )}
      {weekCount > 0 && monthCount > 0 && <span className={styles.sep}>·</span>}
      {monthCount > 0 && (
        <button className={styles.chip} onClick={() => goTo('month')}>
          {monthCount} this month
        </button>
      )}
    </div>
  )
}
