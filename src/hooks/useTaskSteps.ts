import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useAuth } from './useAuth'
import {
  applyTaskCompletion, materializeTaskFromDayItem, findOrCreateTaskForRef, invalidateTaskLinkedQueries,
} from './useTasks'
import type { MaterializableItem, TaskRef } from './useTasks'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskStep {
  id:        string
  userId:    string
  taskId:    string
  content:   string
  position:  number
  isDone:    boolean
  doneAt:    string | null
  createdAt: string
  updatedAt: string
}

function row2step(r: Record<string, unknown>): TaskStep {
  return {
    id:        r.id         as string,
    userId:    r.user_id    as string,
    taskId:    r.task_id    as string,
    content:   r.content    as string,
    position:  r.position   as number,
    isDone:    r.is_done    as boolean,
    doneAt:    (r.done_at as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

function tableMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? ''
  return code === '42P01' || code === 'PGRST205'
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useTaskSteps(taskId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['ns_task_steps', taskId],
    queryFn: async (): Promise<TaskStep[]> => {
      if (!user || !taskId) return []
      if (!navigator.onLine) {
        const cached = await db.taskSteps.where('taskId').equals(taskId).sortBy('position')
        return cached.map(r => ({
          id: r.id, userId: r.userId, taskId: r.taskId, content: r.content, position: r.position,
          isDone: r.isDone, doneAt: r.doneAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
        }))
      }
      const { data, error } = await supabase
        .from('ns_task_steps')
        .select('*')
        .eq('user_id', user.id)
        .eq('task_id', taskId)
        .order('position', { ascending: true })
      if (error) {
        if (tableMissing(error)) return []
        throw error
      }
      return (data ?? []).map(r => row2step(r as Record<string, unknown>))
    },
    enabled: !!user && !!taskId,
  })
}

export interface StepCount {
  done:  number
  total: number
}

/** Batched done/total step counts for a set of task ids — the "1/3" list
 *  badge (SPEC §5.3) and the completion-checkbox gate (2+ steps disables
 *  direct completion) both need this at every day-item/focus-row render
 *  site, so it's fetched once per view rather than once per card. A task
 *  with 0 or 1 steps isn't a "list" per SPEC (a plain task is a list with
 *  one hidden step) — callers gate on total >= 2, not on presence in this
 *  map. */
export function useTaskStepCounts(taskIds: (string | null | undefined)[]) {
  const { user } = useAuth()
  const key = Array.from(new Set(taskIds.filter((x): x is string => !!x))).sort()
  return useQuery({
    queryKey: ['ns_task_steps', 'counts', key],
    queryFn: async (): Promise<Map<string, StepCount>> => {
      const counts = new Map<string, StepCount>()
      if (!user || key.length === 0) return counts
      if (!navigator.onLine) {
        const cached = await db.taskSteps.where('taskId').anyOf(key).toArray()
        for (const s of cached) {
          const c = counts.get(s.taskId) ?? { done: 0, total: 0 }
          c.total += 1
          if (s.isDone) c.done += 1
          counts.set(s.taskId, c)
        }
        return counts
      }
      const { data, error } = await supabase
        .from('ns_task_steps')
        .select('task_id, is_done')
        .eq('user_id', user.id)
        .in('task_id', key)
      if (error) {
        if (tableMissing(error)) return counts
        throw error
      }
      for (const r of data ?? []) {
        const taskId = r.task_id as string
        const c = counts.get(taskId) ?? { done: 0, total: 0 }
        c.total += 1
        if (r.is_done) c.done += 1
        counts.set(taskId, c)
      }
      return counts
    },
    enabled: !!user && key.length > 0,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Recomputes and applies a task's completion from its current step set —
 *  all steps done (and at least one exists) → complete. Shared by every
 *  mutation below that changes step state, so the mirror onto occurrences
 *  (TASKS.md §3.3 rule 4/5) and tree propagation (A10) stay centralised in
 *  applyTaskCompletion rather than duplicated per call site. */
async function recomputeTaskCompletion(userId: string, taskId: string): Promise<void> {
  const { data, error } = await supabase
    .from('ns_task_steps')
    .select('is_done')
    .eq('user_id', userId)
    .eq('task_id', taskId)
  if (error) throw error
  const steps = data ?? []
  const allDone = steps.length > 0 && steps.every(s => s.is_done)
  await applyTaskCompletion(userId, taskId, allDone)
}

async function nextStepPosition(userId: string, taskId: string): Promise<number> {
  const { count } = await supabase
    .from('ns_task_steps')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('task_id', taskId)
  return count ?? 0
}

/** Appends a step to an already-materialized task. */
export function useAddTaskStep() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, content }: { taskId: string; content: string }) => {
      if (!user) throw new Error('Not authenticated')
      const position = await nextStepPosition(user.id, taskId)
      const { error } = await supabase.from('ns_task_steps').insert({
        user_id: user.id, task_id: taskId, content, position, is_done: false,
      })
      if (error) throw error
      // A freshly-added step is always undone — recompute in case the task
      // was previously complete (no steps, or all-done): new work means it
      // no longer is.
      await recomputeTaskCompletion(user.id, taskId)
    },
    onSuccess: (_d, { taskId }) => {
      // Broad prefix, not ['ns_task_steps', taskId] — also catches the
      // ['ns_task_steps', 'counts', ids] batched-count query (Part 2.5's
      // list badge / completion-gate), which TanStack's prefix-match
      // invalidation wouldn't reach otherwise (its second key segment is
      // 'counts', not this taskId).
      qc.invalidateQueries({ queryKey: ['ns_task_steps'] })
      invalidateTaskLinkedQueries(qc)
    },
  })
}

