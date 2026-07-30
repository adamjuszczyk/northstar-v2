-- ============================================================================
-- Feature — Inbox Notes vs Tasks split (v3 Phase 2, SPEC §6.3 / TASKS.md §3.6)
-- Run this in the Supabase SQL Editor.
--
-- Adds a `kind` discriminator to ns_inbox_items. Every existing row defaults
-- to 'task' — correct, since every row that exists today is schedulable and
-- promotable, which is exactly what 'task' means. Notes are a new capture
-- kind with no state, no scheduling, no promotion: `state`, `promoted_node_id`,
-- `carried_over`, `is_completed` are simply unused when kind = 'note' — left
-- nullable-by-default rather than constrained, since adding CHECK constraints
-- tying them to kind would require a table rewrite for no behavioural gain
-- on a single-user app.
-- ============================================================================

alter table ns_inbox_items
  add column if not exists kind text not null default 'task' check (kind in ('task', 'note'));

create index if not exists ns_inbox_items_user_kind_idx on ns_inbox_items (user_id, kind);
