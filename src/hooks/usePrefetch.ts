import { useEffect } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { weekStart, monthStart } from '../lib/dates'
import { db } from '../lib/db'
import { replayQueue } from '../lib/syncQueue'
import { useAuth } from './useAuth'

/**
 * Pre-populates IndexedDB with critical data while online, and replays any
 * queued offline writes. Runs once on mount (after auth). Runs silently —
 * failures don't affect UI.
 */
export function usePrefetch() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user || !navigator.onLine) return

    const today   = format(new Date(), 'yyyy-MM-dd')
    const wkStart = weekStart(today)
    const moStart = monthStart(today)

    async function populate() {
      try {
        // Replay first so cached reads below reflect the latest local writes.
        await replayQueue(user!.id)
        await Promise.allSettled([
          prefetchDayItems(user!.id, today),
          prefetchInboxItems(user!.id),
          prefetchTreeNodes(user!.id),
          prefetchWeekFocus(user!.id, wkStart),
          prefetchMonthFocus(user!.id, moStart),
          prefetchJournalEntry(user!.id, today),
        ])
      } catch {
        // silent — offline functionality is best-effort
      }
    }

    populate()
  }, [user])
}

async function prefetchDayItems(userId: string, date: string) {
  const { data } = await supabase
    .from('ns_day_items')
    .select('id, user_id, date, source, title, tree_node_id, inbox_item_id, habit_id, start_time, end_time, is_complete, priority, colour, position, created_at, updated_at')
    .eq('user_id', userId)
    .eq('date', date)
  if (!data) return
  await db.dayItems.bulkPut(data.map(r => ({
    id:          r.id,
    userId:      r.user_id,
    date:        r.date,
    source:      r.source,
    title:       r.title,
    treeNodeId:  r.tree_node_id,
    inboxItemId: r.inbox_item_id,
    habitId:     r.habit_id ?? null,
    startTime:   r.start_time  ? (r.start_time  as string).slice(0, 5) : null,
    endTime:     r.end_time    ? (r.end_time    as string).slice(0, 5) : null,
    isComplete:  r.is_complete,
    priority:    r.priority,
    colour:      r.colour ?? null,
    position:    r.position,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  })))
}

async function prefetchInboxItems(userId: string) {
  const { data } = await supabase
    .from('ns_inbox_items')
    .select('id, user_id, content, state, promoted_node_id, carried_over, is_completed, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (!data) return
  await db.inboxItems.bulkPut(data.map(r => ({
    id:             r.id,
    userId:         r.user_id,
    content:        r.content,
    state:          r.state,
    promotedNodeId: r.promoted_node_id,
    carriedOver:    r.carried_over,
    isCompleted:    r.is_completed,
    createdAt:      r.created_at,
    updatedAt:      r.updated_at,
  })))
}

async function prefetchTreeNodes(userId: string) {
  const { data } = await supabase
    .from('ns_tree_nodes')
    .select('id, user_id, title, type, status, parent_id, position, updated_at')
    .eq('user_id', userId)
  if (!data) return
  await db.treeNodes.bulkPut(data.map(r => ({
    id:       r.id,
    userId:   r.user_id,
    title:    r.title,
    type:     r.type,
    status:   r.status,
    parentId: r.parent_id,
    position: r.position,
    updatedAt: r.updated_at,
  })))
}

async function prefetchWeekFocus(userId: string, wkStart: string) {
  const { data, error } = await supabase
    .from('ns_week_focus')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', wkStart)
  // Table may not exist yet — ignore error
  if (error || !data) return
  await db.weekFocus.bulkPut(data.map(r => ({
    id:          r.id,
    userId:      r.user_id,
    weekStart:   r.week_start,
    source:      r.source,
    title:       r.title,
    treeNodeId:  r.tree_node_id,
    inboxItemId: r.inbox_item_id,
    habitId:     r.habit_id ?? null,
    isComplete:  r.is_complete,
    position:    r.position,
  })))
}

async function prefetchJournalEntry(userId: string, date: string) {
  const { data, error } = await supabase
    .from('ns_journal_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()
  // Table may not exist yet, or no entry for today — ignore
  if (error || !data) return
  await db.journalEntries.put({
    id:        data.id,
    userId:    data.user_id,
    date:      data.date,
    content:   data.content,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  })
}

async function prefetchMonthFocus(userId: string, moStart: string) {
  const { data, error } = await supabase
    .from('ns_month_focus')
    .select('*')
    .eq('user_id', userId)
    .eq('month_start', moStart)
  // Table may not exist yet — ignore error
  if (error || !data) return
  await db.monthFocus.bulkPut(data.map(r => ({
    id:          r.id,
    userId:      r.user_id,
    monthStart:  r.month_start,
    source:      r.source,
    title:       r.title,
    treeNodeId:  r.tree_node_id,
    inboxItemId: r.inbox_item_id,
    habitId:     r.habit_id ?? null,
    isComplete:  r.is_complete,
    position:    r.position,
  })))
}
