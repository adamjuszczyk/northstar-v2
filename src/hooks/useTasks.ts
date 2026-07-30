import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useAuth } from './useAuth'
import type { useT } from '../i18n'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskSource = 'standalone' | 'tree' | 'inbox' | 'habit'

/** The shared task entity (SPEC §5.3). Created lazily — day items, and now
 *  week/month focus rows (this session's TaskSourceForm fix), stay
 *  task_id = null until a shared identity is actually needed: the first
 *  step is added, the item is split, or it's linked from the Week/Month
 *  Tasks-section "add from tree/inbox" flow. */
export interface Task {
  id:          string
  userId:      string
  source:      TaskSource
  title:       string | null
  treeNodeId:  string | null
  inboxItemId: string | null
  habitId:     string | null
  notes:       string | null
  isComplete:  boolean
  createdAt:   string
  updatedAt:   string
}

function row2task(r: Record<string, unknown>): Task {
  return {
    id:          r.id            as string,
    userId:      r.user_id       as string,
    source:      r.source        as TaskSource,
    title:       r.title         as string | null,
    treeNodeId:  (r.tree_node_id  as string | null) ?? null,
    inboxItemId: (r.inbox_item_id as string | null) ?? null,
    habitId:     (r.habit_id      as string | null) ?? null,
    notes:       (r.notes         as string | null) ?? null,
    isComplete:  r.is_complete   as boolean,
    createdAt:   r.created_at    as string,
    updatedAt:   r.updated_at    as string,
  }
}

function tableMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? ''
  return code === '42P01' || code === 'PGRST205'
}

// ── Title resolution ─────────────────────────────────────────────────────────

/** Resolves a task's own display title through its source chain — the same
 *  resolve-through-a-map fallback already used for day items and focus rows
 *  (DayView / WeekView / MonthView), just one level further out since a
 *  task's identity now sits behind task_id instead of directly on the row.
 *
 *  Live link first, task.title last — not first. findOrCreateTaskForRef
 *  snapshots a title onto tree/inbox-linked tasks so the source can later
 *  be deleted without violating task_tree_needs_node/task_inbox_needs_item
 *  (see that function's own comment), but while the link is still live the
 *  actual tree node / inbox item is the source of truth: checking task.title
 *  first would freeze the display at whatever the node was named at
 *  materialization time, silently ignoring any rename made afterward.
 *  task.title only wins for a genuinely standalone task, or once the link
 *  it was snapshotted from is gone. */
export function resolveTaskTitle(
  task:     Task,
  nodeMap:  Map<string, { title: string }>,
  inboxMap: Map<string, { content: string }>,
  habitMap: Map<string, { name: string }>,
  t:        ReturnType<typeof useT>,
): string {
  const untitled = t('common.untitled')
  if (task.treeNodeId)  return nodeMap.get(task.treeNodeId)?.title    ?? task.title ?? untitled
  if (task.inboxItemId) return inboxMap.get(task.inboxItemId)?.content ?? task.title ?? untitled
  if (task.habitId)     return habitMap.get(task.habitId)?.name       ?? task.title ?? untitled
  if (task.title) return task.title
  return untitled
}

/** A reference to the tree node / inbox item a task can be identified by,
 *  independent of any day occurrence — used to create or find a task
 *  directly from Tree/Inbox (SPEC §5.3 "creatable everywhere"), not just
 *  materialized retroactively from a scheduled day item. */
export type TaskRef =
  | { source: 'tree';  treeNodeId:  string }
  | { source: 'inbox'; inboxItemId: string }

// ── Queries ───────────────────────────────────────────────────────────────────

/** Looks up an existing task for a tree node / inbox item WITHOUT creating
 *  one — used by Tree/Inbox's edit views to know whether "make this a list"
 *  already has a task behind it (findOrCreateTaskForRef is create-or-reuse,
 *  which would be wrong to call just to check for one — every plain, never-
 *  listed node/item would silently materialize a task the moment its editor
 *  opened). */
