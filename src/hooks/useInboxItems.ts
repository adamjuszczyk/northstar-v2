import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { enqueue } from '../lib/syncQueue'
import { useAuth } from './useAuth'
import type { InboxItem, InboxState, InboxKind } from '../types'

const QK = (uid: string) => ['ns_inbox', uid] as const

/**
 * After deleting a schedule record (day item, week focus, or month focus)
 * that came from an inbox item, this reverts the inbox item back to
 * 'unassigned' — but only if no OTHER schedule still references it (a
 * single inbox item can in principle be scheduled to a day AND a week at
 * once). Best-effort: never throws, so a reconciliation failure can't
 * block the delete the user actually asked for.
 *
 * Also checks task-linked references: a task materialized from this inbox
 * item (Task Lists & Split, or the TaskSourceForm Week/Month "add from
 * inbox" flow) leaves the occurrence's own inbox_item_id null — identity
 * resolves through task_id instead — so a plain inbox_item_id count alone
 * would miss it and wrongly revert an item still "spoken for" by a linked
 * task elsewhere.
 */
export async function maybeRevertInboxItemState(userId: string, inboxItemId: string): Promise<void> {
  try {
    const { data: tasks } = await supabase
      .from('ns_tasks').select('id')
      .eq('user_id', userId).eq('source', 'inbox').eq('inbox_item_id', inboxItemId)
    const taskIds = (tasks ?? []).map(t => t.id as string)

    const checks = [
      supabase.from('ns_day_items').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('inbox_item_id', inboxItemId),
      supabase.from('ns_week_focus').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('inbox_item_id', inboxItemId),
      supabase.from('ns_month_focus').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('inbox_item_id', inboxItemId),
    ]
    if (taskIds.length > 0) {
      checks.push(
        supabase.from('ns_day_items').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).in('task_id', taskIds),
        supabase.from('ns_week_focus').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).in('task_id', taskIds),
        supabase.from('ns_month_focus').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).in('task_id', taskIds),
      )
    }
    const results = await Promise.all(checks)
    const stillScheduled = results.some(r => (r.count ?? 0) > 0)
    if (stillScheduled) return

    await supabase
      .from('ns_inbox_items')
      .update({ state: 'unassigned', updated_at: new Date().toISOString() })
      .eq('id', inboxItemId)
      .eq('user_id', userId)
  } catch {
    // best-effort — leaving the inbox item's state stale is safer than
    // failing the delete the user actually asked for
  }
}

function row2item(r: Record<string, unknown>): InboxItem {
  return {
    id:             r.id             as string,
    userId:         r.user_id        as string,
    content:        r.content        as string,
    kind:           (r.kind as InboxKind | undefined) ?? 'task',
    state:          r.state          as InboxState,
    promotedNodeId: r.promoted_node_id as string | null,
    carriedOver:    r.carried_over   as boolean,
    isCompleted:    r.is_completed   as boolean,
    createdAt:      r.created_at     as string,
    updatedAt:      r.updated_at     as string,
  }
}

