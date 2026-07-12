import { addDays, format, parseISO } from 'date-fns'
import { toISODate } from '../../lib/dates'
import styles from './WeekPicker.module.css'

interface Props {
  /** Canonical Monday ISO date for the selected week */
  value:    string
  onChange: (weekStartISO: string) => void
}

export default function WeekPicker({ value, onChange }: Props) {
  const start = parseISO(value)
  const end   = addDays(start, 6)

  function shift(days: number) {
    onChange(toISODate(addDays(start, days)))
  }

  return (
    <div className={styles.weekPicker}>
      <button
        type="button"
        className={styles.navBtn}
        onClick={() => shift(-7)}
        aria-label="Previous week"
      >‹</button>

      <div className={styles.label}>
        <span className={styles.labelMain}>Week of {format(start, 'd MMM')}</span>
        <span className={styles.labelSub}>{format(start, 'd MMM')} – {format(end, 'd MMM yyyy')}</span>
      </div>

      <button
        type="button"
        className={styles.navBtn}
        onClick={() => shift(7)}
        aria-label="Next week"
      >›</button>
    </div>
  )
}
