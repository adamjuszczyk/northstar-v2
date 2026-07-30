import { addDays, format, parseISO } from 'date-fns'
import { toISODate } from '../../lib/dates'
import { useT, useDateFnsLocale } from '../../i18n'
import styles from './WeekPicker.module.css'

interface Props {
  /** Canonical Monday ISO date for the selected week */
  value:    string
  onChange: (weekStartISO: string) => void
}

export default function WeekPicker({ value, onChange }: Props) {
  const t = useT()
  const dateLocale = useDateFnsLocale()
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
        aria-label={t('pickers.previousWeek')}
      >‹</button>

      <div className={styles.label}>
        <span className={styles.labelMain}>{t('pickers.weekOf', { date: format(start, 'd MMM', { locale: dateLocale }) })}</span>
        <span className={styles.labelSub}>{t('pickers.weekRange', { start: format(start, 'd MMM', { locale: dateLocale }), end: format(end, 'd MMM yyyy', { locale: dateLocale }) })}</span>
      </div>

      <button
        type="button"
        className={styles.navBtn}
        onClick={() => shift(7)}
        aria-label={t('inbox.scheduleQuickNextWeek')}
      >›</button>
    </div>
  )
}
