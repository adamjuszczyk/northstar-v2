-- ============================================================================
-- Feature — Task Lists & Split (v3 Phase 4, SPEC §5.3 / TASKS.md §3.3)
-- Run this in the Supabase SQL Editor.
--
-- CORRECTED (session 10) — the first version of this script failed on
-- Supabase with "constraint 'day_standalone_needs_title' of relation
-- 'ns_day_items' does not exist". Investigated before rewriting anything:
--
--   1. No constraint named day_standalone_needs_title / day_tree_needs_node
--      / day_inbox_needs_item / week_standalone_needs_title /
--      month_standalone_needs_title exists on the live tables under those
--      names — the DROP CONSTRAINT statement for the first of these was
--      simply wrong. Grepped every other migration file in scripts/ for
--      these five names — zero hits outside this file, so nothing else
--      ever dropped or renamed them either; they just were never created
--      under this name in the first place. TASKS-v2.md (where these names
--      come from) is a recovered planning document, not a guarantee that
--      every constraint it describes was actually executed against the
--      live DB — these particular business-rule constraints look like
--      they were never added at the DB layer, likely because the same
--      rule ("standalone needs a title") is already enforced client-side
--      (DayItemForm.tsx's isValid()) and was never duplicated in SQL.
--      Could not query pg_constraint directly to fully confirm this (no
--      service-role key or DB access this session, only the anon key) —
--      if you want to verify, run:
--        select conname, pg_get_constraintdef(oid)
--        from pg_constraint
--        where conrelid in ('ns_day_items'::regclass, 'ns_week_focus'::regclass, 'ns_month_focus'::regclass)
--          and contype = 'c';
--      in the SQL editor. If a constraint enforcing "standalone needs
--      title" turns up under some OTHER name, this script won't touch it —
--      you'd need one extra `drop constraint <real name>` to fully retire
--      it (this script's own constraint is additive/safe either way, it
--      just wouldn't be the one actually blocking anything).
--   2. Checked whether anything else from the failed run partially
--      applied, via the anon-key REST API (schema-existence errors are
--      visible without auth, even though RLS blocks row access): ns_tasks
--      and ns_task_steps do NOT exist, and ns_day_items.task_id /
--      ns_week_focus.task_id / ns_month_focus.task_id do NOT exist either.
--      Nothing applied — consistent with Supabase's SQL editor running a
--      pasted multi-statement script as one implicit transaction, so the
--      constraint error rolled back everything before it too, including
--      the table/column creation earlier in the script that would
--      otherwise have succeeded on its own.
--
-- CORRECTED AGAIN (session 11) — the naming issue above was fixed, but
-- re-running then failed differently: a genuine CHECK CONSTRAINT
-- VIOLATION when adding day_inbox_needs_item, because 4 existing
-- ns_day_items rows have source = 'inbox' with inbox_item_id, title, and
-- every other link column null (confirmed by Adam via direct query) — a
-- day item that used to reference an inbox item later deleted out from
-- under it, with nothing cleaning up the row or its stale 'inbox' label
-- when that happened. Adam confirmed these 4 rows carry no recoverable
-- information; deleted below, narrowly, not relabelled or backfilled.
--
-- Root cause (investigated separately from the fix, not changed here —
-- see CONTEXT.md session 11 for the full account): ns_day_items.inbox_
-- item_id references ns_inbox_items(id) — TASKS-v2.md documents this FK
-- as ON DELETE CASCADE, but these 4 rows surviving with inbox_item_id
-- set to null rather than being removed entirely is only possible if the
-- LIVE fk is actually ON DELETE SET NULL. `useDeleteInboxItem`
-- (useInboxItems.ts) has no cleanup logic for dependent day_items/
-- week_focus/month_focus/tasks rows — unlike the reverse direction
-- (deleting a SCHEDULE record already reverts the inbox item's state via
-- maybeRevertInboxItemState), deleting the INBOX ITEM itself does nothing
-- but rely on the FK to quietly null out the link. This will keep
-- happening — for future inbox-linked rows, and now for ns_tasks rows
-- too (ns_tasks.inbox_item_id is ALSO on delete cascade in this same
-- migration, meaning deleting an inbox item that's been materialized
-- into a task would cascade-delete the task and every occurrence
-- referencing it, silently — a different and arguably worse failure mode
-- than an orphaned label). Flagged as a follow-up, not fixed here.
--
-- The evidence also indirectly shows day_standalone_needs_title and
-- day_tree_needs_node did NOT fail when this migration last ran (the
-- reported error was specifically on day_inbox_needs_item, which comes
-- after both of those in this file) — meaning no rows currently violate
-- either of those two. day_standalone_needs_title isn't checked for an
-- orphan pattern below at all: a standalone row has no linked entity to
-- begin with, so there's no "the link was deleted out from under it"
-- mechanism that could produce one, structurally, unlike tree/inbox/
-- habit-sourced rows. day_tree_needs_node's cleanup below is added
-- defensively anyway (the same narrow shape, same reasoning) since it
-- was explicitly asked for and is a no-op if nothing matches. The
-- ns_week_focus/ns_month_focus constraint blocks were never reached by
-- the failed run at all (they come after the one that errored), so there
-- is no evidence either way for those two — cleaned up with the same
-- narrow, defensive pattern, and a preview query is included below so
-- Adam can check first rather than discover it via another failed run.
--
-- Every statement below is now idempotent — IF EXISTS / IF NOT EXISTS
-- throughout, or an equivalent DO block for the handful of things Postgres
-- doesn't support that syntax on directly (CREATE POLICY, and the four
-- "needs X" constraints, which are now guarded by an explicit pg_constraint
-- existence check instead of assumed to exist) — so this script is safe to
-- run regardless of what did or didn't survive from the failed attempt, and
-- safe to re-run if it fails partway through again for any other reason.
-- The cleanup DELETEs are naturally idempotent too — narrowly scoped by
-- WHERE clause, so re-running finds nothing left to match.
--
-- Optional preview — run this first if you want to see what the cleanup
-- below will remove before it runs, across every pattern (not just the
-- one Adam already confirmed):
--   select 'ns_day_items:inbox' as pattern, count(*) from ns_day_items
--     where source = 'inbox' and inbox_item_id is null and title is null
--       and tree_node_id is null and habit_id is null
--   union all
--   select 'ns_day_items:tree', count(*) from ns_day_items
--     where source = 'tree' and tree_node_id is null and title is null
--       and inbox_item_id is null and habit_id is null
--   union all
--   select 'ns_week_focus:standalone', count(*) from ns_week_focus
--     where source = 'standalone' and title is null and tree_node_id is null
--       and inbox_item_id is null and habit_id is null
--   union all
--   select 'ns_month_focus:standalone', count(*) from ns_month_focus
--     where source = 'standalone' and title is null and tree_node_id is null
--       and inbox_item_id is null and habit_id is null;
-- Any row this returns that ISN'T one of these exact all-null shapes
-- needs eyes on it before deleting — stop and report it rather than
-- widening any of the DELETEs below to cover it.
--
-- CORRECTED AGAIN (session 12) — caught before this migration ever went
-- live, not from a failure: ns_tasks.tree_node_id / inbox_item_id /
-- habit_id were all ON DELETE CASCADE. Since ns_day_items.task_id /
-- ns_week_focus.task_id / ns_month_focus.task_id all CASCADE from
-- ns_tasks(id) (correctly — an occurrence without its task is
-- meaningless), a materialized task's own link columns cascading too
-- meant deleting, say, an inbox item behind a materialized task would
-- silently delete the task AND every occurrence referencing it via
-- task_id — real scheduled work disappearing because of an unrelated
-- inbox cleanup. Changed all three to ON DELETE SET NULL: a task that's
-- taken on independent life (steps, or a split) should detach from a
-- deleted source, not die with it.
--
-- This isn't just the FK action, though — the three "needs X" CHECK
-- constraints on ns_tasks had to loosen too (see the inline comment
-- above the CREATE TABLE), or the SET NULL itself would fail: a FK's
-- SET NULL action is an UPDATE under the hood, and that UPDATE still has
-- to satisfy every constraint on the row. A tree-sourced task's
-- tree_node_id going null while source stays 'tree' would violate the
-- original strict constraint, so deleting the tree node would error out
-- instead of cleanly detaching. Loosened to accept `title is not null`
-- as an alternative — which means a detached task with no title of its
-- own still shows "Untitled" (nothing left to resolve through) until
-- something snapshots a title onto it before the source disappears.
-- That's a real, known gap, not silently swept under — it's the same
-- shape of problem as the ns_day_items orphans this migration already
-- cleans up, just one level up the identity chain, and it's rolled into
-- the same follow-up already flagged (task_65110056) rather than a new
-- one, since it's the same underlying gap: nothing currently runs
-- cleanup/snapshot logic when a tree node, inbox item, or habit that's
-- backing a materialized task gets deleted.
--
-- ns_day_items.task_id / ns_week_focus.task_id / ns_month_focus.task_id
-- themselves are UNCHANGED — still ON DELETE CASCADE from ns_tasks(id).
-- That direction is correct as-is: an occurrence with no task behind it
-- is meaningless, so if a task is ever actually deleted (no app code
-- path does this today), its occurrences should go with it, not become
-- new orphans of their own.
--
-- ns_tasks: the shared task entity. Created LAZILY — a day item with
-- task_id = null behaves exactly as it does today (every existing row,
-- and every plain one-off task created from here on). A task body is only
-- materialized at one of two moments: the first step is added, or the item
-- is split (scheduled into a second time slot the same day). No backfill.
--
-- ns_task_steps: an ordered checklist belonging to a task. Progress carries
-- over automatically — every occurrence renders steps.filter(not done) in
-- position order, so there's no per-occurrence pointer to keep in sync.
--
-- ns_day_items.task_id: non-null = this row is one occurrence of a shared
-- task. Identity resolution rule: when task_id is set, the occurrence's own
-- title/tree_node_id/inbox_item_id/habit_id are left null and ignored —
-- display title and source resolve through the task instead. `source` is
-- kept populated (mirrors the task's source at materialization time) so
-- existing source-badge rendering keeps working unchanged.
--
-- ns_week_focus.task_id / ns_month_focus.task_id: this session's fix for
-- TaskSourceForm's copy-not-link workaround (deferred from Phase 1). The
-- Tasks-section "add from tree/inbox" flow now creates a real ns_tasks
-- link instead of copying title text. The focus row's own `source` column
-- stays 'standalone' deliberately — that's what keeps it classified under
-- the Tasks section rather than Goals (the Goals/Tasks split is computed
-- purely from `source`); the task's OWN `source` field carries the real
-- tree/inbox provenance for completion propagation and badge display.
--
-- Every "needs X" CHECK constraint below is loosened to also accept
-- task_id is not null, alongside its original field — a task-linked row
-- satisfies the constraint through the task instead of through its own
-- now-nulled fields.
-- ============================================================================

-- ── ns_tasks ─────────────────────────────────────────────────────────────

create table if not exists ns_tasks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  source         text not null check (source in ('standalone', 'tree', 'inbox', 'habit')),
  title          text,                                -- required when source = 'standalone'
  -- ON DELETE SET NULL, not CASCADE (session 12) — a materialized task
  -- (has steps, or has been split) has taken on a life independent of
  -- whatever tree node / inbox item / habit originated it. Deleting that
  -- source should detach the link, not destroy the task and, via the
  -- CASCADE on ns_day_items/ns_week_focus/ns_month_focus.task_id below,
  -- every occurrence referencing it. See the migration header comment for
  -- the full reasoning, including why the three "needs X" constraints
  -- below had to change too — SET NULL alone isn't enough.
  tree_node_id   uuid references ns_tree_nodes(id)  on delete set null,
  inbox_item_id  uuid references ns_inbox_items(id) on delete set null,
  habit_id       uuid references ns_habits(id)      on delete set null,
  notes          text,
  is_complete    boolean not null default false,    -- derived from steps when steps exist
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint task_standalone_needs_title check (source != 'standalone' or title is not null),
  -- Loosened to also accept title is not null (session 12) — required
  -- for the ON DELETE SET NULL above to actually work. Without this, the
  -- FK's SET NULL action is itself an UPDATE that must satisfy every
  -- constraint on the row; a tree-sourced task's tree_node_id going null
  -- while source stays 'tree' would violate the original (strict) form
  -- of this constraint, which would make the SET NULL fail — meaning
  -- deleting the tree node would error out instead of cleanly detaching.
  -- The tradeoff: a detached task with no title of its own still resolves
  -- to "Untitled" (resolveTaskTitle has nothing left to resolve through)
  -- until something snapshots a title onto it before the source is gone —
  -- flagged as part of the same follow-up as the ns_day_items orphan
  -- cleanup's root cause (task_65110056), not fixed here.
  constraint task_tree_needs_node        check (source != 'tree'       or tree_node_id  is not null or title is not null),
  constraint task_inbox_needs_item       check (source != 'inbox'      or inbox_item_id is not null or title is not null),
  constraint task_habit_needs_habit      check (source != 'habit'      or habit_id      is not null or title is not null)
);
alter table ns_tasks enable row level security;

drop policy if exists "Users own their tasks" on ns_tasks;
create policy "Users own their tasks"
  on ns_tasks for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists ns_tasks_user_idx on ns_tasks (user_id);

-- ── ns_task_steps ────────────────────────────────────────────────────────

create table if not exists ns_task_steps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  task_id     uuid not null references ns_tasks(id) on delete cascade,
  content     text not null,
  position    integer not null default 0,
  is_done     boolean not null default false,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table ns_task_steps enable row level security;

drop policy if exists "Users own their task steps" on ns_task_steps;
create policy "Users own their task steps"
  on ns_task_steps for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists ns_task_steps_task_position_idx on ns_task_steps (task_id, position);
create index if not exists ns_task_steps_user_idx on ns_task_steps (user_id);

-- ── ns_day_items.task_id ─────────────────────────────────────────────────

alter table ns_day_items
  add column if not exists task_id uuid references ns_tasks(id) on delete cascade;

create index if not exists ns_day_items_task_id_idx on ns_day_items (task_id);

-- Clean up orphaned rows before adding constraints that would reject them.
-- Narrowly scoped to the exact empty shape — no title, no link of any
-- kind — so this only ever removes rows that carry no recoverable
-- information; anything that doesn't match exactly is left alone (and
-- would surface as a constraint-violation error below instead of being
-- silently deleted).

