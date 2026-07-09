-- ============================================================================
-- Feature — Habit tracking
-- Run this in the Supabase SQL Editor.
-- ============================================================================

-- Habits table
create table ns_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  mode text not null check (mode in ('reduce', 'build')),
  tree_node_id uuid references ns_tree_nodes(id) on delete set null,
  frequency_type text not null check (frequency_type in ('daily', 'weekly', 'x_per_week')),
  frequency_value integer,
  auto_add boolean not null default false,
  auto_add_to text check (auto_add_to in ('day', 'week', 'month')),
  created_at timestamptz default now()
);
alter table ns_habits enable row level security;
create policy "Users own their habits"
  on ns_habits for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index on ns_habits (user_id);

-- Habit entries table
create table ns_habit_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references ns_habits(id) on delete cascade,
  logged_at timestamptz not null default now(),
  note text,
  source text not null default 'manual' check (source in ('manual', 'day_view'))
);
alter table ns_habit_entries enable row level security;
create policy "Users own their habit entries"
  on ns_habit_entries for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index on ns_habit_entries (user_id, habit_id);

-- Add habit source and habit_id to day items
alter table ns_day_items drop constraint ns_day_items_source_check;
alter table ns_day_items add constraint ns_day_items_source_check check (source in ('standalone', 'tree', 'inbox', 'habit'));
alter table ns_day_items add column habit_id uuid references ns_habits(id) on delete cascade;

-- Add habit source and habit_id to week focus — needed so auto_add_to='week'
-- habits can pull into ns_week_focus (the original day-items-only migration
-- didn't cover this, but the week auto-add feature requires it).
alter table ns_week_focus drop constraint ns_week_focus_source_check;
alter table ns_week_focus add constraint ns_week_focus_source_check check (source in ('standalone', 'tree', 'inbox', 'habit'));
alter table ns_week_focus add column habit_id uuid references ns_habits(id) on delete cascade;

-- Add habit source and habit_id to month focus — same reasoning, for
-- auto_add_to='month' habits pulling into ns_month_focus.
alter table ns_month_focus drop constraint ns_month_focus_source_check;
alter table ns_month_focus add constraint ns_month_focus_source_check check (source in ('standalone', 'tree', 'inbox', 'habit'));
alter table ns_month_focus add column habit_id uuid references ns_habits(id) on delete cascade;
