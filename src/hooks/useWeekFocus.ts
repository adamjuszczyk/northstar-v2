import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useAuth } from './useAuth'
import { maybeRevertInboxItemState } from './useInboxItems'
import {
  applyTaskCompletion, findOrCreateTaskForRef, maybeRevertTaskInboxState,
  invalidateTaskLinkedQueries,
} from './useTasks'

export type FocusSource = 'standalone' | 'tree' | 'inbox' | 'habit'

export interface WeekFocusItem {
  id:          string
  weekStart:   string
  source:      FocusSource
  title:       string | null
  treeNodeId:  string | null
  inboxItemId: string | null
  habitId:     string | null
  /** Non-null = this row is linked to a shared ns_tasks entity rather than
   *  a copied title (this session's TaskSourceForm fix). `source` stays
   *  'standalone' regardless — that's what keeps it in the Tasks section
   *  rather than Goals; the task's OWN source carries the real
   *  tree/inbox provenance. */
  taskId:      string | null
  isComplete:  boolean
  position:    number
}

function fromRow(r: Record<string, unknown>): WeekFocusItem {
  return {
    id:          r.id           as string,
    weekStart:   r.week_start   as string,
    source:      r.source       as FocusSource,
    title:       r.title        as string | null,
    treeNodeId:  r.tree_node_id  as string | null,
    inboxItemId: r.inbox_item_id as string | null,
    habitId:     (r.habit_id as string | null) ?? null,
    taskId:      (r.task_id  as string | null) ?? null,
    isComplete:  r.is_complete   as boolean,
    position:    r.position      as number,
  }
}

export function useWeekFocus(weekStart: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['ns_week_focus', weekStart],
    queryFn: async (): Promise<WeekFocusItem[]> => {
      if (!navigator.onLine) {
        const cached = await db.weekFocus
          .where('userId').equals(user!.id)
          .filter(r => r.weekStart === weekStart)
          .sortBy('position')
        return cached.map(r => ({
          id:          r.id,
          weekStart:   r.weekStart,
          source:      r.source as FocusSource,
          title:       r.title,
          treeNodeId:  r.treeNodeId,
          inboxItemId: r.inboxItemId,
          habitId:     r.habitId ?? null,
          taskId:      r.taskId  ?? null,
          isComplete:  r.isComplete,
          position:    r.position,
        }))
      }
      const { data, error } = await supabase
        .from('ns_week_focus')
        .select('*')
        .eq('user_id', user!.id)
        .eq('week_start', weekStart)
        .order('position')
        .order('created_at')
      if (error) {
        const code = (error as { code?: string }).code ?? ''
        if (code === '42P01' || code === 'PGRST116' || code === 'PGRST205') return []
        throw error
      }
      return (data ?? []).map(r => fromRow(r as Record<string, unknown>))
    },
    networkMode: 'always',
    enabled: !!user && !!weekStart,
  })
}

export interface CreateWeekFocusInput {
  weekStart:   string
  source:      FocusSource
  title?:      string
  treeNodeId?: string
}

export function useCreateWeekFocus() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateWeekFocusInput) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('ns_week_focus').insert({
        user_id:      user.id,
        week_start:   input.weekStart,
        source:       input.source,
        title:        input.title      ?? null,
        tree_node_id: input.treeNodeId ?? null,
        is_complete:  false,
        position:     0,
      })
      if (error) throw error
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['ns_week_focus', input.weekStart] })
    },
  })
}

/** Bulk insert — one row per selected tree node, single round trip. */
export function useCreateWeekFocusMany() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ weekStart, treeNodeIds }: { weekStart: string; treeNodeIds: string[] }) => {
      if (!user) throw new Error('Not authenticated')
      if (treeNodeIds.length === 0) return
      const { error } = await supabase.from('ns_week_focus').insert(
        treeNodeIds.map(id => ({
          user_id:      user.id,
          week_start:   weekStart,
          source:       'tree',
          tree_node_id: id,
          is_complete:  false,
          position:     0,
        })),
      )
      if (error) throw error
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['ns_week_focus', input.weekStart] })
    },
  })
}

/** One item to add via the Tasks section's "add from tree/inbox/month" flow
 *  (TaskSourceForm). Exactly one of the three should be set: `taskId` to
 *  reuse an already-materialized task directly (Week's "from month" pull,
 *  when the month task is itself already linked); `source`+ref to
 *  find-or-create a task for a tree node / inbox item; or `title` as the
 *  last-resort copy fallback (a plain, never-linked month task with no
 *  task_id of its own). */
export interface WeekTaskLinkItem {
  taskId?:      string
  source?:      'tree' | 'inbox'
  treeNodeId?:  string
  inboxItemId?: string
  title?:       string
}

