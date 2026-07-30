import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { enqueue } from '../lib/syncQueue'
import { useAuth } from './useAuth'
import { maybeRevertInboxItemState } from './useInboxItems'
import {
  applyTaskCompletion, materializeTaskFromDayItem, maybeRevertTaskInboxState,
  invalidateTaskLinkedQueries,
} from './useTasks'
import type { MaterializableItem } from './useTasks'
import type { NodeType } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DayItemSource   = 'standalone' | 'tree' | 'inbox' | 'habit'
export type DayItemPriority = 'high' | 'medium' | 'low'

/** Raw row from ns_day_items — times normalised to HH:MM */
export interface RawDayItem {
  id:           string
  userId:       string
  date:         string
  source:       DayItemSource
  title:        string | null
  treeNodeId:   string | null
  inboxItemId:  string | null
  habitId:      string | null
  startTime:    string | null    // 'HH:MM' or null (floating)
  endTime:      string | null
  isComplete:   boolean
  priority:     DayItemPriority
  colour:       string | null    // cosmetic block colour hex, independent of priority
  position:     number
  counterCurrent: number         // x_per_day habit progress ("0 / 2") — 0 for non-counter items
  counterTarget:  number | null  // non-null marks this item as a counter item
  /** Set when this item was "pulled" from a week/month focus pool (Features 3-5)
   *  — links back to the exact ns_week_focus / ns_month_focus row it came from. */
  originWeekFocusId:  string | null
  originMonthFocusId: string | null
  /** Non-null = assigned inside this ns_blocks row. A day item inside a block
   *  keeps its own startTime — null means "somewhere inside this block",
   *  non-null means it also has its own slot within the block's range. */
  blockId:      string | null
  /** Non-null = this row is one occurrence of a shared ns_tasks entity
   *  (Task Lists & Split, SPEC §5.3). When set, title/treeNodeId/inboxItemId/
   *  habitId above are left null and ignored — resolve display/source
   *  through the task instead (TASKS.md §3.3 rule 1). */
  taskId:       string | null
  createdAt:    string
  updatedAt:    string
}

