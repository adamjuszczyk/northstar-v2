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
  sheet_id: string | null
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
    // ?? null (not a direct read) so this degrades correctly whether
    // migration_17 hasn't been run yet (column absent from `select('*')`
    // entirely, so r.sheet_id is undefined here, not null) or has been run
    // and the row genuinely has no sheet — both mean "lives in the main
    // tree." Direct assignment would leave sheetId literally `undefined`
    // pre-migration, which fails TreeView's `sheetId === null` filter and
    // makes every node vanish from the canvas.
    sheetId:   r.sheet_id ?? null,
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
          sheetId:   r.sheetId ?? null,
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
  /** null = main tree. A new child inherits its parent's sheetId; a new
   *  root takes whichever canvas (main tree or a Sheet tab) it was added
   *  from — see TreeView's handleAddChild / "+ Vision" for how each caller
   *  resolves this. Required, not defaulted, so no call site can forget it
   *  and silently create a node invisible in the canvas it was added from. */
  sheetId:   string | null
}

export function useCreateNode() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateNodeInput) => {
      const payload: Record<string, unknown> = {
        user_id:   user!.id,
        parent_id: input.parentId,
        type:      input.type,
        title:     input.title,
        notes:     input.notes ?? null,
        status:    'not_started' as NodeStatus,
        position:  input.position ?? 0,
      }
      // Only written when actually non-null. Omitting it is exactly
      // equivalent to `sheet_id: null` once the column exists (no default
      // clause means Postgres leaves an unspecified column null) — but
      // unlike an explicit null, omitting it also works before
      // migration_17 has been run, when the column doesn't exist at all
      // yet. The overwhelming majority of node creation has nothing to do
      // with Sheets and must keep working through that gap; a genuinely
      // non-null sheetId can only ever occur once a real Sheet exists,
      // which itself requires the migration to already be live.
      if (input.sheetId) payload.sheet_id = input.sheetId
      const { data, error } = await supabase
        .from('ns_tree_nodes')
        .insert(payload)
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
  /** Only Sheets-aware callers (MoveToPicker's cross-canvas candidate list)
   *  need this — TreeView's own in-canvas drag-and-drop never crosses a
   *  sheet boundary (every rendered drop target already shares the active
   *  canvas's sheetId), so it omits this and sheet_id is left untouched.
   *  When provided, syncs the moved node's sheet_id to match — reparenting
   *  under a node pulls the moved node into that node's sheet (or back to
   *  the main tree); omitted means "leave sheet_id exactly as it is." */
  sheetId?: string | null
}

/**
 * Reparents a node (and, implicitly, its whole subtree — parent_id is the
 * only structural field in this adjacency list). Used by both the drag-and-
 * drop handler and the "Move to…" picker so they stay behaviourally
 * identical. One Supabase update, one invalidation.
 *
 * parent_id is the only thing this ever changes structurally — sheet_id is
 * synced only when a caller explicitly asks (see MoveNodeInput.sheetId).
 * Sheets themselves never rewrite parent_id at all (see useSheets.ts).
 */
export function useMoveNode() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, parentId, position, sheetId }: MoveNodeInput) => {
      const patch: Record<string, unknown> = {
        parent_id: parentId, position, updated_at: new Date().toISOString(),
      }
      if (sheetId !== undefined) patch.sheet_id = sheetId
      const { error } = await supabase
        .from('ns_tree_nodes')
        .update(patch)
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

/** Flattens a built tree into an id → node lookup. Used to find a node's
 *  UNFILTERED counterpart (built from the full node list, ignoring
 *  sheet_id) when the tree actually being rendered is sheet-scoped —
 *  countDescendants/countCompleted must always be called against that
 *  unfiltered counterpart, never the canvas-filtered node, or a Sheet's
 *  contents would silently vanish from every rollup indicator that reads
 *  them (TreeNode's progress bar and collapse message). */
export function indexById(roots: TreeNodeWithChildren[]): Map<string, TreeNodeWithChildren> {
  const map = new Map<string, TreeNodeWithChildren>()
  function walk(n: TreeNodeWithChildren) {
    map.set(n.id, n)
    n.children.forEach(walk)
  }
  roots.forEach(walk)
  return map
}

/**
 * Every real descendant id of nodeId (children, grandchildren, ...),
 * walking parent_id links directly over the full, unfiltered flat node
 * list — independent of sheet_id and of any pre-built (possibly
 * sheet-filtered) TreeNodeWithChildren tree. This is the single source of
 * truth for "how much does deleting/moving this node actually affect" —
 * used by NodeEditor's delete-confirmation count, MoveToPicker's
 * cycle-prevention candidate exclusion, and useSheets' "launch from node"
 * (which nodes to stamp with the new sheet_id). Does not include nodeId
 * itself.
 */
export function collectDescendantIds(nodeId: string, allNodes: TreeNode[]): string[] {
  const childrenByParent = new Map<string, string[]>()
  for (const n of allNodes) {
    if (n.parentId) {
      const arr = childrenByParent.get(n.parentId)
      if (arr) arr.push(n.id)
      else childrenByParent.set(n.parentId, [n.id])
    }
  }
  const result: string[] = []
  const stack = [nodeId]
  while (stack.length) {
    const cur = stack.pop()!
    for (const childId of childrenByParent.get(cur) ?? []) {
      result.push(childId)
      stack.push(childId)
    }
  }
  return result
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