/** Adds the first step to a plain (not-yet-materialized) day item — the
 *  "first step added" materialization trigger (TASKS.md §3.3 rule 1).
 *  Creates the task, back-links task_id onto the day item, then inserts
 *  the step. */
export function useAddFirstStepToDayItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ item, content }: {
      item: MaterializableItem & { id: string }
      content: string
    }) => {
      if (!user) throw new Error('Not authenticated')
      const taskId = await materializeTaskFromDayItem(user.id, item)
      const { error } = await supabase.from('ns_task_steps').insert({
        user_id: user.id, task_id: taskId, content, position: 0, is_done: false,
      })
      if (error) throw error
      await recomputeTaskCompletion(user.id, taskId)
      return taskId
    },
    onSuccess: (taskId) => {
      // Broad prefix, not ['ns_task_steps', taskId] — also catches the
      // ['ns_task_steps', 'counts', ids] batched-count query (Part 2.5's
      // list badge / completion-gate), which TanStack's prefix-match
      // invalidation wouldn't reach otherwise (its second key segment is
      // 'counts', not this taskId).
      qc.invalidateQueries({ queryKey: ['ns_task_steps'] })
      invalidateTaskLinkedQueries(qc)
    },
  })
}

/** Adds the first step directly against a tree node / inbox item, with no
 *  day occurrence involved at all — the Tree/Inbox "create as a list"
 *  entry point (SPEC §5.3 "creatable everywhere... not only retroactively
 *  from Day view"). Reuses findOrCreateTaskForRef rather than
 *  materializeTaskFromDayItem, since there's no day-item row to update. */
export function useAddFirstStepToRef() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ref, content }: { ref: TaskRef; content: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { taskId } = await findOrCreateTaskForRef(user.id, ref)
      const position = await nextStepPosition(user.id, taskId)
      const { error } = await supabase.from('ns_task_steps').insert({
        user_id: user.id, task_id: taskId, content, position, is_done: false,
      })
      if (error) throw error
      await recomputeTaskCompletion(user.id, taskId)
      return taskId
    },
    onSuccess: (taskId) => {
      // Broad prefix, not ['ns_task_steps', taskId] — also catches the
      // ['ns_task_steps', 'counts', ids] batched-count query (Part 2.5's
      // list badge / completion-gate), which TanStack's prefix-match
      // invalidation wouldn't reach otherwise (its second key segment is
      // 'counts', not this taskId).
      qc.invalidateQueries({ queryKey: ['ns_task_steps'] })
      qc.invalidateQueries({ queryKey: ['ns_tasks', 'byRef'] })
      invalidateTaskLinkedQueries(qc)
    },
  })
}