/** RawDayItem + resolved display fields */
export interface DayItem extends RawDayItem {
  displayTitle:   string
  treeNodeTitle:  string | null
  treeNodeType:   NodeType | null
  inboxContent:   string | null
  habitName:      string | null
  /** Batched from ns_task_steps for this item's task (0/0 when not task-
   *  linked, or task-linked with no steps yet). SPEC §5.3: a list is 2+
   *  steps — callers gate on stepsTotal >= 2, not on stepsTotal > 0. */
  stepsDone:      number
  stepsTotal:     number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const QK = (uid: string, date: string) => ['ns_day_items', uid, date] as const

function normTime(t: unknown): string | null {
  return typeof t === 'string' ? t.slice(0, 5) : null
}

function normPriority(p: unknown): DayItemPriority {
  if (p === 'high' || p === 'low') return p
  return 'medium'
}

function row2raw(r: Record<string, unknown>): RawDayItem {
  return {
    id:          r.id            as string,
    userId:      r.user_id       as string,
    date:        r.date          as string,
    source:      r.source        as DayItemSource,
    title:       r.title         as string | null,
    treeNodeId:  r.tree_node_id  as string | null,
    inboxItemId: r.inbox_item_id as string | null,
    habitId:     (r.habit_id as string | null) ?? null,
    startTime:   normTime(r.start_time),
    endTime:     normTime(r.end_time),
    isComplete:  r.is_complete   as boolean,
    priority:    normPriority(r.priority),
    colour:      (r.colour as string | null) ?? null,
    position:    r.position      as number,
    counterCurrent: (r.counter_current as number | null) ?? 0,
    counterTarget:  (r.counter_target as number | null) ?? null,
    originWeekFocusId:  (r.origin_week_focus_id as string | null) ?? null,
    originMonthFocusId: (r.origin_month_focus_id as string | null) ?? null,
    blockId:     (r.block_id as string | null) ?? null,
    taskId:      (r.task_id  as string | null) ?? null,
    createdAt:   r.created_at    as string,
    updatedAt:   r.updated_at    as string,
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useDayItems(date: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? QK(user.id, date) : ['ns_day_items', 'none', date],
    queryFn: async (): Promise<RawDayItem[]> => {
      if (!user) return []
      // Offline fallback: serve from Dexie
      if (!navigator.onLine) {
        const cached = await db.dayItems
          .where('[userId+date]').equals([user.id, date])
          .sortBy('position')
          .catch(() =>
            db.dayItems.where('userId').equals(user.id).filter(r => r.date === date).sortBy('position')
          )
        return cached.map(r => ({
          id:          r.id,
          userId:      r.userId,
          date:        r.date,
          source:      r.source as RawDayItem['source'],
          title:       r.title,
          treeNodeId:  r.treeNodeId,
          inboxItemId: r.inboxItemId,
          habitId:     r.habitId ?? null,
          startTime:   r.startTime,
          endTime:     r.endTime,
          isComplete:  r.isComplete,
          priority:    r.priority as RawDayItem['priority'],
          colour:      r.colour ?? null,
          position:    r.position,
          counterCurrent: r.counterCurrent ?? 0,
          counterTarget:  r.counterTarget ?? null,
          originWeekFocusId:  r.originWeekFocusId  ?? null,
          originMonthFocusId: r.originMonthFocusId ?? null,
          blockId:     r.blockId ?? null,
          taskId:      r.taskId  ?? null,
          createdAt:   r.createdAt,
          updatedAt:   r.updatedAt,
        }))
      }
      const { data, error } = await supabase
        .from('ns_day_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', date)
        .order('start_time',  { ascending: true, nullsFirst: false })
        .order('position',    { ascending: true })
        .order('created_at',  { ascending: true })
      if (error) throw error
      return (data ?? []).map(r => row2raw(r as Record<string, unknown>))
    },
    networkMode: 'always',
    enabled:     !!user && !!date,
    staleTime:   5 * 60 * 1000,
    gcTime:      60 * 60 * 1000,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export interface CreateDayItemInput {
  date:         string
  source:       DayItemSource
  title?:       string | null
  treeNodeId?:  string | null
  inboxItemId?: string | null
  habitId?:     string | null
  startTime?:   string | null
  endTime?:     string | null
  priority?:    DayItemPriority
  colour?:      string | null
  blockId?:     string | null
}

export function useCreateDayItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateDayItemInput) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_day_items')
        .insert({
          user_id:       user.id,
          date:          input.date,
          source:        input.source,
          title:         input.title         ?? null,
          tree_node_id:  input.treeNodeId    ?? null,
          inbox_item_id: input.inboxItemId   ?? null,
          habit_id:      input.habitId       ?? null,
          start_time:    input.startTime     ?? null,
          end_time:      input.endTime       ?? null,
          priority:      input.priority      ?? 'medium',
          colour:        input.colour        ?? null,
          block_id:      input.blockId       ?? null,
          is_complete:   false,
          position:      0,
        })
      if (error) throw error
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['ns_day_items'] })
      if (input.inboxItemId) {
        qc.invalidateQueries({ queryKey: ['ns_inbox'] })
      }
    },
  })
}

/** Bulk insert — one row per input, single round trip. Used by multi-select
 *  pickers (tree/habit tabs) so N selections create N day items in one call. */
export function useCreateDayItems() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (inputs: CreateDayItemInput[]) => {
      if (!user) throw new Error('Not authenticated')
      if (inputs.length === 0) return
      const { error } = await supabase
        .from('ns_day_items')
        .insert(inputs.map(input => ({
          user_id:       user.id,
          date:          input.date,
          source:        input.source,
          title:         input.title         ?? null,
          tree_node_id:  input.treeNodeId    ?? null,
          inbox_item_id: input.inboxItemId   ?? null,
          habit_id:      input.habitId       ?? null,
          start_time:    input.startTime     ?? null,
          end_time:      input.endTime       ?? null,
          priority:      input.priority      ?? 'medium',
          colour:        input.colour        ?? null,
          block_id:      input.blockId       ?? null,
          is_complete:   false,
          position:      0,
        })))
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_day_items'] }),
  })
}

