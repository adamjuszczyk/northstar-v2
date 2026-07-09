-- ============================================================================
-- Feature 6 — Simple daily journal
-- Run this in the Supabase SQL Editor.
-- ============================================================================

create table ns_journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  content text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date)
);

alter table ns_journal_entries enable row level security;

create policy "Users own their journal entries"
  on ns_journal_entries for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