export function useTaskForRef(ref: TaskRef | null) {
  const { user } = useAuth()
  const matchColumn = ref?.source === 'tree' ? 'tree_node_id' : 'inbox_item_id'
  const matchValue  = ref?.source === 'tree' ? ref.treeNodeId : ref?.inboxItemId
  return useQuery({
    queryKey: ['ns_tasks', 'byRef', ref?.source ?? 'none', matchValue ?? 'none'],
    queryFn: async (): Promise<Task | null> => {
      if (!user || !ref) return null
      const { data, error } = await supabase
        .from('ns_tasks')
        .select('*')
        .eq('user_id', user.id)
        .eq('source', ref.source)
        .eq(matchColumn, matchValue as string)
        .limit(1)
        .maybeSingle()
      if (error) {
        if (tableMissing(error)) return null
        throw error
      }
      return data ? row2task(data as Record<string, unknown>) : null
    },
    enabled: !!user && !!ref,
  })
}

/** Fetches a batch of tasks by id — used wherever occurrences (day items,
 *  week/month focus rows) need their linked task's title/source resolved.
 *  Task writes are online-only (TASKS.md §3.9), but reads fall back to the
 *  usePrefetch-populated Dexie cache offline, same as Lines/Blocks — so an
 *  offline Today/Day view can still show a task-linked item's real title
 *  instead of "Untitled". */
export function useTasksByIds(ids: (string | null | undefined)[]) {
  const { user } = useAuth()
  const key = Array.from(new Set(ids.filter((x): x is string => !!x))).sort()
  return useQuery({
    queryKey: ['ns_tasks', 'byIds', key],
    queryFn: async (): Promise<Task[]> => {
      if (!user || key.length === 0) return []
      if (!navigator.onLine) {
        const cached = await db.tasks.where('id').anyOf(key).toArray()
        return cached.map(r => ({
          id: r.id, userId: r.userId, source: r.source as TaskSource, title: r.title,
          treeNodeId: r.treeNodeId, inboxItemId: r.inboxItemId, habitId: r.habitId,
          notes: r.notes, isComplete: r.isComplete, createdAt: r.createdAt, updatedAt: r.updatedAt,
        }))
      }
      const { data, error } = await supabase
        .from('ns_tasks')
        .select('*')
        .eq('user_id', user.id)
        .in('id', key)
      if (error) {
        if (tableMissing(error)) return []
        throw error
      }
      return (data ?? []).map(r => row2task(r as Record<string, unknown>))
    },
    enabled:   !!user && key.length > 0,
    staleTime: 60 * 1000,
  })
}

// ── Materialization ───────────────────────────────────────────────────────────

export interface MaterializableItem {
  source:      TaskSource
  title:       string | null
  treeNodeId:  string | null
  inboxItemId: string | null
  habitId:     string | null
  isComplete:  boolean
}

/** Creates a ns_tasks row copying an existing occurrence's identity fields,
 *  carrying over its current completion state — with zero steps yet, that's
 *  the "one hidden step" model (A1: task_id = null and a materialized task
 *  with no steps are observably identical). Does not touch the occurrence
 *  row itself; callers back-link task_id afterward.
 *
 *  Snapshots a title when the item has none of its own (true for every
 *  tree/inbox/habit-sourced occurrence — they carry their identity through
 *  the reference, not their own title column) — same reasoning as
 *  findOrCreateTaskForRef's own snapshot: without it, this task's
 *  tree_node_id/inbox_item_id/habit_id going null via ON DELETE SET NULL
 *  when the source is later deleted would violate task_tree_needs_node /
 *  task_inbox_needs_item / task_habit_needs_habit (title is not null is the
 *  only other way those constraints can hold), failing the source's DELETE
 *  outright rather than cleanly detaching. resolveTaskTitle prefers the
 *  live reference over this snapshot while the link still stands, so a
 *  later rename isn't shadowed by it. */
