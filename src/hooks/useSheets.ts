import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useAuth } from './useAuth'
import { collectDescendantIds } from './useTreeNodes'
import type { Sheet, TreeNode } from '../types'

// ── DB ↔ TS mapping ────────────────────────────────────────────────────────

interface SheetRow {
  id: string
  user_id: string
  name: string
  anchor_node_id: string | null
  position: number
  created_at: string
  updated_at: string
}

function fromRow(r: SheetRow): Sheet {
  return {
    id:           r.id,
    userId:       r.user_id,
    name:         r.name,
    anchorNodeId: r.anchor_node_id,
    position:     r.position,
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
  }
}

const QK = (uid: string) => ['ns_sheets', uid] as const

// ── Queries ───────────────────────────────────────────────────────────────────
//
// Sheets are online-only writes (TASKS.md §3.9) — only the read side is
// Dexie-backed, same pattern as Lines/Blocks, so an offline Tree screen
// still shows sheet tabs rather than silently collapsing to just Main Tree.

export function useSheets() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? QK(user.id) : ['ns_sheets', 'none'],
    queryFn: async (): Promise<Sheet[]> => {
      if (!user) return []
      if (!navigator.onLine) {
        const cached = await db.sheets.where('userId').equals(user.id).toArray()
        return cached
          .map(r => ({
            id: r.id, userId: r.userId, name: r.name,
            anchorNodeId: r.anchorNodeId, position: r.position,
            createdAt: r.createdAt, updatedAt: r.updatedAt,
          }))
          .sort((a, b) => a.position - b.position)
      }
      const { data, error } = await supabase
        .from('ns_sheets')
        .select('*')
        .eq('user_id', user.id)
        .order('position', { ascending: true })
      if (error) {
        const code = (error as { code?: string }).code ?? ''
        if (code === '42P01' || code === 'PGRST205') return []
        throw error
      }
      return (data ?? []).map(r => fromRow(r as SheetRow))
    },
    networkMode: 'always',
    enabled:     !!user,
  })
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['ns_sheets'] })
  qc.invalidateQueries({ queryKey: ['ns_tree_nodes'] })
}

// ── Mutations ────────────────────────────────────────────────────────────────

/** Fully detached (SPEC §5.5 path 1) — a blank sheet, no anchor yet. */
export interface CreateSheetInput {
  name: string
}

export function useCreateSheet() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateSheetInput) => {
      const { data, error } = await supabase
        .from('ns_sheets')
        .insert({ user_id: user!.id, name: input.name, anchor_node_id: null, position: 0 })
        .select()
        .single()
      if (error) throw error
      return fromRow(data as SheetRow)
    },
    onSuccess: () => invalidate(qc),
  })
}

/**
 * Launched directly from an existing node (SPEC §5.5 path 2) — moves that
 * node's existing subtree into a new sheet, with the node becoming the
 * anchor automatically. Per the settled technical approach (TASKS.md §3.5):
 * parent_id is NEVER rewritten here. Only sheet_id is stamped, and only
 * onto the node's DESCENDANTS — the anchor node itself keeps sheet_id =
 * null and stays visible in the main tree.
 */
export interface CreateSheetFromNodeInput {
  name:   string
  nodeId: string
  /** Full, unfiltered node list — required so the descendant set spans any
   *  node regardless of where it currently renders (TASKS.md's audit rule:
   *  this kind of computation must never be sheet-filtered). */
  allNodes: TreeNode[]
}

export function useCreateSheetFromNode() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateSheetFromNodeInput) => {
      const { data: sheetRow, error: sheetError } = await supabase
        .from('ns_sheets')
        .insert({ user_id: user!.id, name: input.name, anchor_node_id: input.nodeId, position: 0 })
        .select()
        .single()
      if (sheetError) throw sheetError
      const sheet = fromRow(sheetRow as SheetRow)

      const descendantIds = collectDescendantIds(input.nodeId, input.allNodes)
      if (descendantIds.length > 0) {
        const { error: updateError } = await supabase
          .from('ns_tree_nodes')
          .update({ sheet_id: sheet.id, updated_at: new Date().toISOString() })
          .in('id', descendantIds)
          .eq('user_id', user!.id)
        if (updateError) throw updateError
      }
      return sheet
    },
    onSuccess: () => invalidate(qc),
  })
}

export interface RenameSheetInput {
  id:   string
  name: string
}

export function useRenameSheet() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }: RenameSheetInput) => {
      const { error } = await supabase
        .from('ns_sheets')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => invalidate(qc),
  })
}

/**
 * Attaches a detached sheet to a node — sets ns_sheets.anchor_node_id only.
 * A navigational link (where the main tree points to open the sheet), not
 * structural reparenting — no node's parent_id or sheet_id changes.
 */
export interface AttachSheetInput {
  id:     string
  nodeId: string
}

export function useAttachSheet() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nodeId }: AttachSheetInput) => {
      const { error } = await supabase
        .from('ns_sheets')
        .update({ anchor_node_id: nodeId, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => invalidate(qc),
  })
}

/** Inverse of attach — clears anchor_node_id back to null. The sheet's own
 *  nodes (and their parent_id chains) are completely untouched; the sheet
 *  just becomes detached again, still reachable via its tab. */
export function useDetachSheet() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ns_sheets')
        .update({ anchor_node_id: null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => invalidate(qc),
  })
}

/**
 * Dissolving a sheet is one UPDATE — clear sheet_id back to null on every
 * node that had it — then delete the ns_sheets row. The subtree snaps back
 * into place under its anchor for free, because parent_id was never
 * touched by any Sheets operation.
 */
export function useDissolveSheet() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error: clearError } = await supabase
        .from('ns_tree_nodes')
        .update({ sheet_id: null, updated_at: new Date().toISOString() })
        .eq('sheet_id', id)
        .eq('user_id', user!.id)
      if (clearError) throw clearError

      const { error: deleteError } = await supabase
        .from('ns_sheets')
        .delete()
        .eq('id', id)
        .eq('user_id', user!.id)
      if (deleteError) throw deleteError
    },
    onSuccess: () => invalidate(qc),
  })
}
