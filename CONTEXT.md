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
  detection, node picker fallback, note icon on any node with a 
  non-empty note (tap to expand inline, no modal)
- Inbox with capture, schedule, promote to tree, carried-over 
  section for unfinished day tasks, edit sheet (content-only), 
  direct completion (checkbox → strikethrough + DONE badge, 
  moves to PROCESSED, independent of tree/day propagation), 
  filter bar (All/Unassigned/Scheduled·not done/Promoted/Completed, 
  component state only), and custom-styled day/week/month pickers 
  (`src/components/pickers/`) with quick chips (Today/Tomorrow, 
  This week/Next week, This month/Next month) ahead of the full picker
- Day view: schedule mode (timeline + floating pool) and list mode, 
  any date (forward planning), priority colours, custom block colours, 
  week/month focus reminder widget, daily journal (collapsible), 
  x_per_day habit counter items ("0 / 2", tap to increment)
- Week and month views with focus items, correct title resolution 
  for every source including inbox-scheduled items
- Habit tracking: build modes (daily/weekly/x_per_week/x_per_day) 
  and a deliberately minimal reduce mode (name + mode only — no 
  frequency, no auto-add, no target), trend charts, tree node 
  linking (build only), auto-add to day/week/month, manual logging
- Settings: dark/light mode, accent colour switcher, week start
- PWA: offline inbox capture, offline day item completion, sync queue
- Mobile: optimised day view (tap to expand items, collapsible pool, 
  expanded clusters grow to full height instead of inner-scrolling), 
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
- src/lib/db.ts — Dexie schema (version 6)
- src/lib/supabase.ts — Supabase client
- src/components/pickers/ — custom WeekPicker/DayPicker/MonthPicker,
  gold accent + Space Grotesk headers + JetBrains Mono grids, replace
  the native browser date/week/month inputs in the inbox schedule flow

---

## Active work
**Pending your action:** run `scripts/migration_09_habit_x_per_day.sql`
in the Supabase SQL editor. Until then, creating an `x_per_day` habit
fails with a clear constraint error (confirmed live, no bad data
written) and the day-items offline prefetch silently 400s on the two
new columns (degrades gracefully — the main online query is
unaffected). Everything else in this session is fully live-verified.

Session of July 12, 2026 — 3 fixes + 6 features, all typechecked
(zero errors) and browser-verified against live Supabase data:
- Fixed week/month focus items with `source = 'inbox'` showing
  "(untitled)" — `WeekView.tsx` was missing the inbox lookup in its
  `displayTitle`; `MonthView.tsx` was missing the inbox fetch entirely.
- Replaced the inbox "Schedule to week" day-picker with a real week
  picker (`WeekPicker`) — always stores the canonical Monday.
- Fixed mobile cluster blocks fighting the day view's own scroll —
  expanded clusters now grow to full height (mobile-only; desktop
  unchanged).
- Inbox filter bar (component state, resets on navigation).
- Tree node note icon + inline expand (all node types, always visible
  on mobile, no hover dependency).
- Quick scheduling chips (Today/Tomorrow, This week/Next week, This
  month/Next month) ahead of the full picker in the inbox schedule flow.
- Custom day/week/month pickers replacing native browser inputs.
- Habits: `x_per_day` frequency + day-item counters ("0 / 2", tap to
  increment, logs one `ns_habit_entries` row per tap, reaching target
  marks the item complete) — **needs migration_09, see above**.
- Habits: reduce mode stripped down to name + mode only — no
  frequency, no auto-add, no target. Existing reduce habits with old
  frequency data are untouched in the DB, just ignored by the UI.
- Deleting a scheduled inbox item's day/week/month record now reverts
  `ns_inbox_items.state` back to `'unassigned'` (`maybeRevertInboxItemState`
  in `useInboxItems.ts`, called from `useDeleteDayItem`/
  `useDeleteWeekFocus`/`useDeleteMonthFocus`) — checks the other two
  tables first so an item still scheduled elsewhere isn't wrongly
  reverted. Live-verified on both the day and week delete paths.

One pre-existing bug found but **not fixed** (out of this session's
scope — flag before starting new work nearby):
- The 7-day mini-grid inside Week/Month view (`useDayItemsSummary.ts`)
  never resolves habit-sourced day items — shows "Untitled" for any
  anchored habit item. Different bug from the one fixed above (that
  was the week/month *focus list*, not this day-item preview grid).
  `resolveEventTitle` in `WeekView.tsx` needs a habitId branch, and
  `useDayItemsSummary.ts` needs to fetch `habit_id` in the first place.

Next: run migration_09, use in real life, collect feedback, plan v3.

---

## Known issues
See AUDIT.md deferred section for full list.
Most critical deferred items:
- A6: no error boundary (white screen on render throw) — hit this
  directly during this session (an uninitialized picker value crashed
  through a raw `parseISO('')`); fixed the crash's cause, but the
  underlying gap (any render throw anywhere still white-screens) is
  still open.
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