-- CONFIRMED (session 11, Adam via direct query): 4 rows, source =
-- 'inbox', every link column and title null — the inbox item they used
-- to reference was deleted out from under them (see the root-cause note
-- above). No recoverable information; delete, don't relabel or backfill.
delete from ns_day_items
where source = 'inbox'
  and inbox_item_id is null
  and title is null
  and tree_node_id is null
  and habit_id is null
  and task_id is null;

-- DEFENSIVE, not confirmed — same shape, for the equivalent tree case.
-- Evidence suggests this is currently a no-op (day_tree_needs_node did
-- not fail when this migration last ran, which it would have if any row
-- violated it), but checked anyway since it was asked for and costs
-- nothing if empty.
delete from ns_day_items
where source = 'tree'
  and tree_node_id is null
  and title is null
  and inbox_item_id is null
  and habit_id is null
  and task_id is null;

-- Loosen (or, if it turns out it never existed under this name — see the
-- investigation note above — simply create) each "needs X" business-rule
-- constraint so a task-linked row satisfies it via task_id instead of its
-- own now-nulled field. Guarded by an explicit existence check rather than
-- assumed, in both directions, so this is safe whether the constraint:
-- (a) exists with the old, too-strict definition, (b) never existed at
-- all, or (c) was already corrected by a previous partial run of this file.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'ns_day_items'::regclass and conname = 'day_standalone_needs_title'
  ) then
    alter table ns_day_items drop constraint day_standalone_needs_title;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'ns_day_items'::regclass and conname = 'day_standalone_needs_title'
  ) then
    alter table ns_day_items add constraint day_standalone_needs_title
      check (source != 'standalone' or title is not null or task_id is not null);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'ns_day_items'::regclass and conname = 'day_tree_needs_node'
  ) then
    alter table ns_day_items drop constraint day_tree_needs_node;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'ns_day_items'::regclass and conname = 'day_tree_needs_node'
  ) then
    alter table ns_day_items add constraint day_tree_needs_node
      check (source != 'tree' or tree_node_id is not null or task_id is not null);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'ns_day_items'::regclass and conname = 'day_inbox_needs_item'
  ) then
    alter table ns_day_items drop constraint day_inbox_needs_item;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'ns_day_items'::regclass and conname = 'day_inbox_needs_item'
  ) then
    alter table ns_day_items add constraint day_inbox_needs_item
      check (source != 'inbox' or inbox_item_id is not null or task_id is not null);
  end if;
