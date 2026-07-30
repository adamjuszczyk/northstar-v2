-- ============================================================================
-- Feature — Lines & Blocks (v3 Phase 3, SPEC §5.1/§5.2 / TASKS.md §3.1/§3.2)
-- Run this in the Supabase SQL Editor.
--
-- ns_lines: a named marker at a fixed time. No content, no completion, not a
-- container. Deliberately per-date rows, not a recurring rule — applying a
-- Day Template later is a one-time stamp, not a live link.
--
-- ns_blocks: a typed, scheduled time-range container. Not itself completable
-- — completion lives on whatever's assigned inside it, if anything. This
-- formalises and replaces the existing "custom block colours" behaviour in
-- Day view (ns_day_items.colour is kept alongside it, not dropped — existing
-- data uses it, and a loose anchored item outside any block still benefits).
--
-- Task assignment into a block is an FK on the day item (block_id), not a
-- join table — a day item can be in at most one block. `on delete set null`
-- is deliberate: deleting a block releases its tasks back onto the day
-- rather than destroying them.
-- ============================================================================

create table if not exists ns_lines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  label       text not null,
  time        time not null,
  colour      text,                                -- optional; BLOCK_COLOURS hex
  position    integer not null default 0,          -- tiebreak for lines at the same time
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table ns_lines enable row level security;
create policy "Users own their lines"
  on ns_lines for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists ns_lines_user_date_idx on ns_lines (user_id, date);

create table if not exists ns_blocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  type        text not null check (type in ('focused_work', 'meeting')),
  title       text,                                -- optional label; falls back to the type name
  start_time  time not null,
  end_time    time not null,
  colour      text,                                -- BLOCK_COLOURS hex
  notes       text,                                -- meeting agenda / plan
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint block_end_after_start check (end_time > start_time)
);
alter table ns_blocks enable row level security;
create policy "Users own their blocks"
  on ns_blocks for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists ns_blocks_user_date_idx on ns_blocks (user_id, date);

alter table ns_day_items
  add column if not exists block_id uuid references ns_blocks(id) on delete set null;

create index if not exists ns_day_items_block_id_idx on ns_day_items (block_id);
