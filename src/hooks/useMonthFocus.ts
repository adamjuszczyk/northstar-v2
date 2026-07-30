import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useAuth } from './useAuth'
import { maybeRevertInboxItemState } from './useInboxItems'
import {
  applyTaskCompletion, findOrCreateTaskForRef, maybeRevertTaskInboxState,
  invalidateTaskLinkedQueries,
} from './useTasks'
import type { FocusSource } from './useWeekFocus'

export interface MonthFocusItem {
  id:          string
  monthStart:  string
  source:      FocusSource
  title:       string | null
  treeNodeId:  string | null
  inboxItemId: string | null
  habitId:     string | null
  /** Non-null = linked to a shared ns_tasks entity rather than a copied
   *  title (this session's TaskSourceForm fix) — see WeekFocusItem.taskId. */
  taskId:      string | null
  isComplete:  boolean
  position:    number
}

function fromRow(r: Record<string, unknown>): MonthFocusItem {
  return {
    id:          r.id            as string,
    monthStart:  r.month_start   as string,
    source:      r.source        as FocusSource,
    title:       r.title         as string | null,
    treeNodeId:  r.tree_node_id  as string | null,
    inboxItemId: r.inbox_item_id as string | null,
    habitId:     (r.habit_id as string | null) ?? null,
    taskId:      (r.task_id  as string | null) ?? null,
    isComplete:  r.is_complete   as boolean,
    position:    r.position      as number,
  }
}

export function useMonthFocus(monthStart: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['ns_month_focus', monthStart],
    queryFn: async (): Promise<MonthFocusItem[]> => {
      if (!navigator.onLine) {
        const cached = await db.monthFocus
          .where('userId').equals(user!.id)
          .filter(r => r.monthStart === monthStart)
          .sortBy('position')
        return cached.map(r => ({
          id:          r.id,
          monthStart:  r.monthStart,
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
        .from('ns_month_focus')
        .select('*')
        .eq('user_id', user!.id)
        .eq('month_start', monthStart)
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
    enabled: !!user && !!monthStart,
  })
}

export interface CreateMonthFocusInput {
  monthStart:  string
  source:      FocusSource
  title?:      string
  treeNodeId?: string
}

export function useCreateMonthFocus() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateMonthFocusInput) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('ns_month_focus').insert({
        user_id:      user.id,
        month_start:  input.monthStart,
        source:       input.source,
        title:        input.title      ?? null,
        tree_node_id: input.treeNodeId ?? null,
        is_complete:  false,
        position:     0,
      })
      if (error) throw error
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['ns_month_focus', input.monthStart] })
    },
  })
}

/** Bulk insert — one row per selected tree node, single round trip. */
export function useCreateMonthFocusMany() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ monthStart, treeNodeIds }: { monthStart: string; treeNodeIds: string[] }) => {
      if (!user) throw new Error('Not authenticated')
      if (treeNodeIds.length === 0) return
      const { error } = await supabase.from('ns_month_focus').insert(
        treeNodeIds.map(id => ({
          user_id:      user.id,
          month_start:  monthStart,
          source:       'tree',
          tree_node_id: id,
          is_complete:  false,
          position:     0,
        })),
      )
      if (error) throw error
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['ns_month_focus', input.monthStart] })
    },
  })
}

/** One item to add via the Tasks section's "add from tree/inbox" flow —
 *  see WeekTaskLinkItem (useWeekFocus.ts) for the exact same shape/reasoning. */
export interface MonthTaskLinkItem {
  taskId?:      string
  source?:      'tree' | 'inbox'
  treeNodeId?:  string
  inboxItemId?: string
  title?:       string
}

/** Bulk-linked insert — month equivalent of useAddWeekTasksLinked. */
export function useAddMonthTasksLinked() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ monthStart, items }: { monthStart: string; items: MonthTaskLinkItem[] }) => {
      if (!user) throw new Error('Not authenticated')
      for (const item of items) {
        let taskId = item.taskId ?? null
        // See useAddWeekTasksLinked's identical comment — a find-or-create
        // reuse can surface an already-complete task, so its real
        // completion has to be threaded through rather than assumed.
        let isComplete = false
        if (!taskId && item.source === 'tree' && item.treeNodeId) {
          const found = await findOrCreateTaskForRef(user.id, { source: 'tree', treeNodeId: item.treeNodeId })
          taskId = found.taskId; isComplete = found.isComplete
        } else if (!taskId && item.source === 'inbox' && item.inboxItemId) {
          const found = await findOrCreateTaskForRef(user.id, { source: 'inbox', inboxItemId: item.inboxItemId })
          taskId = found.taskId; isComplete = found.isComplete
        }
        const { error } = await supabase.from('ns_month_focus').insert({
          user_id:     user.id,
          month_start: monthStart,
          source:      'standalone',
          task_id:     taskId,
          title:       taskId ? null : (item.title ?? null),
          is_complete: taskId ? isComplete : false,
          position:    0,
        })
        if (error) throw error
      }
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['ns_month_focus', input.monthStart] })
      qc.invalidateQueries({ queryKey: ['ns_tasks'] })
      qc.invalidateQueries({ queryKey: ['ns_inbox'] })
    },
  })
}

export function useToggleMonthFocus() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id:         string
      monthStart: string
      isComplete: boolean
      source:     FocusSource
      treeNodeId: string | null
      /** Non-null = task-linked — see useToggleWeekFocus's taskId param. */
      taskId?:    string | null
    }) => {
      if (!user) throw new Error('Not authenticated')

      if (params.taskId) {
        await applyTaskCompletion(user.id, params.taskId, params.isComplete)
        return params.monthStart
      }

      const { error } = await supabase
        .from('ns_month_focus')
        .update({ is_complete: params.isComplete, updated_at: new Date().toISOString() })
        .eq('id', params.id)
        .eq('user_id', user.id)
      if (error) throw error
      // Two-table rule — mirrors day-item/week-focus toggle semantics.
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
      return params.monthStart
    },
    onSuccess: (monthStart, params) => {
      qc.invalidateQueries({ queryKey: ['ns_month_focus', monthStart] })
      qc.invalidateQueries({ queryKey: ['ns_tree_nodes'] })
      if (params.taskId) invalidateTaskLinkedQueries(qc)
    },
  })
}

export function useDeleteMonthFocus() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, monthStart, source, inboxItemId, taskId }: {
      id:           string
      monthStart:   string
      source?:      FocusSource
      inboxItemId?: string | null
      /** Non-null = task-linked — see useDeleteWeekFocus's taskId param. */
      taskId?:      string | null
    }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_month_focus')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      if (error) throw error
      if (source === 'inbox' && inboxItemId) {
        await maybeRevertInboxItemState(user.id, inboxItemId)
      } else if (taskId) {
        await maybeRevertTaskInboxState(user.id, taskId)
      }
      return monthStart
    },
    onSuccess: (monthStart) => {
      qc.invalidateQueries({ queryKey: ['ns_month_focus', monthStart] })
      qc.invalidateQueries({ queryKey: ['ns_inbox'] })
    },
  })
}
