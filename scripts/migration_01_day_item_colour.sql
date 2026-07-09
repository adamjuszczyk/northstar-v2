-- ============================================================================
-- Feature 1 — Custom block colours on day items
-- Run this in the Supabase SQL Editor before testing the colour picker.
-- ============================================================================

alter table ns_day_items
add column colour text;

-- Cosmetic only — deliberately no CHECK constraint tying it to a fixed enum,
-- since the curated palette lives in the app (src/lib/blockColours.ts) and
-- may grow without a migration. NULL = no colour (default surface, no
-- special treatment).
