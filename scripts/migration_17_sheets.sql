-- ============================================================================
-- Feature -- Sheets (v3 Phase 7, SPEC section 5.5 / TASKS.md section 3.5)
-- Run this in the Supabase SQL Editor.
--
-- ns_sheets: a separate tree structure, either fully detached
-- (anchor_node_id null) or anchored to a node in the main tree.
-- ns_sheets_anchor_unique enforces at most one sheet per anchor node.
--
-- ns_tree_nodes.sheet_id: null = lives in the main tree; non-null = lives
-- inside that sheet's own canvas. This is the ONLY new column -- parent_id
-- is never rewritten by any Sheets operation, ever:
--   - Launching a sheet from a node sets sheet_id on every DESCENDANT of
--     that node. The anchor node itself keeps sheet_id = null and stays in
--     the main tree, parent_id chains on the moved descendants untouched.
--   - Attaching a detached sheet to a node sets ns_sheets.anchor_node_id
--     only -- a navigational link, not a structural reparent.
--   - Dissolving a sheet clears sheet_id back to null on every node that
--     had it, then deletes the ns_sheets row -- the subtree snaps back
--     under its anchor for free, because parent_id was never touched.
-- All of this application logic lives in src/hooks/useSheets.ts, not here.
--
-- Brand-new table + one new column, so -- same as migration 16 -- there is
-- no risk of a constraint/policy already existing under a different shape.
-- Still written idempotently (IF NOT EXISTS / drop-then-create policy,
-- guarded column add) so this is safe to re-run, per project convention.
-- ============================================================================

create table if not exists ns_sheets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  anchor_node_id uuid references ns_tree_nodes(id) on delete set null,
  position       integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table ns_sheets enable row level security;

drop policy if exists "Users own their sheets" on ns_sheets;
create policy "Users own their sheets"
  on ns_sheets for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists ns_sheets_user_idx on ns_sheets (user_id);

-- At most one sheet per anchor node -- a node can't be the anchor of two
-- sheets at once. Partial index (where clause) so any number of detached
-- sheets (anchor_node_id null) can coexist without tripping this.
create unique index if not exists ns_sheets_anchor_unique
  on ns_sheets (anchor_node_id) where anchor_node_id is not null;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ns_tree_nodes' and column_name = 'sheet_id'
  ) then
    alter table ns_tree_nodes
      add column sheet_id uuid references ns_sheets(id) on delete set null;
  end if;
end $$;

create index if not exists ns_tree_nodes_user_sheet_idx on ns_tree_nodes (user_id, sheet_id);
