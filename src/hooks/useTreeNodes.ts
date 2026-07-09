import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useAuth } from './useAuth'
import type { TreeNode, NodeType, NodeStatus } from '../types'

// ── DB ↔ TS mapping ────────────────────────────────────────────────────────

interface TreeNodeRow {
  id: string
  user_id: string
  parent_id: string | null
  type: NodeType
  title: string
  notes: string | null
  status: NodeStatus
  position: number
  created_at: string
  updated_at: string
}

function fromRow(r: TreeNodeRow): TreeNode {
  return {
    id:        r.id,
    userId:    r.user_id,
    parentId:  r.parent_id,
    type:      r.type,
    title:     r.title,
    notes:     r.notes,
    status:    r.status,
    position:  r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const QK = (uid: string) => ['ns_tree_nodes', uid] as const

// ── Queries ─────────────────────────────────────────────────────────────────

export function useTreeNodes() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? QK(user.id) : ['ns_tree_nodes', 'none'],
    queryFn: async (): Promise<TreeNode[]> => {
      if (!navigator.onLine) {
        const cached = await db.treeNodes.where('userId').equals(user!.id).toArray()
        return cached.map(r => ({
          id:        r.id,
          userId:    r.userId,
          parentId:  r.parentId,
          type:      r.type as NodeType,
          title:     r.title,
          notes:     null,
          status:    r.status as NodeStatus,
          position:  r.position,
          createdAt: r.updatedAt,
          updatedAt: r.updatedAt,
        }))
      }
      const { data, error } = await supabase
        .from('ns_tree_nodes')
        .select('*')
        .eq('user_id', user!.id)
        .order('position', { ascending: true })
      if (error) throw error
      return (data as TreeNodeRow[]).map(fromRow)
    },
    networkMode: 'always',
    enabled: !!user,
  })
}

// ── Mutations ────────────────────────────────────────────────────────────────

export interface CreateNodeInput {
  parentId:  string | null
  type:      NodeType
  title:     string
  notes?:    string | null
  position?: number
}

export function useCreateNode() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateNodeInput) => {
      const { data, error } = await supabase
        .from('ns_tree_nodes')
        .insert({
          user_id:   user!.id,
          parent_id: input.parentId,
          type:      input.type,
          title:     input.title,
          notes:     input.notes ?? null,
          status:    'not_started' as NodeStatus,
          position:  input.position ?? 0,
        })
        .select()
        .single()
      if (error) throw error
      return fromRow(data as TreeNodeRow)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_tree_nodes'] }),
  })
}

export interface UpdateNodeInput {
  id:      string
  title?:  string
  type?:   NodeType
  status?: NodeStatus
  notes?:  string | null
}

export function useUpdateNode() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rest }: UpdateNodeInput) => {
      const { error } = await supabase
        .from('ns_tree_nodes')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_tree_nodes'] }),
  })
}

export function useDeleteNode() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ns_tree_nodes')
        .delete()
        .eq('id', id)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_tree_nodes'] }),
  })
}

export interface MoveNodeInput {
  id:       string
  parentId: string | null
  position: number
}

/**
 * Reparents a node (and, implicitly, its whole subtree — parent_id is the
 * only structural field in this adjacency list). Used by both the drag-and-
 * drop handler and the "Move to…" picker so they stay behaviourally
 * identical. One Supabase update, one invalidation.
 */
export function useMoveNode() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, parentId, position }: MoveNodeInput) => {
      const { error } = await supabase
        .from('ns_tree_nodes')
        .update({ parent_id: parentId, position, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_tree_nodes'] }),
  })
}

// ── Tree-building utility ────────────────────────────────────────────────────

export interface TreeNodeWithChildren extends TreeNode {
  children: TreeNodeWithChildren[]
}

export function buildTree(nodes: TreeNode[]): TreeNodeWithChildren[] {
  const map = new Map<string, TreeNodeWithChildren>()
  const roots: TreeNodeWithChildren[] = []

  nodes.forEach(n => map.set(n.id, { ...n, children: [] }))
  nodes.forEach(n => {
    const node = map.get(n.id)!
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  function sort(arr: TreeNodeWithChildren[]) {
    arr.sort((a, b) => a.position - b.position)
    arr.forEach(n => sort(n.children))
  }
  sort(roots)
  return roots
}

export function countDescendants(node: TreeNodeWithChildren): number {
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0)
}

export function countCompleted(node: TreeNodeWithChildren): number {
  return node.children.reduce((sum, c) => {
    return sum + (c.status === 'complete' ? 1 : 0) + countCompleted(c)
  }, 0)
}

// ── Reparenting utilities ────────────────────────────────────────────────────

/**
 * True if moving `draggedId` to become a child of `targetId` would create a
 * cycle — i.e. targetId is draggedId itself, or already sits somewhere in
 * draggedId's own subtree. Walks up from targetId through parentId links;
 * if draggedId is encountered, targetId is a descendant (or draggedId
 * itself) and the move is invalid.
 */
export function wouldCreateCycle(
  draggedId: string,
  targetId:  string,
  nodes:     TreeNode[],
): boolean {
  if (draggedId === targetId) return true
  const byId = new Map(nodes.map(n => [n.id, n]))
  let current: string | null = targetId
  const seen = new Set<string>()
  while (current) {
    if (current === draggedId) return true
    if (seen.has(current)) break // defensive: pre-existing corrupt data shouldn't infinite-loop
    seen.add(current)
    current = byId.get(current)?.parentId ?? null
  }
  return false
}

/** Number of nodes directly under parentId (null = root level) — used to
 *  append a reparented node at the end of its new siblings. */
export function siblingCount(parentId: string | null, nodes: TreeNode[]): number {
  return nodes.filter(n => n.parentId === parentId).length
}
