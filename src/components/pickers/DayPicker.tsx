import { useState } from 'react'
import { addMonths, addDays, format, parseISO, startOfMonth, endOfMonth, getDay, isSameDay, isToday } from 'date-fns'
import { useSettings } from '../../hooks/useSettings'
import { toISODate } from '../../lib/dates'
import { useT, useDateFnsLocale, type Key } from '../../i18n'
import styles from './DayPicker.module.css'

const DAY_NAME_KEYS_MON_FIRST: Key[] = [
  'common.weekdayMon', 'common.weekdayTue', 'common.weekdayWed', 'common.weekdayThu',
  'common.weekdayFri', 'common.weekdaySat', 'common.weekdaySun',
]
const DAY_NAME_KEYS_SUN_FIRST: Key[] = [
  'common.weekdaySun', 'common.weekdayMon', 'common.weekdayTue', 'common.weekdayWed',
  'common.weekdayThu', 'common.weekdayFri', 'common.weekdaySat',
]

function cx(...cs: (string | false | undefined | null)[]): string {
  return cs.filter(Boolean).join(' ')
}

function buildGrid(monthStart: Date, weekStartsOn: 0 | 1): (Date | null)[] {
  const last = endOfMonth(monthStart)
  const startPad = weekStartsOn === 1 ? (getDay(monthStart) + 6) % 7 : getDay(monthStart)

  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)

  let cur = monthStart
  while (cur <= last) {
    cells.push(cur)
    cur = addDays(cur, 1)
  }
  const endPad = (7 - (cells.length % 7)) % 7
  for (let i = 0; i < endPad; i++) cells.push(null)
  return cells
}

interface Props {
  /** Selected day, 'YYYY-MM-DD', or empty string for no selection yet */
  value:    string
  onChange: (dateISO: string) => void
}

export default function DayPicker({ value, onChange }: Props) {
  const { settings } = useSettings()
  const t = useT()
  const dateLocale = useDateFnsLocale()
  const selected = value ? parseISO(value) : null
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected ?? new Date()))

  const dayNameKeys = settings.weekStartsOn === 0 ? DAY_NAME_KEYS_SUN_FIRST : DAY_NAME_KEYS_MON_FIRST
  const cells       = buildGrid(viewMonth, settings.weekStartsOn)

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setViewMonth(m => addMonths(m, -1))}
          aria-label={t('pickers.previousMonth')}
        >‹</button>
        <span className={styles.headerLabel}>{format(viewMonth, 'MMMM yyyy', { locale: dateLocale })}</span>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setViewMonth(m => addMonths(m, 1))}
          aria-label={t('inbox.scheduleQuickNextMonth')}
        >›</button>
      </div>

      <div className={styles.weekRow}>
        {dayNameKeys.map(k => <span key={k} className={styles.weekLabel}>{t(k)}</span>)}
      </div>

      <div className={styles.grid}>
        {cells.map((date, i) =>
          date === null
            ? <span key={`pad-${i}`} className={styles.emptyCell} />
            : (
              <button
                type="button"
                key={toISODate(date)}
                className={cx(
                  styles.cell,
                  selected && isSameDay(date, selected) && styles.cellSelected,
                  isToday(date) && styles.cellToday,
                )}
                onClick={() => onChange(toISODate(date))}
              >
                {format(date, 'd')}
              </button>
            )
        )}
      </div>
    </div>
  )
}
