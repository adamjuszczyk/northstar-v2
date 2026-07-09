import { useMemo } from 'react'
import { differenceInCalendarDays, parseISO, format, subDays } from 'date-fns'
import type { HabitEntry, HabitMode } from '../../hooks/useHabits'
import styles from './TrendChart.module.css'

interface Props {
  mode:    HabitMode
  entries: HabitEntry[]   // already filtered to one habit, chronological (oldest first)
}

const BUILD_WINDOW_DAYS = 14
const REDUCE_MAX_GAPS   = 10

interface Bar {
  key:   string
  label: string
  value: number
}

/**
 * Build mode: frequency over time — one bar per day for the last 14 days,
 * height = entries logged that day.
 * Reduce mode: gap between occurrences — one bar per gap between
 * consecutive entries (last 10), height = days elapsed. Rising bars mean
 * the habit is happening less often, which is the goal.
 */
export default function TrendChart({ mode, entries }: Props) {
  const bars = useMemo((): Bar[] => {
    if (mode === 'build') {
      const days: Bar[] = []
      for (let i = BUILD_WINDOW_DAYS - 1; i >= 0; i--) {
        const d = subDays(new Date(), i)
        days.push({ key: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE d'), value: 0 })
      }
      const byDay = new Map(days.map(d => [d.key, d]))
      for (const e of entries) {
        const key = format(parseISO(e.loggedAt), 'yyyy-MM-dd')
        const bucket = byDay.get(key)
        if (bucket) bucket.value += 1
      }
      return days
    }

    const gaps: Bar[] = []
    for (let i = 1; i < entries.length; i++) {
      const gap = Math.max(0, differenceInCalendarDays(parseISO(entries[i].loggedAt), parseISO(entries[i - 1].loggedAt)))
      gaps.push({ key: String(i), label: `${gap}d gap`, value: gap })
    }
    return gaps.slice(-REDUCE_MAX_GAPS)
  }, [mode, entries])

  const hasData = bars.some(b => b.value > 0)
  const max = Math.max(1, ...bars.map(b => b.value))

  if (!hasData) {
    return (
      <div className={styles.empty}>
        {mode === 'build' ? 'No entries yet — log one to start the trend.' : 'No occurrences logged yet.'}
      </div>
    )
  }

  return (
    <div className={`${styles.chart} ${mode === 'build' ? styles.chartBuild : styles.chartReduce}`}>
      {bars.map(b => (
        <div key={b.key} className={styles.barCol} title={b.label}>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ height: `${b.value === 0 ? 0 : Math.max(6, (b.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
