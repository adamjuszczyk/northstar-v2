import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { useTodayISO } from './useTodayISO'
import { useT } from '../i18n'

/**
 * Moves unfinished standalone day items from previous days into the inbox
 * as carried-over captures, then removes them from the day. Runs once per
 * (user, today) — on mount and whenever the local date rolls over past
 * midnight. Tree- and inbox-sourced items are left alone since they still
 * belong to their original source of truth.
 */
export function useCarryOverSweep() {
  const { user } = useAuth()
  const today = useTodayISO()
  const qc = useQueryClient()
  const t = useT()
  const sweptKey = useRef<string | null>(null)

  useEffect(() => {
    if (!user || !navigator.onLine) return
    const key = `${user.id}:${today}`
    if (sweptKey.current === key) return
    sweptKey.current = key

    let cancelled = false
    async function sweep() {
      const { data, error } = await supabase
        .from('ns_day_items')
        .select('id, title')
        .eq('user_id', user!.id)
        .eq('source', 'standalone')
        .eq('is_complete', false)
        .lt('date', today)
      if (error || !data || data.length === 0 || cancelled) return

      let moved = false
      for (const row of data as { id: string; title: string | null }[]) {
        const { error: insErr } = await supabase
          .from('ns_inbox_items')
          .insert({
            user_id:      user!.id,
            content:      row.title ?? t('inbox.carriedOverUntitledTask'),
            state:        'unassigned',
            carried_over: true,
          })
        if (insErr) continue
        const { error: delErr } = await supabase
          .from('ns_day_items')
          .delete()
          .eq('id', row.id)
          .eq('user_id', user!.id)
        if (!delErr) moved = true
      }
      if (moved && !cancelled) {
        qc.invalidateQueries({ queryKey: ['ns_day_items'] })
        qc.invalidateQueries({ queryKey: ['ns_inbox'] })
      }
    }
    sweep()
    return () => { cancelled = true }
  }, [user, today, qc])
}
