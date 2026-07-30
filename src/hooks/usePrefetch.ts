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
          prefetchDayItems(user!.id, today).then(taskIds => prefetchTasks(user!.id, taskIds)),
          prefetchInboxItems(user!.id),
          prefetchTreeNodes(user!.id),
          prefetchWeekFocus(user!.id, wkStart),
          prefetchMonthFocus(user!.id, moStart),
          prefetchLines(user!.id, today),
          prefetchBlocks(user!.id, today),
          prefetchSheets(user!.id),
        ])
      } catch {
        // silent — offline functionality is best-effort
      }
    }

    populate()
  }, [user])
}

/** Returns the distinct task ids referenced by today's cached day items, so
 *  the caller can prefetch just those tasks (prefetchTasks) rather than
 *  every task the user has ever materialized. */
async function prefetchDayItems(userId: string, date: string): Promise<string[]> {
  const { data } = await supabase
    .from('ns_day_items')
    .select('id, user_id, date, source, title, tree_node_id, inbox_item_id, habit_id, start_time, end_time, is_complete, priority, colour, position, counter_current, counter_target, origin_week_focus_id, origin_month_focus_id, block_id, task_id, created_at, updated_at')
    .eq('user_id', userId)
    .eq('date', date)
  if (!data) return []
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
    counterCurrent: r.counter_current ?? 0,
    counterTarget:  r.counter_target ?? null,
    originWeekFocusId:  r.origin_week_focus_id  ?? null,
    originMonthFocusId: r.origin_month_focus_id ?? null,
    blockId:     r.block_id ?? null,
    taskId:      r.task_id  ?? null,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  })))
  return Array.from(new Set(data.map(r => r.task_id).filter((id): id is string => !!id)))
}

/** Caches the tasks referenced by today's day items, plus their steps, so
 *  an offline Today/Day view can still resolve a task-linked item's real
 *  title and step progress instead of rendering "Untitled" or a blank
 *  checklist (the same trap TASKS.md §3.3 flags for the online grids). */
async function prefetchTasks(userId: string, taskIds: string[]) {
  if (taskIds.length === 0) return
  const { data: tasks, error } = await supabase
    .from('ns_tasks')
    .select('*')
    .eq('user_id', userId)
    .in('id', taskIds)
  // Table may not exist yet (migration not run) — ignore error
  if (error || !tasks) return
  await db.tasks.bulkPut(tasks.map(r => ({
    id:          r.id,
    userId:      r.user_id,
    source:      r.source,
    title:       r.title,
    treeNodeId:  r.tree_node_id,
    inboxItemId: r.inbox_item_id,
    habitId:     r.habit_id ?? null,
    notes:       r.notes ?? null,
    isComplete:  r.is_complete,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  })))

  const { data: steps, error: stepsError } = await supabase
    .from('ns_task_steps')
    .select('*')
    .eq('user_id', userId)
    .in('task_id', taskIds)
  if (stepsError || !steps) return
  await db.taskSteps.bulkPut(steps.map(r => ({
    id:        r.id,
    userId:    r.user_id,
    taskId:    r.task_id,
    content:   r.content,
    position:  r.position,
    isDone:    r.is_done,
    doneAt:    r.done_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })))
}

async function prefetchInboxItems(userId: string) {
  const { data } = await supabase
    .from('ns_inbox_items')
    .select('id, user_id, content, kind, state, promoted_node_id, carried_over, is_completed, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (!data) return
  await db.inboxItems.bulkPut(data.map(r => ({
    id:             r.id,
    userId:         r.user_id,
    content:        r.content,
    kind:           r.kind ?? 'task',
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
    .select('id, user_id, title, type, status, parent_id, position, sheet_id, updated_at')
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
    sheetId:  (r as { sheet_id?: string | null }).sheet_id ?? null,
    updatedAt: r.updated_at,
  })))
}

/** Table may not exist yet (migration_17 not run) — ignore error, same
 *  guard pattern as prefetchLines/prefetchBlocks/prefetchTasks. */
async function prefetchSheets(userId: string) {
  const { data, error } = await supabase
    .from('ns_sheets')
    .select('*')
    .eq('user_id', userId)
  if (error || !data) return
  await db.sheets.bulkPut(data.map(r => ({
    id:           r.id,
    userId:       r.user_id,
    name:         r.name,
    anchorNodeId: r.anchor_node_id ?? null,
    position:     r.position,
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
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
    taskId:      r.task_id  ?? null,
    isComplete:  r.is_complete,
    position:    r.position,
  })))
}

async function prefetchLines(userId: string, date: string) {
  const { data, error } = await supabase
    .from('ns_lines')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
  // Table may not exist yet (migration not run) — ignore error
  if (error || !data) return
  await db.lines.bulkPut(data.map(r => ({
    id:        r.id,
    userId:    r.user_id,
    date:      r.date,
    label:     r.label,
    time:      (r.time as string).slice(0, 5),
    colour:    r.colour ?? null,
    position:  r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })))
}

async function prefetchBlocks(userId: string, date: string) {
  const { data, error } = await supabase
    .from('ns_blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
  // Table may not exist yet (migration not run) — ignore error
  if (error || !data) return
  await db.blocks.bulkPut(data.map(r => ({
    id:        r.id,
    userId:    r.user_id,
    date:      r.date,
    name:      r.name,
    startTime: (r.start_time as string).slice(0, 5),
    endTime:   (r.end_time as string).slice(0, 5),
    colour:    r.colour ?? null,
    notes:     r.notes ?? null,
    position:  r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })))
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
    taskId:      r.task_id  ?? null,
    isComplete:  r.is_complete,
    position:    r.position,
  })))
}
