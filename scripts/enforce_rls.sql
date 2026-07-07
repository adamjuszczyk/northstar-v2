-- ============================================================================
-- Northstar v2 — RLS enforcement script
-- Idempotent: safe to run any number of times, regardless of current state.
-- Enables RLS and (re)creates the four standard per-user policies on every
-- ns_* table. Run this in the Supabase SQL Editor after reviewing
-- verify_rls.sql output — or just run it directly, since it converges every
-- table to the same correct state no matter what policies exist today.
--
-- Assumes every table has a `user_id uuid` column referencing auth.users(id).
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'ns_day_items',
    'ns_inbox_items',
    'ns_tree_nodes',
    'ns_week_focus',
    'ns_month_focus'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists %I on public.%I;', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id);',
      t || '_select_own', t
    );

    execute format('drop policy if exists %I on public.%I;', t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for insert with check (auth.uid() = user_id);',
      t || '_insert_own', t
    );

    execute format('drop policy if exists %I on public.%I;', t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t || '_update_own', t
    );

    execute format('drop policy if exists %I on public.%I;', t || '_delete_own', t);
    execute format(
      'create policy %I on public.%I for delete using (auth.uid() = user_id);',
      t || '_delete_own', t
    );
  end loop;
end $$;

-- Re-run scripts/verify_rls.sql afterwards to confirm every table now shows
-- rls_enabled = true and 4 policy rows (select/insert/update/delete).