export function useInboxItems() {
  const { user } = useAuth()
  return useQuery({
    queryKey: QK(user?.id ?? ''),
    queryFn: async () => {
      if (!user) return []
      // Offline fallback: serve from Dexie
      if (!navigator.onLine) {
        const cached = await db.inboxItems
          .where('userId').equals(user.id)
          .reverse()
          .sortBy('createdAt')
        return cached.map(r => ({
          id:             r.id,
          userId:         r.userId,
          content:        r.content,
          kind:           (r.kind as InboxKind | undefined) ?? 'task',
          state:          r.state as InboxState,
          promotedNodeId: r.promotedNodeId,
          carriedOver:    r.carriedOver,
          isCompleted:    r.isCompleted,
          createdAt:      r.createdAt,
          updatedAt:      r.updatedAt,
        } satisfies InboxItem))
      }
      const { data, error } = await supabase
        .from('ns_inbox_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(row2item)
    },
    networkMode: 'always',
    enabled:     !!user,
    staleTime:   5 * 60 * 1000,
    gcTime:      60 * 60 * 1000,
  })
}

export interface CreateInboxItemInput {
  content: string
  kind:    InboxKind
}

export function useCreateInboxItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ content, kind }: CreateInboxItemInput): Promise<InboxItem> => {
      if (!user) throw new Error('Not authenticated')

      if (!navigator.onLine) {
        // Offline path: write to Dexie + enqueue for later sync
        const now = new Date().toISOString()
        const id  = crypto.randomUUID()
        const item: InboxItem = {
          id, userId: user.id, content, kind,
          state: 'unassigned', promotedNodeId: null, carriedOver: false, isCompleted: false,
          createdAt: now, updatedAt: now,
        }
        await db.inboxItems.add({
          id, userId: user.id, content, kind, state: 'unassigned',
          promotedNodeId: null, carriedOver: false, isCompleted: false, createdAt: now, updatedAt: now,
        })
        await enqueue('ns_inbox_items', 'insert', {
          id, user_id: user.id, content, kind, state: 'unassigned',
          promoted_node_id: null, carried_over: false, is_completed: false, created_at: now, updated_at: now,
        }, user.id)
        return item
      }

      const { data, error } = await supabase
        .from('ns_inbox_items')
        .insert({ user_id: user.id, content, kind })
        .select()
        .single()
      if (error) throw error
      return row2item(data)
    },
    networkMode: 'always',
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(user?.id ?? '') }),
  })
}

export function useDeleteInboxItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_inbox_items')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(user?.id ?? '') }),
  })
}

export function useUpdateInboxItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: {
      id:              string
      content?:        string
      state?:          InboxState
      promotedNodeId?: string | null
      isCompleted?:    boolean
    }) => {
      if (!user) throw new Error('Not authenticated')
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (patch.content        !== undefined) updates.content          = patch.content
      if (patch.state          !== undefined) updates.state            = patch.state
      if (patch.promotedNodeId !== undefined) updates.promoted_node_id = patch.promotedNodeId
      if (patch.isCompleted    !== undefined) updates.is_completed     = patch.isCompleted
      const { data, error } = await supabase
        .from('ns_inbox_items')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()
      if (error) throw error
      return row2item(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(user?.id ?? '') }),
  })
}

// ── Scheduling ─────────────────────────────────────────────────────────────
// These write to the Phase 4/5 tables. Both tables must exist for the call
// to succeed — run the Phase 4 and Phase 5 SQL first.

export function useScheduleInboxToDay() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, date }: { itemId: string; date: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { count } = await supabase
        .from('ns_day_items')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('date', date)
      const { error: e1 } = await supabase
        .from('ns_day_items')
        .insert({ user_id: user.id, date, source: 'inbox', inbox_item_id: itemId, is_complete: false, position: count ?? 0 })
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from('ns_inbox_items')
        .update({ state: 'scheduled', updated_at: new Date().toISOString() })
        .eq('id', itemId)
        .eq('user_id', user.id)
      if (e2) throw e2
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(user?.id ?? '') }),
  })
}

export function useScheduleInboxToWeek() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, weekStart }: { itemId: string; weekStart: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { count } = await supabase
        .from('ns_week_focus')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('week_start', weekStart)
      const { error: e1 } = await supabase
        .from('ns_week_focus')
        .insert({ user_id: user.id, week_start: weekStart, source: 'inbox', inbox_item_id: itemId, is_complete: false, position: count ?? 0 })
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from('ns_inbox_items')
        .update({ state: 'scheduled', updated_at: new Date().toISOString() })
        .eq('id', itemId)
        .eq('user_id', user.id)
      if (e2) throw e2
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(user?.id ?? '') }),
  })
}

export function useScheduleInboxToMonth() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, monthStart }: { itemId: string; monthStart: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { count } = await supabase
        .from('ns_month_focus')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('month_start', monthStart)
      const { error: e1 } = await supabase
        .from('ns_month_focus')
        .insert({ user_id: user.id, month_start: monthStart, source: 'inbox', inbox_item_id: itemId, is_complete: false, position: count ?? 0 })
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from('ns_inbox_items')
        .update({ state: 'scheduled', updated_at: new Date().toISOString() })
        .eq('id', itemId)
        .eq('user_id', user.id)
      if (e2) throw e2
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(user?.id ?? '') }),
  })
}
