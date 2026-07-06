import {
  format,
  startOfWeek,
  startOfMonth,
  parseISO,
  isToday,
  isSameDay,
} from 'date-fns'

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function todayISO(): string {
  return toISODate(new Date())
}

/** First day of the week containing d. weekStartsOn: 1=Monday (default), 0=Sunday */
export function weekStart(d: Date | string, weekStartsOn: 0 | 1 = 1): string {
  const date = typeof d === 'string' ? parseISO(d) : d
  return toISODate(startOfWeek(date, { weekStartsOn }))
}

/** First day of the month containing d */
export function monthStart(d: Date | string): string {
  const date = typeof d === 'string' ? parseISO(d) : d
  return toISODate(startOfMonth(date))
}

export function formatDayHeading(iso: string): string {
  return format(parseISO(iso), 'EEEE d MMMM yyyy')
}

export function formatMonthYear(iso: string): string {
  return format(parseISO(iso), 'MMMM yyyy')
}

export function formatWeekRange(weekStartISO: string): string {
  const start = parseISO(weekStartISO)
  const end   = new Date(start)
  end.setDate(end.getDate() + 6)
  return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`
}

export { isToday, isSameDay, parseISO }
