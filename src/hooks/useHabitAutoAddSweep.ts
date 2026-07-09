import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { useTodayISO } from './useTodayISO'
import { weekStart, monthStart } from '../lib/dates'

interface AutoAddHabitRow {
  id:          string
  auto_add_to: 'day' | 'week' | 'month' | null
}

/**
 * Pulls auto-add habits into today's day view, this week's focus, and this
 * month's focus, once per (user, today) — mirrors useCarryOverSweep's
 * idempotency pattern. Re-checking on every date rollover is cheap and safe
 * since each pull is itself guarded by an existence check.
 */
export function useHabitAutoAddSweep() {
  const { user } = useAuth()
  const today = useTodayISO()
  const qc = useQueryClient()
  const sweptKey = useRef<string | null>(null)

  useEffect(() => {
    if (!user || !navigator.onLine) return
    const key = `${user.id}:${today}`
    if (sweptKey.current === key) return
    sweptKey.current = key

    let cancelled = false
    async function sweep() {
      const { data: habits, error } = await supabase
        .from('ns_habits')
        .select('id, auto_add_to')
        .eq('user_id', user!.id)
        .eq('auto_add', true)
      if (error || !habits || cancelled) return

      const wStart = weekStart(today)
      const mStart = monthStart(today)
      let touchedDay = false, touchedWeek = false, touchedMonth = false

      for (const h of habits as AutoAddHabitRow[]) {
        if (h.auto_add_to === 'day') {
          const { data: existing } = await supabase
            .from('ns_day_items').select('id')
            .eq('user_id', user!.id).eq('habit_id', h.id).eq('date', today)
            .limit(1)
          if (!existing || existing.length === 0) {
            const { error: insErr } = await supabase.from('ns_day_items').insert({
              user_id: user!.id, date: today, source: 'habit', habit_id: h.id,
              is_complete: false, position: 0, priority: 'medium',
            })
            if (!insErr) touchedDay = true
          }
        } else if (h.auto_add_to === 'week') {
          const { data: existing } = await supabase
            .from('ns_week_focus').select('id')
            .eq('user_id', user!.id).eq('habit_id', h.id).eq('week_start', wStart)
            .limit(1)
          if (!existing || existing.length === 0) {
            const { error: insErr } = await supabase.from('ns_week_focus').insert({
              user_id: user!.id, week_start: wStart, source: 'habit', habit_id: h.id,
              is_complete: false, position: 0,
            })
            if (!insErr) touchedWeek = true
          }
        } else if (h.auto_add_to === 'month') {
          const { data: existing } = await supabase
            .from('ns_month_focus').select('id')
            .eq('user_id', user!.id).eq('habit_id', h.id).eq('month_start', mStart)
            .limit(1)
          if (!existing || existing.length === 0) {
            const { error: insErr } = await supabase.from('ns_month_focus').insert({
              user_id: user!.id, month_start: mStart, source: 'habit', habit_id: h.id,
              is_complete: false, position: 0,
            })
            if (!insErr) touchedMonth = true
          }
        }
      }

      if (!cancelled) {
        if (touchedDay)   qc.invalidateQueries({ queryKey: ['ns_day_items'] })
        if (touchedWeek)  qc.invalidateQueries({ queryKey: ['ns_week_focus'] })
        if (touchedMonth) qc.invalidateQueries({ queryKey: ['ns_month_focus'] })
      }
    }
    sweep()
    return () => { cancelled = true }
  }, [user, today, qc])
}
