-- ============================================================================
-- Feature 4 — Unfinished standalone tasks carry to inbox
-- Run this in the Supabase SQL Editor before testing the carry-over sweep.
-- ============================================================================

alter table ns_inbox_items
add column carried_over boolean not null default false;