export function useAddInboxToDay() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ inboxItemId, date, priority, colour, blockId }: {
      inboxItemId: string
      date: string
      priority?: DayItemPriority
      colour?:   string | null
      blockId?:  string | null
    }) => {
      if (!user) throw new Error('Not authenticated')
      const { error: e1 } = await supabase
        .from('ns_day_items')
        .insert({
          user_id: user.id, date,
          source: 'inbox', inbox_item_id: inboxItemId,
          is_complete: false, position: 0,
          priority: priority ?? 'medium',
          colour: colour ?? null,
          block_id: blockId ?? null,
        })
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from('ns_inbox_items')
        .update({ state: 'scheduled', updated_at: new Date().toISOString() })
        .eq('id', inboxItemId).eq('user_id', user.id)
      if (e2) throw e2
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns_day_items'] })
      qc.invalidateQueries({ queryKey: ['ns_inbox'] })
    },
  })
}

/** Bulk version of useAddInboxToDay — one insert covering every selected
 *  inbox item, plus a single `in()` update marking all of them scheduled. */
export function useAddInboxItemsToDay() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ inboxItemIds, date, priority, colour, blockId }: {
      inboxItemIds: string[]
      date: string
      priority?: DayItemPriority
      colour?:   string | null
      blockId?:  string | null
    }) => {
      if (!user) throw new Error('Not authenticated')
      if (inboxItemIds.length === 0) return
      const { error: e1 } = await supabase
        .from('ns_day_items')
        .insert(inboxItemIds.map(id => ({
          user_id: user.id, date,
          source: 'inbox', inbox_item_id: id,
          is_complete: false, position: 0,
          priority: priority ?? 'medium',
          colour: colour ?? null,
          block_id: blockId ?? null,
        })))
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from('ns_inbox_items')
        .update({ state: 'scheduled', updated_at: new Date().toISOString() })
        .in('id', inboxItemIds)
        .eq('user_id', user.id)
      if (e2) throw e2
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns_day_items'] })
      qc.invalidateQueries({ queryKey: ['ns_inbox'] })
    },
  })
}

// ── Pull-from-pool (Features 3-5) ───────────────────────────────────────────

export interface PullWeekFocusInput {
  weekFocusId:  string
  date:         string
  source:       DayItemSource
  title?:       string | null
  treeNodeId?:  string | null
  inboxItemId?: string | null
  habitId?:     string | null
  /** Non-null = the focus item is task-linked (this session's TaskSourceForm
   *  fix) — the pulled day item references the same task_id instead of
   *  copying its (null, for a linked row) identity fields, so it's the same
   *  shared task appearing on both the week list and today, not a
   *  disconnected copy. */
  taskId?:      string | null
  /** The focus item's own isComplete — for a task-linked row this already
   *  mirrors the task's true completion (the invariant applyTaskCompletion
   *  maintains), so the pulled occurrence must carry it over rather than
   *  hardcoding false, or a pull of an already-complete task would start
   *  "not done" until its next explicit toggle. Ignored when taskId is
   *  unset — a plain pull always creates a fresh, unstarted occurrence. */
  isComplete?:  boolean
  /** Optional fields for parity with the other "add to day" tabs (Phase 6's
   *  Week/Month tab, DayItemForm.tsx) — all default to the same values this
   *  mutation always used before (floating, medium priority, no colour, no
   *  block), so WeekView/MonthView's existing "Pull to today" callers are
   *  unaffected by omitting them. */
  startTime?: string | null
  endTime?:   string | null
  priority?:  DayItemPriority
  colour?:    string | null
  blockId?:   string | null
}

/** Pulls a ns_week_focus item into a specific day — creates a ns_day_items
 *  row matching the focus item's source, linked back via origin_week_focus_id
 *  so the pool panel can compute "available vs pulled" uniformly across every
 *  source, including standalone tasks that have no other reference id. */
