import { useEffect, useState } from 'react'
import { todayISO } from '../lib/dates'

/**
 * Today's ISO date, refreshed when the tab regains visibility and at the
 * next local midnight — otherwise an app left open overnight keeps
 * yesterday's date until something else forces a re-render.
 */
export function useTodayISO(): string {
  const [today, setToday] = useState(todayISO)

  useEffect(() => {
    function refresh() {
      setToday(prev => {
        const next = todayISO()
        return next === prev ? prev : next
      })
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refresh()
    }

    let timer: ReturnType<typeof setTimeout>
    function scheduleMidnightTick() {
      const now  = new Date()
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5)
      timer = setTimeout(() => {
        refresh()
        scheduleMidnightTick()
      }, next.getTime() - now.getTime())
    }

    scheduleMidnightTick()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return today
}
