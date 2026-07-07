import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { enqueue } from '../lib/syncQueue'
import { useAuth } from './useAuth'
import type { NodeType } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DayItemSource   = 'standalone' | 'tree' | 'inbox'
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
  startTime:    string | null    // 'HH:MM' or null (floating)
  endTime:      string | null
  isComplete:   boolean
  priority:     DayItemPriority
  position:     number
  createdAt:    string
  updatedAt:    string
}

/** RawDayItem + resolved display fields */
export interface DayItem extends RawDayItem {
  displayTitle:   string
  treeNodeTitle:  string | null
  treeNodeType:   NodeType | null
  inboxContent:   string | null
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
    startTime:   normTime(r.start_time),
    endTime:     normTime(r.end_time),
    isComplete:  r.is_complete   as boolean,
    priority:    normPriority(r.priority),
    position:    r.position      as number,
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
          startTime:   r.startTime,
          endTime:     r.endTime,
          isComplete:  r.isComplete,
          priority:    r.priority as RawDayItem['priority'],
          position:    r.position,
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
  startTime?:   string | null
  endTime?:     string | null
  priority?:    DayItemPriority
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
          start_time:    input.startTime     ?? null,
          end_time:      input.endTime       ?? null,
          priority:      input.priority      ?? 'medium',
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
    mutationFn: async ({ inboxItemId, date, priority }: {
      inboxItemId: string
      date: string
      priority?: DayItemPriority
    }) => {
      if (!user) throw new Error('Not authenticated')
      const { error: e1 } = await supabase
        .from('ns_day_items')
        .insert({
          user_id: user.id, date,
          source: 'inbox', inbox_item_id: inboxItemId,
          is_complete: false, position: 0,
          priority: priority ?? 'medium',
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
    mutationFn: async ({ id, isComplete, treeNodeId }: {
      id:          string
      isComplete:  boolean
      treeNodeId:  string | null
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
    },
    networkMode: 'always',
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns_day_items'] })
      qc.invalidateQueries({ queryKey: ['ns_tree_nodes'] })
    },
  })
}

export interface UpdateDayItemInput {
  id:         string
  title?:     string | null
  startTime?: string | null
  endTime?:   string | null
  priority?:  DayItemPriority
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
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_day_items')
        .delete()
        .eq('id', id).eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_day_items'] }),
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