export async function createTaskFromItem(userId: string, item: MaterializableItem): Promise<string> {
  let title = item.title ?? null
  if (!title) {
    if (item.treeNodeId) {
      const { data } = await supabase
        .from('ns_tree_nodes').select('title').eq('id', item.treeNodeId).eq('user_id', userId).maybeSingle()
      title = (data?.title as string | undefined) ?? null
    } else if (item.inboxItemId) {
      const { data } = await supabase
        .from('ns_inbox_items').select('content').eq('id', item.inboxItemId).eq('user_id', userId).maybeSingle()
      title = (data?.content as string | undefined) ?? null
    } else if (item.habitId) {
      const { data } = await supabase
        .from('ns_habits').select('name').eq('id', item.habitId).eq('user_id', userId).maybeSingle()
      title = (data?.name as string | undefined) ?? null
    }
  }

  const { data, error } = await supabase
    .from('ns_tasks')
    .insert({
      user_id:       userId,
      source:        item.source,
      title,
      tree_node_id:  item.treeNodeId  ?? null,
      inbox_item_id: item.inboxItemId ?? null,
      habit_id:      item.habitId     ?? null,
      is_complete:   item.isComplete,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

/** Materializes a task from an existing (not-yet-linked) day item and
 *  back-links task_id onto that row — the "first step" / "first split"
 *  trigger (TASKS.md §3.3 rule 1/2). Nulls the occurrence's own identity
 *  fields (title/tree_node_id/inbox_item_id/habit_id) since display now
 *  resolves through the task; `source` is left as-is so existing
 *  source-badge rendering keeps working unchanged. */
export async function materializeTaskFromDayItem(
  userId: string,
  item: MaterializableItem & { id: string },
): Promise<string> {
  const taskId = await createTaskFromItem(userId, item)
  const { error } = await supabase
    .from('ns_day_items')
    .update({
      task_id: taskId,
      title: null, tree_node_id: null, inbox_item_id: null, habit_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', item.id)
    .eq('user_id', userId)
  if (error) throw error
  return taskId
}

/** Finds an existing task already materialized for this tree node / inbox
 *  item and reuses it — so adding the same source to both the Week and
 *  Month Tasks sections (or to a day and a week) shares one identity rather
 *  than spawning a duplicate — or creates a new one. A newly-created
 *  inbox-sourced task marks the source inbox item 'scheduled', the same
 *  bookkeeping every other scheduling flow does — the fix for the inbox
 *  item that used to stay stuck 'unassigned' forever after this flow. */
export interface FoundOrCreatedTask {
  taskId:     string
  /** The task's current completion — callers mirroring this onto a new
   *  occurrence row must use this rather than assuming false, or a reused
   *  (already-complete) task's new occurrence would violate the
   *  is_complete-mirror invariant (TASKS.md §3.3 rule 5) until its next
   *  explicit toggle. */
  isComplete: boolean
}

export async function findOrCreateTaskForRef(
  userId: string,
  ref: TaskRef,
): Promise<FoundOrCreatedTask> {
  const matchColumn = ref.source === 'tree' ? 'tree_node_id' : 'inbox_item_id'
  const matchValue  = ref.source === 'tree' ? ref.treeNodeId : ref.inboxItemId

  const { data: existing, error: findError } = await supabase
    .from('ns_tasks')
    .select('id, is_complete')
    .eq('user_id', userId)
    .eq('source', ref.source)
    .eq(matchColumn, matchValue)
    .limit(1)
    .maybeSingle()
  if (findError) throw findError
  if (existing) return { taskId: existing.id as string, isComplete: existing.is_complete as boolean }

  // Snapshot a title onto the task at creation time — without this, a task
  // linked only by tree_node_id/inbox_item_id (title left null) becomes
  // permanently undeletable at the source: deleting the tree node/inbox
  // item fires ON DELETE SET NULL on this column, which is itself an
  // UPDATE that must still satisfy task_tree_needs_node/task_inbox_needs_
  // item (source is not null OR tree_node_id/inbox_item_id is not null OR
  // title is not null) — with both the link and title null, that UPDATE
  // violates the constraint and the source DELETE fails outright (confirmed
  // live: 23514 check_violation on task_tree_needs_node). Harmless once
  // resolveTaskTitle has a live link to prefer, and is exactly the
  // "snapshot a title before the source disappears" fix already flagged
  // as the real resolution for this gap (task_65110056).
  let snapshotTitle: string | null = null
  if (ref.source === 'tree') {
    const { data } = await supabase
      .from('ns_tree_nodes').select('title').eq('id', ref.treeNodeId).eq('user_id', userId).maybeSingle()
    snapshotTitle = (data?.title as string | undefined) ?? null
  } else {
    const { data } = await supabase
      .from('ns_inbox_items').select('content').eq('id', ref.inboxItemId).eq('user_id', userId).maybeSingle()
    snapshotTitle = (data?.content as string | undefined) ?? null
  }

  const { data: created, error: createError } = await supabase
    .from('ns_tasks')
    .insert({
      user_id:       userId,
      source:        ref.source,
      title:         snapshotTitle,
      tree_node_id:  ref.source === 'tree'  ? ref.treeNodeId  : null,
      inbox_item_id: ref.source === 'inbox' ? ref.inboxItemId : null,
      is_complete:   false,
    })
    .select('id')
    .single()
  if (createError) throw createError
  const taskId = created.id as string

  if (ref.source === 'inbox') {
    await supabase
      .from('ns_inbox_items')
      .update({ state: 'scheduled', updated_at: new Date().toISOString() })
      .eq('id', ref.inboxItemId)
      .eq('user_id', userId)
  }
  return { taskId, isComplete: false }
}

// ── Completion ────────────────────────────────────────────────────────────────

/** The canonical "set this task's completion" write. Mirrors is_complete
 *  onto every occurrence (day items, week focus, month focus) referencing
 *  this task_id — the invariant TASKS.md §3.3 rule 5 requires, since none
 *  of those tables' readers should have to join to know completion — and
 *  propagates to the tree for tree-sourced tasks (A10) and logs a habit
 *  entry for habit-sourced ones (SPEC §4.4: habit tracking stays
 *  independent of Task Lists & Split, but still has to actually fire —
 *  same two-table/entry-logging rule already used for plain tree/habit-
 *  linked day items, just routed through the task once one exists). Never
 *  logs on un-complete, matching that same existing rule — a habit entry
 *  is a permanent record.
 *
 *  Habit-logging fires only on the genuine not-complete → complete
 *  transition (checked against the task's own current is_complete, fetched
 *  fresh here), not on every call made with isComplete=true — a step
 *  toggle/add/delete recomputes and calls this on every change, so an
 *  already-complete task re-entering this function (e.g. editing a step
 *  that doesn't change the all-done outcome) must not log a second entry
 *  for work that was already counted (SPEC §5.3: one list completion is
 *  one occurrence, not one per step). `skipHabitLog` lets a caller that
 *  already logged its own entry for this exact transition (the counter
 *  tap-to-increment path, `useIncrementDayItemCounter`) skip the insert
 *  here entirely, so a tap that reaches target doesn't log twice. */
export async function applyTaskCompletion(
  userId: string,
  taskId: string,
  isComplete: boolean,
  opts?: { skipHabitLog?: boolean },
): Promise<void> {
  const now = new Date().toISOString()

  const { data: task, error: fetchError } = await supabase
    .from('ns_tasks')
    .select('source, tree_node_id, habit_id, is_complete')
    .eq('id', taskId).eq('user_id', userId)
    .single()
  if (fetchError) throw fetchError

  const { error: taskError } = await supabase
    .from('ns_tasks')
    .update({ is_complete: isComplete, updated_at: now })
    .eq('id', taskId).eq('user_id', userId)
  if (taskError) throw taskError

  const [dayRes, weekRes, monthRes] = await Promise.all([
    supabase.from('ns_day_items').update({ is_complete: isComplete, updated_at: now }).eq('task_id', taskId).eq('user_id', userId),
    supabase.from('ns_week_focus').update({ is_complete: isComplete, updated_at: now }).eq('task_id', taskId).eq('user_id', userId),
    supabase.from('ns_month_focus').update({ is_complete: isComplete, updated_at: now }).eq('task_id', taskId).eq('user_id', userId),
  ])
  if (dayRes.error) throw dayRes.error
  if (weekRes.error) throw weekRes.error
  if (monthRes.error) throw monthRes.error

  if (task.source === 'tree' && task.tree_node_id) {
    const { error: treeError } = await supabase
      .from('ns_tree_nodes')
      .update({ status: isComplete ? 'complete' : 'in_progress', updated_at: now })
      .eq('id', task.tree_node_id as string).eq('user_id', userId)
    if (treeError) throw treeError
  }

  const becameComplete = isComplete && !task.is_complete
  if (becameComplete && task.source === 'habit' && task.habit_id && !opts?.skipHabitLog) {
    const { error: habitError } = await supabase
      .from('ns_habit_entries')
      .insert({ user_id: userId, habit_id: task.habit_id as string, logged_at: now, source: 'day_view' })
    if (habitError) throw habitError
  }
}

export function invalidateTaskLinkedQueries(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: ['ns_day_items'] })
  qc.invalidateQueries({ queryKey: ['ns_day_items_range'] })
  qc.invalidateQueries({ queryKey: ['ns_week_focus'] })
  qc.invalidateQueries({ queryKey: ['ns_month_focus'] })
  qc.invalidateQueries({ queryKey: ['ns_tree_nodes'] })
  qc.invalidateQueries({ queryKey: ['ns_tasks'] })
}

export function useToggleTaskComplete() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, isComplete }: { taskId: string; isComplete: boolean }) => {
      if (!user) throw new Error('Not authenticated')
      await applyTaskCompletion(user.id, taskId, isComplete)
    },
    onSuccess: () => invalidateTaskLinkedQueries(qc),
  })
}

