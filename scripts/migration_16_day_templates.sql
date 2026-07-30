-- ============================================================================
-- Feature -- Day Templates (v3 Phase 5, SPEC section 5.4 / TASKS.md section 3.4)
-- Run this in the Supabase SQL Editor.
--
-- ns_day_templates: a named, reusable layout -- just a name + position.
--
-- ns_day_template_items: one child table with a kind discriminator
-- ('line' | 'block') rather than two parallel tables, matching the house
-- pattern already used on ns_day_items -- the template is one ordered list,
-- which is how it is edited and how it renders. end_time is required for
-- blocks, forbidden for lines (mirrors ns_blocks / ns_lines own shapes).
--
-- Applying a template is a one-time STAMP, never a live link (SPEC 5.4):
-- no template_id column exists on ns_lines/ns_blocks, so applying just
-- bulk-inserts plain rows there and editing the template afterward never
-- touches a day that already applied it. That insert logic lives in the
-- app (useApplyDayTemplate, src/hooks/useDayTemplates.ts), not here.
--
-- Brand-new tables, so unlike migrations 13/14 there is no risk of a
-- constraint or policy already existing under a different shape -- no
-- pg_constraint guard blocks are needed. Still written idempotently
-- (IF NOT EXISTS / drop-then-create policy) so this is safe to re-run,
-- per project convention.
-- ============================================================================

create table if not exists ns_day_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table ns_day_templates enable row level security;

drop policy if exists "Users own their day templates" on ns_day_templates;
create policy "Users own their day templates"
  on ns_day_templates for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists ns_day_templates_user_idx on ns_day_templates (user_id);

create table if not exists ns_day_template_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references ns_day_templates(id) on delete cascade,
  kind        text not null check (kind in ('line', 'block')),
  label       text not null,
  start_time  time not null,
  end_time    time,
  colour      text,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint tmpl_block_needs_end check (kind != 'block' or end_time is not null),
  constraint tmpl_line_has_no_end check (kind != 'line'  or end_time is null),
  constraint tmpl_block_range     check (end_time is null or end_time > start_time)
);
alter table ns_day_template_items enable row level security;

drop policy if exists "Users own their day template items" on ns_day_template_items;
create policy "Users own their day template items"
  on ns_day_template_items for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists ns_day_template_items_template_position_idx
  on ns_day_template_items (template_id, position);
