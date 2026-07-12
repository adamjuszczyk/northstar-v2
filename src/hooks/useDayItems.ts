import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { enqueue } from '../lib/syncQueue'
import { useAuth } from './useAuth'
import { maybeRevertInboxItemState } from './useInboxItems'
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

export function useAddInboxToDay() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ inboxItemId, date, priority, colour }: {
      inboxItemId: string
      date: string
      priority?: DayItemPriority
      colour?:   string | null
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

export function useToggleDayItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, isComplete, treeNodeId, habitId }: {
      id:          string
      isComplete:  boolean
      treeNodeId:  string | null
      habitId?:    string | null
    }) => {
      if (!user) throw new Error('Not authenticated')
      const now = new Date().toISOString()

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns_day_items'] })
      qc.invalidateQueries({ queryKey: ['ns_tree_nodes'] })
      qc.invalidateQueries({ queryKey: ['ns_habit_entries'] })
    },
  })
}

/** Tap-to-increment for x_per_day habit counter items. Reaching the target
 *  also marks the day item complete. Every tap logs one habit entry. */
export function useIncrementDayItemCounter() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, habitId, current, target }: {
      id:       string
      habitId:  string
      current:  number
      target:   number
    }) => {
      if (!user) throw new Error('Not authenticated')
      const now  = new Date().toISOString()
      const next = current + 1

      const { error: e1 } = await supabase
        .from('ns_day_items')
        .update({ counter_current: next, is_complete: next >= target, updated_at: now })
        .eq('id', id).eq('user_id', user.id)
      if (e1) throw e1

      const { error: e2 } = await supabase
        .from('ns_habit_entries')
        .insert({ user_id: user.id, habit_id: habitId, logged_at: now, source: 'day_view' })
      if (e2) throw e2
    },
    networkMode: 'always',
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns_day_items'] })
      qc.invalidateQueries({ queryKey: ['ns_habit_entries'] })
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
    mutationFn: async ({ id, source, inboxItemId }: {
      id:           string
      source?:      DayItemSource
      inboxItemId?: string | null
    }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_day_items')
        .delete()
        .eq('id', id).eq('user_id', user.id)
      if (error) throw error
      if (source === 'inbox' && inboxItemId) {
        await maybeRevertInboxItemState(user.id, inboxItemId)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns_day_items'] })
      qc.invalidateQueries({ queryKey: ['ns_inbox'] })
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