// ── Inbox-state cleanup ───────────────────────────────────────────────────────

/** After deleting the last occurrence referencing an inbox-sourced task,
 *  reverts the underlying inbox item back to 'unassigned' — the delete-side
 *  mirror of findOrCreateTaskForRef's create-side 'scheduled' bookkeeping.
 *  Scoped by task_id rather than inbox_item_id (maybeRevertInboxItemState's
 *  approach) because a materialized occurrence's own inbox_item_id is null
 *  — identity resolves through the task. Best-effort, matching that
 *  function's own failure semantics: never throws, so a reconciliation
 *  failure can't block the delete the user actually asked for. */
export async function maybeRevertTaskInboxState(userId: string, taskId: string): Promise<void> {
  try {
    const { data: task } = await supabase
      .from('ns_tasks')
      .select('source, inbox_item_id')
      .eq('id', taskId).eq('user_id', userId)
      .maybeSingle()
    if (!task || task.source !== 'inbox' || !task.inbox_item_id) return

    const [dayRes, weekRes, monthRes] = await Promise.all([
      supabase.from('ns_day_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('task_id', taskId),
      supabase.from('ns_week_focus').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('task_id', taskId),
      supabase.from('ns_month_focus').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('task_id', taskId),
    ])
    const stillReferenced = (dayRes.count ?? 0) > 0 || (weekRes.count ?? 0) > 0 || (monthRes.count ?? 0) > 0
    if (stillReferenced) return

    await supabase
      .from('ns_inbox_items')
      .update({ state: 'unassigned', updated_at: new Date().toISOString() })
      .eq('id', task.inbox_item_id as string).eq('user_id', userId)
  } catch {
    // best-effort — leaving the inbox item's state stale is safer than
    // failing the delete the user actually asked for
  }
}
