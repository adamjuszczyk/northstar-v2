-- ============================================================================
-- Feature — Habits: x_per_day frequency + day-item counters
-- Run this in the Supabase SQL Editor.
-- ============================================================================

-- Allow 'x_per_day' as a build-habit frequency type
alter table ns_habits drop constraint ns_habits_frequency_type_check;
alter table ns_habits add constraint ns_habits_frequency_type_check
  check (frequency_type in ('daily', 'weekly', 'x_per_week', 'x_per_day'));

-- Counter fields for auto-added x_per_day day items ("0 / 2" progress)
alter table ns_day_items
add column if not exists counter_current
  integer not null default 0;
alter table ns_day_items
add column if not exists counter_target
  integer;
