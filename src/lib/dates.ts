import type { Locale } from 'date-fns'
import {
  format,
  startOfWeek,
  startOfMonth,
  parseISO,
  isToday,
  isSameDay,
  subDays,
} from 'date-fns'

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function todayISO(): string {
  return toISODate(new Date())
}

/**
 * Canonical week key (always the Monday of the week containing d).
 * This is the value stored/queried as `week_start` — it must NOT depend on
 * the user's "week starts on" display preference, or the same calendar week
 * would be keyed differently depending on which device/setting wrote it.
 */
export function weekStart(d: Date | string): string {
  const date = typeof d === 'string' ? parseISO(d) : d
  return toISODate(startOfWeek(date, { weekStartsOn: 1 }))
}

/**
 * Display-only: shifts a canonical Monday week-start back one day when the
 * user's setting is Sunday-first, so the rendered grid starts on Sunday
 * while still showing the same underlying (Monday-keyed) week.
 */
export function weekDisplayStart(mondayISO: string, weekStartsOn: 0 | 1): string {
  if (weekStartsOn === 0) return toISODate(subDays(parseISO(mondayISO), 1))
  return mondayISO
}

/** First day of the month containing d */
export function monthStart(d: Date | string): string {
  const date = typeof d === 'string' ? parseISO(d) : d
  return toISODate(startOfMonth(date))
}

export function formatDayHeading(iso: string, locale?: Locale): string {
  return format(parseISO(iso), 'EEEE d MMMM yyyy', { locale })
}

export function formatMonthYear(iso: string, locale?: Locale): string {
  return format(parseISO(iso), 'MMMM yyyy', { locale })
}

export function formatWeekRange(weekStartISO: string, locale?: Locale): string {
  const start = parseISO(weekStartISO)
  const end   = new Date(start)
  end.setDate(end.getDate() + 6)
  return `${format(start, 'd MMM', { locale })} – ${format(end, 'd MMM yyyy', { locale })}`
}

export { isToday, isSameDay, parseISO }