/** Bulk-linked insert — used by the Tasks section's "add from tree/inbox"
 *  flow (and Week's "from month" pull). Unlike the old copy-based version,
 *  these reference a real ns_tasks entity via task_id rather than copying
 *  title text: `source` on the row itself still stays 'standalone' (that's
 *  what keeps it classified under Tasks rather than Goals — the split is
 *  computed purely from `source`), while task_id carries the live link so
 *  title resolution, completion propagation, and inbox-state bookkeeping
 *  all route through the shared task. One round trip per item — each may
 *  need its own find-or-create lookup, so this can't be a single bulk
 *  insert the way the old title-only version was. */
export function useAddWeekTasksLinked() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ weekStart, items }: { weekStart: string; items: WeekTaskLinkItem[] }) => {
      if (!user) throw new Error('Not authenticated')
      for (const item of items) {
        let taskId = item.taskId ?? null
        // Direct taskId passes (Week's "from month" pull) only ever carry a
        // not-yet-complete month task (TaskSourceForm's monthTasks list is
        // pre-filtered to !isComplete) — false is correct there. A
        // find-or-create reuse can surface an already-complete task though,
        // so its real completion has to be threaded through explicitly
        // rather than assumed, or the invariant in applyTaskCompletion's
        // doc comment breaks until the next explicit toggle.
        let isComplete = false
        if (!taskId && item.source === 'tree' && item.treeNodeId) {
          const found = await findOrCreateTaskForRef(user.id, { source: 'tree', treeNodeId: item.treeNodeId })
          taskId = found.taskId; isComplete = found.isComplete
        } else if (!taskId && item.source === 'inbox' && item.inboxItemId) {
          const found = await findOrCreateTaskForRef(user.id, { source: 'inbox', inboxItemId: item.inboxItemId })
          taskId = found.taskId; isComplete = found.isComplete
        }
        const { error } = await supabase.from('ns_week_focus').insert({
          user_id:    user.id,
          week_start: weekStart,
          source:     'standalone',
          task_id:    taskId,
          title:      taskId ? null : (item.title ?? null),
          is_complete: taskId ? isComplete : false,
          position:    0,
        })
        if (error) throw error
      }
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['ns_week_focus', input.weekStart] })
      qc.invalidateQueries({ queryKey: ['ns_tasks'] })
      qc.invalidateQueries({ queryKey: ['ns_inbox'] })
    },
  })
}

export function useToggleWeekFocus() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id:         string
      weekStart:  string
      isComplete: boolean
      source:     FocusSource
      treeNodeId: string | null
      /** Non-null = task-linked (this session's fix) — routes through the
       *  same task-completion mirror day items use, so the tree node (when
       *  the underlying task is tree-sourced) and every other occurrence of
       *  the same task reflect the change too. */
      taskId?:    string | null
    }) => {
      if (!user) throw new Error('Not authenticated')

      if (params.taskId) {
        await applyTaskCompletion(user.id, params.taskId, params.isComplete)
        return params.weekStart
      }

      const { error } = await supabase
        .from('ns_week_focus')
        .update({ is_complete: params.isComplete, updated_at: new Date().toISOString() })
        .eq('id', params.id)
        .eq('user_id', user.id)
      if (error) throw error
      // Two-table rule: mirrors day-item toggle semantics — completing sets
      // the node complete, un-completing reverts to in_progress (never
      // not_started, which would erase the node's earlier progress).
      if (params.source === 'tree' && params.treeNodeId) {
        const { error: te } = await supabase
          .from('ns_tree_nodes')
          .update({
            status:     params.isComplete ? 'complete' : 'in_progress',
            updated_at: new Date().toISOString(),
          })
          .eq('id', params.treeNodeId)
          .eq('user_id', user.id)
        if (te) throw te
      }
      return params.weekStart
    },
    onSuccess: (weekStart, params) => {
      qc.invalidateQueries({ queryKey: ['ns_week_focus', weekStart] })
      qc.invalidateQueries({ queryKey: ['ns_tree_nodes'] })
      if (params.taskId) invalidateTaskLinkedQueries(qc)
    },
  })
}

export function useDeleteWeekFocus() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, weekStart, source, inboxItemId, taskId }: {
      id:           string
      weekStart:    string
      source?:      FocusSource
      inboxItemId?: string | null
      /** Non-null = task-linked — a materialized row's own inboxItemId is
       *  null, so the plain revert below can't fire for it; this is the
       *  task-scoped equivalent (maybeRevertTaskInboxState). */
      taskId?:      string | null
    }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_week_focus')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      if (error) throw error
      if (source === 'inbox' && inboxItemId) {
        await maybeRevertInboxItemState(user.id, inboxItemId)
      } else if (taskId) {
        await maybeRevertTaskInboxState(user.id, taskId)
      }
      return weekStart
    },
    onSuccess: (weekStart) => {
      qc.invalidateQueries({ queryKey: ['ns_week_focus', weekStart] })
      qc.invalidateQueries({ queryKey: ['ns_inbox'] })
    },
  })
}
