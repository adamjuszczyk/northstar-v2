-- ============================================================================
-- Northstar v2 — RLS verification query
-- Run this in the Supabase SQL Editor. It reports, for each ns_* table:
--   - whether row-level security is enabled at all
--   - which policies exist, for which command, and their USING/WITH CHECK
--     expressions
-- It does not change anything.
-- ============================================================================

with target_tables as (
  select unnest(array[
    'ns_day_items',
    'ns_inbox_items',
    'ns_tree_nodes',
    'ns_week_focus',
    'ns_month_focus'
  ]) as tablename
)
select
  t.tablename,
  c.relrowsecurity  as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  p.policyname,
  p.cmd             as policy_command,
  p.roles,
  p.qual            as using_expression,
  p.with_check      as with_check_expression
from target_tables t
left join pg_class c
  on c.relname = t.tablename
 and c.relnamespace = 'public'::regnamespace
left join pg_policies p
  on p.tablename = t.tablename
 and p.schemaname = 'public'
order by t.tablename, p.cmd;

-- ── How to read the output ──────────────────────────────────────────────────
-- 1. `rls_enabled` must be `true` for every table. If it's `false` (or the
--    table exists with no matching pg_class row at all), any authenticated
--    user can read/write every row via the public anon key — this is a
--    critical gap. Fix: run scripts/enforce_rls.sql.
-- 2. Every table should have at minimum 4 policy rows (or one ALL-command
--    policy) covering select/insert/update/delete, each scoped by
--    `auth.uid() = user_id`. A table with `rls_enabled = true` but zero
--    policy rows blocks ALL access (fails closed) — check the app doesn't
--    silently 403 in that case.
-- 3. A missing table (all right-hand columns null) means the table doesn't
--    exist yet in this project, or exists under a different schema.
