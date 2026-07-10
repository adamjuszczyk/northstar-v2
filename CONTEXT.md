# Northstar v2 — Claude Context
*Read this first. Then read SPEC.md, TASKS.md, AUDIT.md.*

---

## What this app is
A personal life planning PWA. Goal tree (Vision/Goal/Project/Task, 
any nesting), Inbox capture, Day/Week/Month planning views, 
Habit tracking, and a daily journal. Single user, Supabase backend, 
shared project with Overload v2.

---

## Current state
**Deployed:** Yes — Vercel (northstar-v2)
**Auth:** Supabase email/password, same credentials as Overload v2

All core features built and working:
- Goal tree with horizontal branching connectors, dual mode 
  (tree + list toggle), drag reparenting with circular reference 
  detection, node picker fallback
- Inbox with capture, schedule, promote to tree, carried-over 
  section for unfinished day tasks, edit sheet (content-only), 
  and direct completion (checkbox → strikethrough + DONE badge, 
  moves to PROCESSED, independent of tree/day propagation)
- Day view: schedule mode (timeline + floating pool) and list mode, 
  any date (forward planning), priority colours, custom block colours, 
  week/month focus reminder widget, daily journal (collapsible)
- Week and month views with focus items
- Habit tracking: build/reduce modes, trend charts, tree node linking, 
  auto-add to day/week/month, manual logging
- Settings: dark/light mode, accent colour switcher, week start
- PWA: offline inbox capture, offline day item completion, sync queue
- Mobile: optimised day view (tap to expand items, collapsible pool), 
  dual-mode tree (tree/list toggle)

---

## Tech stack
- React 18, TypeScript, Vite, vite-plugin-pwa
- CSS Modules + tokens.css (all colours as CSS custom properties)
- Supabase JS v2 (auth + database)
- TanStack Query v5 (server state)
- Dexie v4 (offline cache, IndexedDB v4)
- @dnd-kit (drag and drop — tree reordering and reparenting)
- date-fns
- React Router v6

---

## Database tables (all ns_ prefixed)
ns_tree_nodes, ns_inbox_items, ns_day_items, ns_week_focus, 
ns_month_focus, ns_journal_entries, ns_habits, ns_habit_entries

RLS enabled and verified on all tables.

---

## Key files
- SPEC.md — product source of truth
- TASKS.md — technical architecture and data models
- AUDIT.md — Fable 5 audit findings, fixed and deferred items
- tokens.css — all CSS custom properties, single source of truth for colours
- src/lib/db.ts — Dexie schema (version 4)
- src/lib/supabase.ts — Supabase client

---

## Active work
Nothing active. Two inbox fixes shipped (July 10, 2026):
- Edit inbox items: `InboxItemEditor.tsx` — content-only edit sheet,
  opened via the "Edit" action in the item's action panel.
- Complete inbox items directly: checkbox on each `InboxItem` row,
  independent of tree/day propagation (see rule below).

**Pending manual step:** run `scripts/migration_08_inbox_completed.sql`
in the Supabase SQL Editor — adds `ns_inbox_items.is_completed`.
Until it's run, the checkbox UI works but the Supabase read/write
calls 400 (missing column), same failure mode as any unrun migration
in this project. Verified this in the live preview: build/typecheck
are clean, but the actual complete/uncomplete toggle needs the column.

Next: run the migration, then use in real life, collect feedback, plan v3.

---

## Known issues
See AUDIT.md deferred section for full list.
Most critical deferred items:
- A6: no error boundary (white screen on render throw)
- E3: scheduling to past allowed (no min date on inbox picker)
- P3: 698KB single JS chunk (no code splitting)

---

## Rules for this codebase
- All colours via CSS custom properties only — no hardcoded hex anywhere
- Server state in TanStack Query only — never in component state
- All Supabase tables prefixed ns_
- Dexie version must be bumped when schema changes
- Mobile changes inside breakpoints only — never touch desktop layout

---

## How to start a Claude Code session
1. Read this file
2. Read SPEC.md
3. Read TASKS.md
4. Read AUDIT.md
5. Then read any specific files relevant to the task
6. Update this file at the end of the session
