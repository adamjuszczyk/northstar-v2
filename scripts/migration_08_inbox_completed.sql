-- ============================================================================
-- Feature — Complete inbox items directly (independent of tree/day state)
-- Run this in the Supabase SQL Editor.
-- ============================================================================

alter table ns_inbox_items
add column if not exists is_completed boolean not null default false;