export function usePullWeekFocusToDay() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: PullWeekFocusInput) => {
      if (!user) throw new Error('Not authenticated')
      const { error: e1 } = await supabase.from('ns_day_items').insert({
        user_id:       user.id,
        date:          input.date,
        source:        input.source,
        title:         input.taskId ? null : (input.title         ?? null),
        tree_node_id:  input.taskId ? null : (input.treeNodeId    ?? null),
        inbox_item_id: input.taskId ? null : (input.inboxItemId   ?? null),
        habit_id:      input.taskId ? null : (input.habitId       ?? null),
        task_id:       input.taskId ?? null,
        origin_week_focus_id: input.weekFocusId,
        is_complete:   input.taskId ? (input.isComplete ?? false) : false,
        position:      0,
        start_time:    input.startTime ?? null,
        end_time:      input.endTime   ?? null,
        priority:      input.priority  ?? 'medium',
        colour:        input.colour    ?? null,
        block_id:      input.blockId   ?? null,
      })
      if (e1) throw e1
      if (!input.taskId && input.source === 'inbox' && input.inboxItemId) {
        const { error: e2 } = await supabase
          .from('ns_inbox_items')
          .update({ state: 'scheduled', updated_at: new Date().toISOString() })
          .eq('id', input.inboxItemId).eq('user_id', user.id)
        if (e2) throw e2
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns_day_items'] })
      qc.invalidateQueries({ queryKey: ['ns_day_items_range'] })
      qc.invalidateQueries({ queryKey: ['ns_inbox'] })
    },
  })
}

export interface PullMonthFocusInput {
  monthFocusId: string
  date:         string
  source:       DayItemSource
  title?:       string | null
  treeNodeId?:  string | null
  inboxItemId?: string | null
  habitId?:     string | null
  /** Non-null = task-linked — see PullWeekFocusInput.taskId. */
  taskId?:      string | null
  /** See PullWeekFocusInput.isComplete. */
  isComplete?:  boolean
  /** See PullWeekFocusInput's identical optional fields. */
  startTime?: string | null
  endTime?:   string | null
  priority?:  DayItemPriority
  colour?:    string | null
  blockId?:   string | null
}

/** Month equivalent of usePullWeekFocusToDay — used by the "Tasks this
 *  month" pool's own pull-to-today action (Feature 5). */
export function usePullMonthFocusToDay() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: PullMonthFocusInput) => {
      if (!user) throw new Error('Not authenticated')
      const { error: e1 } = await supabase.from('ns_day_items').insert({
        user_id:       user.id,
        date:          input.date,
        source:        input.source,
        title:         input.taskId ? null : (input.title         ?? null),
        tree_node_id:  input.taskId ? null : (input.treeNodeId    ?? null),
        inbox_item_id: input.taskId ? null : (input.inboxItemId   ?? null),
        habit_id:      input.taskId ? null : (input.habitId       ?? null),
        task_id:       input.taskId ?? null,
        origin_month_focus_id: input.monthFocusId,
        is_complete:   input.taskId ? (input.isComplete ?? false) : false,
        position:      0,
        start_time:    input.startTime ?? null,
        end_time:      input.endTime   ?? null,
        priority:      input.priority  ?? 'medium',
        colour:        input.colour    ?? null,
        block_id:      input.blockId   ?? null,
      })
      if (e1) throw e1
      if (!input.taskId && input.source === 'inbox' && input.inboxItemId) {
        const { error: e2 } = await supabase
          .from('ns_inbox_items')
          .update({ state: 'scheduled', updated_at: new Date().toISOString() })
          .eq('id', input.inboxItemId).eq('user_id', user.id)
        if (e2) throw e2
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns_day_items'] })
      qc.invalidateQueries({ queryKey: ['ns_day_items_range'] })
      qc.invalidateQueries({ queryKey: ['ns_inbox'] })
    },
  })
}