export function useToggleTaskStep() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ stepId, taskId, isDone }: { stepId: string; taskId: string; isDone: boolean }) => {
      if (!user) throw new Error('Not authenticated')
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('ns_task_steps')
        .update({ is_done: isDone, done_at: isDone ? now : null, updated_at: now })
        .eq('id', stepId).eq('user_id', user.id)
      if (error) throw error
      await recomputeTaskCompletion(user.id, taskId)
    },
    onSuccess: (_d, { taskId }) => {
      // Broad prefix, not ['ns_task_steps', taskId] — also catches the
      // ['ns_task_steps', 'counts', ids] batched-count query (Part 2.5's
      // list badge / completion-gate), which TanStack's prefix-match
      // invalidation wouldn't reach otherwise (its second key segment is
      // 'counts', not this taskId).
      qc.invalidateQueries({ queryKey: ['ns_task_steps'] })
      invalidateTaskLinkedQueries(qc)
    },
  })
}

export function useDeleteTaskStep() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ stepId, taskId }: { stepId: string; taskId: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_task_steps')
        .delete()
        .eq('id', stepId).eq('user_id', user.id)
      if (error) throw error
      // Deleting the last not-done step can flip the remaining set to
      // all-done — recompute rather than assume nothing changed.
      await recomputeTaskCompletion(user.id, taskId)
    },
    onSuccess: (_d, { taskId }) => {
      // Broad prefix, not ['ns_task_steps', taskId] — also catches the
      // ['ns_task_steps', 'counts', ids] batched-count query (Part 2.5's
      // list badge / completion-gate), which TanStack's prefix-match
      // invalidation wouldn't reach otherwise (its second key segment is
      // 'counts', not this taskId).
      qc.invalidateQueries({ queryKey: ['ns_task_steps'] })
      invalidateTaskLinkedQueries(qc)
    },
  })
}

/** Renames a step's content — step management (SPEC §5.3: "steps can be
 *  renamed, deleted, and reordered... as easily as managing items anywhere
 *  else in the app"). Doesn't affect completion, so no recompute needed. */
export function useRenameTaskStep() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ stepId, content }: { stepId: string; taskId: string; content: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_task_steps')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', stepId).eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_task_steps'] }),
  })
}

/** Swaps a step's position with its immediate up/down neighbour — reorder
 *  (SPEC §5.3). Re-reads the current position order fresh rather than
 *  trusting the caller's cached list, so a reorder issued right after
 *  another change (add/delete) can't swap against a stale index. */
export function useReorderTaskStep() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, stepId, direction }: {
      taskId: string; stepId: string; direction: 'up' | 'down'
    }) => {
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('ns_task_steps')
        .select('id, position')
        .eq('user_id', user.id)
        .eq('task_id', taskId)
        .order('position', { ascending: true })
      if (error) throw error
      const steps = data ?? []
      const idx = steps.findIndex(s => s.id === stepId)
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (idx === -1 || swapIdx < 0 || swapIdx >= steps.length) return
      const a = steps[idx]
      const b = steps[swapIdx]
      const [e1, e2] = await Promise.all([
        supabase.from('ns_task_steps').update({ position: b.position }).eq('id', a.id).eq('user_id', user.id),
        supabase.from('ns_task_steps').update({ position: a.position }).eq('id', b.id).eq('user_id', user.id),
      ])
      if (e1.error) throw e1.error
      if (e2.error) throw e2.error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_task_steps'] }),
  })
}
