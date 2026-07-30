-- ============================================================================
-- Fix — Blocks are freely named, not typed (SPEC §5.2 correction)
-- Run this in the Supabase SQL Editor.
--
-- migration_12 built ns_blocks.type as a fixed selector ('focused_work' |
-- 'meeting') with a CHECK constraint, plus a separate optional `title` that
-- fell back to the type's label for display. SPEC §5.2 has been corrected:
-- a Block's name was always meant to be freely chosen, not picked from a
-- fixed set — so the two concepts collapse into one required field.
--
-- Reuses the existing `title` column (renamed to `name`) rather than adding
-- a second free-text column alongside it: every existing row's `title` is
-- backfilled from its old `type` value first (so nothing typed by hand is
-- lost, and rows that relied on the type-label fallback get a sensible
-- starting name — "Focused Work" / "Meeting"), then `type` and its CHECK
-- constraint are dropped.
--
-- Every block already uniformly supported optional assigned tasks AND
-- optional freeform notes at the schema level — `notes` was always a plain
-- nullable column, never gated by `type` in the DB. The "notes only for
-- Meeting" gating was app-level only; removing it is a code change, not a
-- migration.
-- ============================================================================

alter table ns_blocks rename column title to name;

update ns_blocks
  set name = case type
    when 'focused_work' then 'Focused Work'
    when 'meeting'      then 'Meeting'
    else initcap(replace(type, '_', ' '))
  end
  where name is null;

alter table ns_blocks
  alter column name set not null;

alter table ns_blocks
  drop constraint if exists ns_blocks_type_check;

alter table ns_blocks
  drop column if exists type;