export function useToggleDayItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, isComplete, treeNodeId, habitId, taskId }: {
      id:          string
      isComplete:  boolean
      treeNodeId:  string | null
      habitId?:    string | null
      /** Non-null = this occurrence is task-linked. Routes through the
       *  task-completion mirror (applyTaskCompletion) instead of the plain
       *  per-row update, so every other occurrence of the same task updates
       *  together. Online-only — task writes aren't part of the offline
       *  sync-queue surface (TASKS.md §3.9), so offline toggles of a
       *  task-linked item still fall through to the plain per-row path
       *  below and pick up the cross-table mirror next time it syncs. */
      taskId?:     string | null
    }) => {
      if (!user) throw new Error('Not authenticated')
      const now = new Date().toISOString()

      if (navigator.onLine && taskId) {
        await applyTaskCompletion(user.id, taskId, isComplete)
        return
      }

      if (!navigator.onLine) {
        // Offline path: update Dexie + enqueue
        await db.dayItems.where('id').equals(id).modify({ isComplete, updatedAt: now })
        await enqueue('ns_day_items', 'update', {
          id, is_complete: isComplete, updated_at: now,
        }, user.id)
        if (treeNodeId) {
          // Un-checking reverts to in_progress, not not_started — completing
          // a day item shouldn't be able to erase a node's earlier progress.
          const status = isComplete ? 'complete' : 'in_progress'
          await db.treeNodes.where('id').equals(treeNodeId).modify({ status, updatedAt: now })
          await enqueue('ns_tree_nodes', 'update', {
            id: treeNodeId, status, updated_at: now,
          }, user.id)
        }
        // Completing (not un-completing) a habit day item logs an entry —
        // a permanent record, so unchecking never removes it.
        if (habitId && isComplete) {
          await enqueue('ns_habit_entries', 'insert', {
            id: crypto.randomUUID(), user_id: user.id, habit_id: habitId,
            logged_at: now, note: null, source: 'day_view',
          }, user.id)
        }
        return
      }

      const { error: e1 } = await supabase
        .from('ns_day_items')
        .update({ is_complete: isComplete, updated_at: now })
        .eq('id', id).eq('user_id', user.id)
      if (e1) throw e1
      if (treeNodeId) {
        const { error: e2 } = await supabase
          .from('ns_tree_nodes')
          .update({ status: isComplete ? 'complete' : 'in_progress', updated_at: now })
          .eq('id', treeNodeId).eq('user_id', user.id)
        if (e2) throw e2
      }
      if (habitId && isComplete) {
        const { error: e3 } = await supabase
          .from('ns_habit_entries')
          .insert({ user_id: user.id, habit_id: habitId, logged_at: now, source: 'day_view' })
        if (e3) throw e3
      }
    },
    networkMode: 'always',
    onSuccess: (_d, { taskId }) => {
      qc.invalidateQueries({ queryKey: ['ns_day_items'] })
      qc.invalidateQueries({ queryKey: ['ns_tree_nodes'] })
      qc.invalidateQueries({ queryKey: ['ns_habit_entries'] })
      if (taskId) invalidateTaskLinkedQueries(qc)
    },
  })
}

/** Tap-to-increment for x_per_day habit counter items. Reaching the target
 *  also marks the day item complete. Every tap logs one habit entry. */
export function useIncrementDayItemCounter() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, habitId, current, target, taskId }: {
      id:       string
      habitId:  string
      current:  number
      target:   number
      /** Non-null = this counter item is task-linked (materialized via a
       *  step add, or split — habits are no longer excluded from either,
       *  SPEC §4.4). Reaching target still has to complete the occurrence,
       *  but through applyTaskCompletion rather than a direct is_complete
       *  write here — otherwise this row could disagree with its task and
       *  every other occurrence the moment it completes (TASKS.md §3.3
       *  rule 5's invariant). */
      taskId?:  string | null
    }) => {
      if (!user) throw new Error('Not authenticated')
      const now  = new Date().toISOString()
      const next = current + 1
      const reachedTarget = next >= target

      const { error: e1 } = await supabase
        .from('ns_day_items')
        .update({
          counter_current: next,
          updated_at: now,
          ...(taskId ? {} : { is_complete: reachedTarget }),
        })
        .eq('id', id).eq('user_id', user.id)
      if (e1) throw e1

      const { error: e2 } = await supabase
        .from('ns_habit_entries')
        .insert({ user_id: user.id, habit_id: habitId, logged_at: now, source: 'day_view' })
      if (e2) throw e2

      if (taskId && reachedTarget) {
        // This tap already logged its own entry above — applyTaskCompletion's
        // own habit-logging would otherwise double it for this transition.
        await applyTaskCompletion(user.id, taskId, true, { skipHabitLog: true })
      }
    },
    networkMode: 'always',
    onSuccess: (_d, { taskId }) => {
      qc.invalidateQueries({ queryKey: ['ns_day_items'] })
      qc.invalidateQueries({ queryKey: ['ns_habit_entries'] })
      if (taskId) invalidateTaskLinkedQueries(qc)
    },
  })
}

