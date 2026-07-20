-- ============================================================================
-- Feature — Weekly/monthly task pools (planning UX overhaul, Features 3-5)
-- Run this in the Supabase SQL Editor.
--
-- Links a ns_day_items row back to the ns_week_focus / ns_month_focus row it
-- was "pulled" from. This is the one uniform way to compute "available vs
-- pulled" for every focus item — tree, inbox, habit, AND standalone — since
-- standalone focus items have no other reference id a day item could match
-- against.
-- ============================================================================

alter table ns_day_items
  add column if not exists origin_week_focus_id uuid references ns_week_focus(id) on delete set null;

alter table ns_day_items
  add column if not exists origin_month_focus_id uuid references ns_month_focus(id) on delete set null;

create index if not exists ns_day_items_origin_week_focus_idx on ns_day_items (origin_week_focus_id);
create index if not exists ns_day_items_origin_month_focus_idx on ns_day_items (origin_month_focus_id);
