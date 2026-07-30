-- ============================================================================
-- Fix — backfill the one ns_tasks row left with title = null from before
-- session 14's title-snapshot fix existed (SPEC §5.3 / TASKS.md §3.3).
-- Run this in the Supabase SQL Editor.
--
-- Context: session 14 fixed a real bug where a tree/inbox/habit-linked task
-- with no title of its own (title left null, identity resolves through the
-- link) became permanently undeletable at the source — deleting the tree
-- node / inbox item / habit fires ON DELETE SET NULL on the matching
-- ns_tasks column, which is itself an UPDATE that must still satisfy
-- task_tree_needs_node / task_inbox_needs_item / task_habit_needs_habit
-- (source-appropriate link IS NOT NULL OR title IS NOT NULL) — with both
-- the link and title null, that UPDATE violates the constraint and the
-- source's DELETE fails outright. Fixed going forward by snapshotting a
-- title onto every newly-created linked task (findOrCreateTaskForRef /
-- createTaskFromItem, useTasks.ts). That fix is not retroactive — it only
-- runs at creation time, so any task already sitting with title = null
-- from before the fix shipped stays exactly as it was.
--
-- This session's live data check found exactly one such row. Investigated
-- before writing this migration, per instruction, not assumed:
--   - Row: source = 'habit', habit_id set (tree_node_id / inbox_item_id
--     both null), is_complete = true, created 2026-07-28T14:13:01Z — well
--     before session 14's fix landed later the same day (that session's
--     own test tasks, created and cleaned up afterward, all have
--     created_at timestamps from 18:08Z onward).
--   - habit_id resolves to a real, still-existing habit: "Prayer"
--     (x_per_day, target 2, auto-add to day) — not deleted, not orphaned.
--   - The task IS actively referenced: one live ns_day_items row (today,
--     2026-07-28, is_complete = true, counter_target = 2) has task_id
--     pointing at it, and it carries one real step ("step", done). Not
--     referenced by any ns_week_focus / ns_month_focus row.
-- Conclusion: not an orphan — a normal, in-use, habit-linked task that
-- simply predates the fix. Same backfill logic as the fix itself: copy the
-- linked habit's name onto the task's own title column.
--
-- Scoped by shape (title is null and habit_id is not null), not by this
-- row's specific id — matches the general rule the code fix applies, is a
-- no-op on any row already fixed (title no longer null), and doesn't
-- special-case a hardcoded UUID for what is, going forward, a general
-- backfill statement. Live data confirmed only one row currently matches
-- this shape; this UPDATE would apply identically to any other that does.
-- Doesn't touch tree_node_id/inbox_item_id-linked tasks — live data checked
-- and found zero rows of those shapes with title still null, so there's
-- nothing to backfill there today.
-- ============================================================================

update ns_tasks
set title = ns_habits.name,
    updated_at = now()
from ns_habits
where ns_tasks.habit_id = ns_habits.id
  and ns_tasks.title is null
  and ns_tasks.tree_node_id is null
  and ns_tasks.inbox_item_id is null;
