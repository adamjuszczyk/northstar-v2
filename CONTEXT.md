# Northstar v3 — Claude Context
*Read this first. Then read SPEC.md, TASKS.md, AUDIT.md.*
*(`SPEC-v2.md` / `TASKS-v2.md` are the frozen v2 snapshots — history only,
not the source of truth. Don't plan against them.)*

---

## What this app is
A personal life planning PWA. Goal tree (Vision/Goal/Project/Task,
any nesting), Inbox capture, Day/Week/Month planning views, and
Habit tracking. Single user, Supabase backend, shared project with
Overload v2.

v3 is a feature deepening of the same product, in the same repo — no
rebuild. It adds Lines, Blocks, Task Lists with automatic split, and
Day Templates to make the planner match how a day actually runs;
declutters the Tree with Sheets; narrows Today to just today; splits
Inbox into Notes vs Tasks; and adds a Polish/English toggle.

---

## Where v3 stands
**Planning complete and approved. No v3 implementation code written yet.**

SPEC.md is v3 product spec. TASKS.md is the v3 technical plan —
tech stack, file structure, five new tables, nine implementation
phases, sixteen assumptions. Read it before touching any code; the
data-model decisions in §3 are not obvious from the spec alone.

**Next session starts at TASKS.md Phase 0** (error boundary), then
Phase 1 (nav restructure + Goals rename + Goals screen).

---

## Current state — what's actually built (all of it v2)
**Deployed:** Yes — Vercel (northstar-v2)
**Auth:** Supabase email/password, same credentials as Overload v2

All v2 core features built and working:
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

**Scheduled for deletion in v3 Phase 6** — don't invest in these:
`WeekPoolPanel` (the weekly pull panel), `FocusReminder` (week/month
reminder widget), and `JournalSection` + `useJournalEntry` (the daily
journal, removed from Today *and* Day view). `ns_journal_entries`
keeps its rows — the UI goes, the data stays.

---

## Tech stack
- React 18, TypeScript, Vite, vite-plugin-pwa
- CSS Modules + tokens.css (all colours as CSS custom properties)
- Supabase JS v2 (auth + database)
- TanStack Query v5 (server state)
- Dexie v4 (offline cache, IndexedDB v7)
- @dnd-kit (drag and drop — tree reordering and reparenting)
- date-fns
- React Router v6

v3 adds exactly one thing: a hand-rolled i18n layer in `src/i18n/`
(~80 lines, plus `Intl.PluralRules` for Polish's three plural forms).
Deliberately not `react-i18next` — see TASKS.md §1 for why.

---

## Database tables (all ns_ prefixed)
Live now: ns_tree_nodes, ns_inbox_items, ns_day_items, ns_week_focus,
ns_month_focus, ns_journal_entries, ns_habits, ns_habit_entries

RLS enabled and verified on all tables.

Planned for v3 (migrations 11-15, none written yet): ns_lines,
ns_blocks, ns_tasks, ns_task_steps, ns_day_templates,
ns_day_template_items, ns_sheets — plus new columns on
ns_inbox_items (`kind`), ns_day_items (`block_id`, `task_id`), and
ns_tree_nodes (`sheet_id`). Full DDL in TASKS.md §3.

---

## Key files
- SPEC.md — v3 product source of truth
- TASKS.md — v3 technical architecture, data models, phase order
- SPEC-v2.md / TASKS-v2.md — frozen v2 snapshots (history only)
- AUDIT.md — Fable 5 audit findings, fixed and deferred items
- tokens.css — all CSS custom properties, single source of truth for colours
- src/lib/db.ts — Dexie schema (version 7; v3 goes to v11)
- src/lib/supabase.ts — Supabase client
- src/components/pickers/ — custom WeekPicker/DayPicker/MonthPicker,
  gold accent + Space Grotesk headers + JetBrains Mono grids, replace
  the native browser date/week/month inputs in the inbox schedule flow;
  also TreeNodePicker.tsx (indented list + branching tree view, multi-
  select), the shared tree-node picker used by DayItemForm and
  FocusItemForm (Week/Month "add focus")

---

## Active work

Session of July 27, 2026 — **v3 technical planning. No code written.**
- Read SPEC.md (v3) and wrote **TASKS.md** — the v3 technical plan:
  proposed stack additions, file/folder changes, full data models for
  Lines, Blocks, Tasks + steps + split occurrences, Day Templates,
  Sheets, and the Goals rename; nine-phase implementation order with
  per-phase reasoning; sixteen assumptions.
- **Committed and pushed all five planning docs (commit `5b2910b`).**
  They had never been tracked — `git ls-files` showed only CONTEXT.md.
  SPEC.md/TASKS.md/AUDIT.md were untracked working-tree files, which
  is how v2's SPEC.md got overwritten with no recoverable copy in git.
  Recovered from `design-handoff/project/uploads/Northstar-v2-SPEC.md`
  and snapshotted as `SPEC-v2.md`; v2's TASKS.md copied to
  `TASKS-v2.md` before being overwritten.
- **No `v2-final` tag, deliberately.** SPEC.md at `5b2910b` already
  contains v3 content, so a tag claiming to mark v2 would point at the
  wrong thing. SPEC.md's intro still says v2 "is preserved permanently
  at the `v2-final` git tag" — that line is stale and should be
  reworded to point at `SPEC-v2.md`.
- `migration_10_focus_pool_linking.sql` **has now been run** —
  `origin_week_focus_id` / `origin_month_focus_id` exist on
  ns_day_items. Still needed in v3: retiring `WeekPoolPanel` doesn't
  make them obsolete, since the replacement Week/Month add-tab uses
  them for the same "already pulled" computation.
- Three review questions resolved and locked into TASKS.md:
  **A9** mobile nav — desktop keeps all nine sidebar items, mobile
  shows five (Today / Day / Inbox / Tree / More) with the rest behind
  a `MoreSheet`. Watch: "More" must read as active on the five routes
  hidden behind it, which `NavLink`'s `isActive` won't do by itself.
  **A2** journal section — removed entirely, Today *and* Day view.
  Table and rows kept; UI, hook, and prefetch deleted.
  **A3** week/month focus reminder — removed entirely, both screens.
- Approved as written: lazy `ns_tasks`/`ns_task_steps` for Task Lists
  and Split (`task_id = null` means "behaves exactly as today", task
  body materialized only on first step-add or first split — no
  backfill); `sheet_id`-only Sheets with `parent_id` never rewritten;
  hand-rolled i18n; Phase 0 error boundary; the phase order.

**Biggest known trap in the v3 build** (TASKS.md §3.3): task-linked
day items leave `title`/`tree_node_id`/`inbox_item_id`/`habit_id`
null, so every split task will render "Untitled" in the Week and
Month mini-grids unless `useDayItemsSummary.ts` starts fetching
`task_id` and `resolveEventTitle` gains a task branch — in the *same*
commit as migration 13. This exact failure mode has already shipped
twice (inbox items, July 12; habit items, July 20).

Session of July 20, 2026 — planning UX overhaul, 6 features, typechecked
(zero errors, `npm run build` clean) but **NOT browser-verified** —
Adam chose to skip live verification this session (no login credentials
available to the agent, and it will never enter a password). Smoke-test
before trusting this in daily use — but note `WeekPoolPanel` is being
deleted in v3 Phase 6, so it isn't worth testing:
- **Tree picker redesign** (`src/components/pickers/TreeNodePicker.tsx`,
  new shared component) — replaces every flat tree-node list used for
  "add to day/week/month" with an indented expandable list by default
  (chevron to expand, thin left connector line, type badge, child count
  as "N inside", a dot indicator on any parent with a descendant already
  scheduled in the current period) plus a LIST/TREE toggle in its own
  toolbar that switches to a branching canvas view (reuses `NodeConnector`
  from the main tree for real visual parity, not a re-implementation).
  Selecting a parent never auto-selects children. Wired into both
  `DayItemForm.tsx` (tree tab) and `FocusItemForm.tsx` (tree tab, shared
  by Week and Month views).
- **Multi-select everywhere** — every picker that adds to day/week/month
  now supports selecting several items and confirming once ("Add N
  items"): the tree tab (via `TreeNodePicker`), the inbox tab, and the
  habit tab in `DayItemForm.tsx`; the tree tab in `FocusItemForm.tsx`.
  New bulk-insert hooks: `useCreateDayItems`, `useAddInboxItemsToDay`,
  `useCreateWeekFocusMany`, `useCreateMonthFocusMany` — one round trip
  per batch, not N sequential inserts.
- **Weekly pool in day view** (`WeekPoolPanel.tsx`) — collapsible "THIS
  WEEK" panel in `DayView.tsx`, visible in both schedule and list modes,
  listing every `ns_week_focus` item for the current week (tree/inbox/
  habit/standalone, all sources). Available items show a pull button;
  pulled items show which day(s) they went to. Collapsed by default if
  empty, expanded if it has items. **→ deleted in v3 Phase 6.**
- **Tasks this week / this month** — new standalone-only sections below
  the existing WEEKLY FOCUS / MONTHLY FOCUS lists in `WeekView.tsx` and
  `MonthView.tsx` (`ns_week_focus`/`ns_month_focus` rows with
  `source = 'standalone'`), each with its own inline quick-add (title
  only, no tree link), a pulled-day indicator, an inline "pull to today"
  button (disabled if today isn't in the displayed week/month), and the
  existing complete/delete controls.
- **Pulled-state tracking design decision:** rather than matching a day
  item back to its source by `tree_node_id`/`inbox_item_id`/`habit_id`
  (which doesn't work for standalone tasks — no reference id to match),
  every pull sets a direct FK link: `ns_day_items.origin_week_focus_id`
  / `origin_month_focus_id` → the exact focus row it came from. One
  uniform "available vs pulled" computation across every source.
  Confirmed with Adam before writing the migration. v3 keeps this.
- **Bonus fix while in the area:** `WeekView.tsx`'s 7-day mini-grid was
  showing "Untitled" for habit-sourced day items (flagged as known-but-
  deferred in the previous session's notes) — `resolveEventTitle` was
  missing a `habitId` branch and `useDayItemsSummary.ts` wasn't fetching
  `habit_id` at all. Fixed both, now that `DayItemSummaryRow` needed
  `habitId` anyway for the pull-tracking work above.
- Dexie bumped to v7 (`originWeekFocusId`/`originMonthFocusId` added to
  `CachedDayItem`, no new indexes — same pattern as the v6 bump).

Session of July 12, 2026 — 3 fixes + 6 features + 1 follow-up fix, all typechecked
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
  marks the item complete) — migration_09 run, confirmed live.
- Habits: reduce mode stripped down to name + mode only — no
  frequency, no auto-add, no target. Existing reduce habits with old
  frequency data are untouched in the DB, just ignored by the UI.
- Deleting a scheduled inbox item's day/week/month record now reverts
  `ns_inbox_items.state` back to `'unassigned'` (`maybeRevertInboxItemState`
  in `useInboxItems.ts`, called from `useDeleteDayItem`/
  `useDeleteWeekFocus`/`useDeleteMonthFocus`) — checks the other two
  tables first so an item still scheduled elsewhere isn't wrongly
  reverted. Live-verified on both the day and week delete paths.

**Next:** await final approval on TASKS.md, then start Phase 0
(error boundary) and Phase 1 (nav restructure, Goals rename, Goals
screen). Phase 1 also includes the manual Atlas check — verify
Atlas's integration points still resolve after the Day/Week/Month
route split; the `/planner?tab=…&date=…` redirect shim covers URLs
but not any widget importing a component path or reading the tables
directly.

---

## Known issues
See AUDIT.md deferred section for full list.
Most critical deferred items:
- A6: no error boundary (white screen on render throw) — **being
  closed in v3 Phase 0.** Hit this directly during the July 20 session
  (an uninitialized picker value crashed through a raw `parseISO('')`).
- E3: scheduling to past allowed (no min date on inbox picker)
- P3: 698KB single JS chunk (no code splitting) — gets worse with v3's
  nine routes; `React.lazy` noted in TASKS.md but not scheduled.

Still untracked in git and worth committing (they're the only copies):
`design-handoff/` — including the v2 spec source and the design HTML —
plus `.env.example` and `scripts/gen-icons.mjs`.

---

## Rules for this codebase
- All colours via CSS custom properties only — no hardcoded hex anywhere
- Server state in TanStack Query only — never in component state
- All Supabase tables prefixed ns_
- Dexie version must be bumped when schema changes, and every new
  store must be added to `clearAllCaches()` — a store missing there
  is a real cross-account data leak on sign-out, not a cosmetic gap
- Mobile changes inside breakpoints only — never touch desktop layout
- Planning docs are tracked in git now — keep them that way

---

## How to start a Claude Code session
1. Read this file
2. Read SPEC.md
3. Read TASKS.md
4. Read AUDIT.md
5. Then read any specific files relevant to the task
6. Update this file at the end of the session
