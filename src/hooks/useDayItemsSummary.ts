import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useAuth } from './useAuth'

export interface DayItemSummaryRow {
  id:          string
  date:        string
  startTime:   string | null
  title:       string | null
  treeNodeId:  string | null
  inboxItemId: string | null
  habitId:     string | null
  priority:    'high' | 'medium' | 'low'
  isComplete:  boolean
  source:      'standalone' | 'tree' | 'inbox' | 'habit'
  originWeekFocusId:  string | null
  originMonthFocusId: string | null
  /** Non-null = this occurrence is task-linked — title/treeNodeId/inboxItemId/
   *  habitId above are null and ignored for it; resolve through the task
   *  (TASKS.md §3.3 rule 1). Without this, every split task renders
   *  "Untitled" in the Week/Month grids — the exact trap flagged in
   *  TASKS.md §3.3. */
  taskId: string | null
}

function normP(p: unknown): 'high' | 'medium' | 'low' {
  return p === 'high' || p === 'low' ? p : 'medium'
}

export function useRangeDayItems(startDate: string, endDate: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['ns_day_items_range', startDate, endDate],
    queryFn: async (): Promise<DayItemSummaryRow[]> => {
      if (!navigator.onLine) {
        const cached = await db.dayItems
          .where('userId').equals(user!.id)
          .filter(r => r.date >= startDate && r.date <= endDate)
          .toArray()
        return cached
          .map(r => ({
            id:          r.id,
            date:        r.date,
            startTime:   r.startTime,
            title:       r.title,
            treeNodeId:  r.treeNodeId,
            inboxItemId: r.inboxItemId,
            habitId:     r.habitId ?? null,
            priority:    normP(r.priority),
            isComplete:  r.isComplete,
            source:      r.source as 'standalone' | 'tree' | 'inbox' | 'habit',
            originWeekFocusId:  r.originWeekFocusId  ?? null,
            originMonthFocusId: r.originMonthFocusId ?? null,
            taskId:      r.taskId ?? null,
          }))
          .sort((a, b) => a.date === b.date
            ? (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99')
            : a.date.localeCompare(b.date))
      }
      const { data, error } = await supabase
        .from('ns_day_items')
        .select('id, date, start_time, title, tree_node_id, inbox_item_id, habit_id, priority, is_complete, source, origin_week_focus_id, origin_month_focus_id, task_id')
        .eq('user_id', user!.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date')
        .order('start_time', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []).map(r => ({
        id:          r.id           as string,
        date:        r.date         as string,
        startTime:   typeof r.start_time === 'string' ? (r.start_time as string).slice(0, 5) : null,
        title:       r.title        as string | null,
        treeNodeId:  r.tree_node_id  as string | null,
        inboxItemId: r.inbox_item_id as string | null,
        habitId:     (r.habit_id as string | null) ?? null,
        priority:    normP(r.priority),
        isComplete:  r.is_complete  as boolean,
        source:      r.source      as 'standalone' | 'tree' | 'inbox' | 'habit',
        originWeekFocusId:  (r.origin_week_focus_id as string | null)  ?? null,
        originMonthFocusId: (r.origin_month_focus_id as string | null) ?? null,
        taskId:      (r.task_id as string | null) ?? null,
      }))
    },
    networkMode: 'always',
    enabled: !!user && !!startDate && !!endDate,
  })
}

/** Group items by ISO date string */
export function groupByDate(
  items: DayItemSummaryRow[],
): Map<string, DayItemSummaryRow[]> {
  const map = new Map<string, DayItemSummaryRow[]>()
  for (const item of items) {
    const bucket = map.get(item.date)
    if (bucket) bucket.push(item)
    else map.set(item.date, [item])
  }
  return map
}

/** Highest priority across a set of items, null if empty */
export function maxPriority(
  items: DayItemSummaryRow[],
): 'high' | 'medium' | 'low' | null {
  if (!items.length) return null
  if (items.some(i => i.priority === 'high'))   return 'high'
  if (items.some(i => i.priority === 'medium')) return 'medium'
  return 'low'
}