export interface UpdateDayItemInput {
  id:         string
  title?:     string | null
  startTime?: string | null
  endTime?:   string | null
  priority?:  DayItemPriority
  colour?:    string | null
  blockId?:   string | null
}

export function useUpdateDayItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateDayItemInput) => {
      if (!user) throw new Error('Not authenticated')
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.title     !== undefined) patch.title      = input.title
      if (input.startTime !== undefined) patch.start_time = input.startTime
      if (input.endTime   !== undefined) patch.end_time   = input.endTime
      if (input.priority  !== undefined) patch.priority   = input.priority
      if (input.colour    !== undefined) patch.colour     = input.colour
      if (input.blockId   !== undefined) patch.block_id   = input.blockId
      const { error } = await supabase
        .from('ns_day_items')
        .update(patch)
        .eq('id', input.id)
        .eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_day_items'] }),
  })
}

export function useDeleteDayItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, source, inboxItemId, taskId }: {
      id:           string
      source?:      DayItemSource
      inboxItemId?: string | null
      /** Non-null = this occurrence was task-linked. A materialized
       *  occurrence's own inboxItemId is null (identity resolves through
       *  the task), so the plain inboxItemId revert below can't fire for
       *  it — this is the task-scoped equivalent. */
      taskId?:      string | null
    }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_day_items')
        .delete()
        .eq('id', id).eq('user_id', user.id)
      if (error) throw error
      if (source === 'inbox' && inboxItemId) {
        await maybeRevertInboxItemState(user.id, inboxItemId)
      } else if (taskId) {
        await maybeRevertTaskInboxState(user.id, taskId)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns_day_items'] })
      qc.invalidateQueries({ queryKey: ['ns_inbox'] })
    },
  })
}

// ── Task Lists & Split (SPEC §5.3) ──────────────────────────────────────────

export interface SplitDayItemInput {
  date:         string
  existingItem: MaterializableItem & { id: string; taskId: string | null }
  startTime?:   string | null
  endTime?:     string | null
  priority?:    DayItemPriority
  colour?:      string | null
  blockId?:     string | null
}

/** Schedules the same task/list into another time slot the same day — a new
 *  lightweight occurrence referencing the shared task id, never a duplicate
 *  (SPEC §5.3). Materializes the source item into a task first if it isn't
 *  one already (the "first split" trigger, TASKS.md §3.3 rule 1/2). */
export function useSplitDayItemToNewSlot() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SplitDayItemInput) => {
      if (!user) throw new Error('Not authenticated')
      const taskId = input.existingItem.taskId
        ?? await materializeTaskFromDayItem(user.id, input.existingItem)

      const { error } = await supabase.from('ns_day_items').insert({
        user_id:      user.id,
        date:         input.date,
        source:       input.existingItem.source,
        task_id:      taskId,
        title: null, tree_node_id: null, inbox_item_id: null, habit_id: null,
        start_time:   input.startTime ?? null,
        end_time:     input.endTime   ?? null,
        priority:     input.priority  ?? 'medium',
        colour:       input.colour    ?? null,
        block_id:     input.blockId   ?? null,
        // Mirrors the task's current completion (TASKS.md §3.3 rule 5's
        // invariant) rather than hardcoding false — existingItem.isComplete
        // already equals the task's true is_complete, whether this is the
        // first split (materializeTaskFromDayItem just carried it over) or
        // a later one (the invariant already held on the source occurrence).
        is_complete:  input.existingItem.isComplete,
        position:     0,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns_day_items'] })
      qc.invalidateQueries({ queryKey: ['ns_day_items_range'] })
      qc.invalidateQueries({ queryKey: ['ns_tasks'] })
    },
  })
}

// ── Time helpers (shared with components) ─────────────────────────────────────

export const PXH    = 64   // pixels per hour
export const TOPPAD = 20   // inner container top padding

export function timeToDecimal(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h + m / 60
}

export function timeToY(decimal: number): number {
  return TOPPAD + decimal * PXH
}

export function timeStrToY(t: string): number {
  return timeToY(timeToDecimal(t))
}

export function nowDecimal(): number {
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60
}

export function decimalToTimeStr(decimal: number): string {
  const h = Math.floor(decimal)
  const m = Math.round((decimal - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