end $$;

-- ── ns_week_focus.task_id (TaskSourceForm copy-not-link fix) ────────────

alter table ns_week_focus
  add column if not exists task_id uuid references ns_tasks(id) on delete cascade;

create index if not exists ns_week_focus_task_id_idx on ns_week_focus (task_id);

-- DEFENSIVE, not confirmed — this constraint block was never reached by
-- the failed run (day_inbox_needs_item above errored first), so there is
-- no direct evidence either way. Same narrow empty-shape cleanup as
-- ns_day_items above, applied preventatively.
delete from ns_week_focus
where source = 'standalone'
  and title is null
  and tree_node_id is null
  and inbox_item_id is null
  and habit_id is null
  and task_id is null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'ns_week_focus'::regclass and conname = 'week_standalone_needs_title'
  ) then
    alter table ns_week_focus drop constraint week_standalone_needs_title;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'ns_week_focus'::regclass and conname = 'week_standalone_needs_title'
  ) then
    alter table ns_week_focus add constraint week_standalone_needs_title
      check (source != 'standalone' or title is not null or task_id is not null);
  end if;
end $$;

-- ── ns_month_focus.task_id (TaskSourceForm copy-not-link fix) ───────────

alter table ns_month_focus
  add column if not exists task_id uuid references ns_tasks(id) on delete cascade;

create index if not exists ns_month_focus_task_id_idx on ns_month_focus (task_id);

-- DEFENSIVE, not confirmed — same reasoning as ns_week_focus above.
delete from ns_month_focus
where source = 'standalone'
  and title is null
  and tree_node_id is null
  and inbox_item_id is null
  and habit_id is null
  and task_id is null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'ns_month_focus'::regclass and conname = 'month_standalone_needs_title'
  ) then
    alter table ns_month_focus drop constraint month_standalone_needs_title;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'ns_month_focus'::regclass and conname = 'month_standalone_needs_title'
  ) then
    alter table ns_month_focus add constraint month_standalone_needs_title
      check (source != 'standalone' or title is not null or task_id is not null);
  end if;
end $$;
