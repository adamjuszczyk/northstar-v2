# Northstar v3 — TASKS.md

Technical plan derived from `SPEC.md` (v3). No implementation code. Read the spec first — this document does not repeat it.

The v2 technical plan is preserved at `TASKS-v2.md` (see the warning in §0).

---

## 0. Before anything else — two housekeeping facts

**1. The v2 docs are now snapshotted and tracked — RESOLVED.**
SPEC.md's intro claims the v2 spec "is preserved permanently at the `v2-final` git tag". That tag never existed, and `SPEC.md` / `TASKS.md` / `AUDIT.md` had never been committed — `git ls-files` showed only `CONTEXT.md` tracked. Both v2 docs turned out to be recoverable: v2's TASKS.md was copied to `TASKS-v2.md` before being overwritten, and v2's spec survived at `design-handoff/project/uploads/Northstar-v2-SPEC.md` and is now snapshotted as `SPEC-v2.md`. All five planning docs were committed and pushed in this session.

**No `v2-final` tag was created, deliberately** — `SPEC.md` at that commit already contains v3 content, so a tag claiming to mark v2 would point at the wrong thing. The v2 snapshots are the record; the tag would only mislead. SPEC.md's intro line about the tag is now stale and should be reworded to point at `SPEC-v2.md` instead.

**2. `migration_10` has been run — RESOLVED.**
`scripts/migration_10_focus_pool_linking.sql` was run in Supabase, so `ns_day_items.origin_week_focus_id` and `origin_month_focus_id` exist. This matters beyond the feature it shipped for: retiring `WeekPoolPanel` (SPEC §6.2) does **not** make those columns obsolete — they are exactly what the replacement Week/Month tab in the add-to-day flow needs to mark a Goal as "already pulled", and the pulled-day indicators in Week and Month views survive the retirement. Phase 6 depends on them and is now unblocked.

---

## 1. Tech Stack

### Carried forward unchanged

| Layer | Choice | Still correct for v3 because |
|---|---|---|
| Framework | React 18 + TypeScript | No v3 concept needs a framework change |
| Build | Vite + vite-plugin-pwa | Unchanged |
| Backend | Supabase, `ns_` prefix, shared project | All 5 new tables follow the same convention |
| Server state | TanStack Query v5 | Lines/Blocks/Tasks/Sheets are all ordinary keyed queries |
| Offline | Dexie v4 (IndexedDB) | Needs version bumps, not replacement |
| Styling | CSS Modules + `tokens.css` | Blocks/Lines introduce no colour that isn't already a token or a `BLOCK_COLOURS` entry |
| Dates | date-fns | Unchanged |
| DnD | @dnd-kit | Reused for dragging tasks into blocks and reordering steps |
| Routing | React Router v6 | Handles the sidebar split; see §2 for the route table |

### Proposed additions

| Addition | Recommendation | Reasoning |
|---|---|---|
| **i18n** (SPEC §6.6) | **Hand-rolled**, ~80 lines in `src/i18n/`, not `react-i18next` | Two languages, one user, no lazy-loading or namespace needs, no translation-management pipeline. `react-i18next` + `i18next` adds ~40 KB gzipped to a bundle AUDIT already flags at 698 KB (P3). The existing `useSettings` singleton (`useSyncExternalStore` + localStorage + validate-on-load) is exactly the right shape to hang a `lang` field on — a library would introduce a *second* settings mechanism next to it. |
| **`Intl.PluralRules`** (browser built-in, zero dependency) | Required, inside the hand-rolled `t()` | This is the one place a naive `t()` breaks. Polish has three plural forms (`1 zadanie` / `2 zadania` / `5 zadań`) where English has two. The app already renders count strings (`"{n} task{s}"`, `"N inside"`, `"{n} TASKS"`, `"+{n} more"`). Hand-rolling without `Intl.PluralRules` produces wrong Polish; with it, correct plurals cost ~10 lines. |
| **React error boundary** (no dependency — `React.Component` + `componentDidCatch`) | **Approved**, ~40 lines, Phase 0 | Not in the spec — added because v3 roughly doubles the render surface (timeline with lines/blocks/clusters, sheets canvas, step lists) and AUDIT A6 is still open: any render throw white-screens the whole app. This bit the July 20 session directly. |
| **Route-level code splitting** (`React.lazy`, zero dependency) | Optional, deferred | Going from 6 to 9 routes makes AUDIT P3 worse. Mentioned for completeness; not scheduled into any phase. |

### Explicitly *not* proposed

- **No new state library.** Lines, Blocks, Tasks, Steps, Sheets are all server state — TanStack Query, per the standing rule.
- **No calendar/timeline library.** The existing hand-built timeline (`PXH`/`TOPPAD` positioning, cluster algorithm) already does what Blocks need; dropping in a library would mean rebuilding the day view, which the spec explicitly rules out ("no rebuild").
- **No rich-text editor** for Meeting block notes or Inbox Notes. Plain `textarea` + `text` column, same as the existing journal and tree notes.
- **No test infrastructure** (AUDIT A10). Still deferred — flagging that Phase 4 (Task Lists + Split) is the first piece of Northstar logic complex enough that its absence is a genuine risk, not just a code-quality note.

---

## 2. File & Folder Structure Changes

Only changes are listed — everything not mentioned stays where it is.

```
src/
├── i18n/                              ← NEW (Phase 8)
│   ├── index.ts                       ← LangProvider, useT(), Intl.PluralRules wrapper
│   ├── en.ts                          ← flat key → string map
│   └── pl.ts
│
├── lib/
│   ├── settings.ts                    ← MODIFIED: + lang, + timelineFocus fields
│   └── blockColours.ts                ← unchanged, now also feeds ns_blocks.colour
│
├── hooks/
│   ├── useLines.ts                    ← NEW (Phase 3)
│   ├── useBlocks.ts                   ← NEW (Phase 3)
│   ├── useTasks.ts                    ← NEW (Phase 4) — task bodies + split
│   ├── useTaskSteps.ts                ← NEW (Phase 4)
│   ├── useDayTemplates.ts             ← NEW (Phase 5)
│   ├── useSheets.ts                   ← NEW (Phase 7)
│   ├── useDayItems.ts                 ← MODIFIED: taskId/blockId, task-resolved title & completion
│   ├── useDayItemsSummary.ts          ← MODIFIED: fetch task_id, resolve task titles (see §3.4 warning)
│   ├── useInboxItems.ts               ← MODIFIED: kind filter ('task' | 'note')
│   ├── useTreeNodes.ts                ← MODIFIED: sheetId; scoped vs unscoped tree building
│   ├── usePrefetch.ts                 ← MODIFIED: + today's lines/blocks/steps, − journal prefetch
│   └── useJournalEntry.ts             ← DELETED (Phase 6) — no consumers once the section goes
│
├── components/
│   ├── ErrorBoundary.tsx              ← NEW (Phase 0, optional)
│   ├── day/
│   │   ├── LineMarker.tsx             ← NEW — timeline label at a fixed time
│   │   ├── BlockCard.tsx              ← NEW — time-range container, renders assigned items
│   │   ├── BlockForm.tsx              ← NEW — create/edit block (type, times, colour, notes)
│   │   ├── LineForm.tsx               ← NEW — create/edit line (label, time)
│   │   ├── TaskStepList.tsx           ← NEW — checklist, "next open step onward"
│   │   ├── SplitPrompt.tsx            ← NEW — "already on this day — Split instead?"
│   │   ├── ApplyTemplateSheet.tsx     ← NEW — pick a template, apply to this date
│   │   ├── DayView.tsx                ← MODIFIED: lines/blocks/templates; no journal, no reminder
│   │   ├── DayTimeline.tsx            ← MODIFIED: lines + blocks layers, configurable hour window
│   │   ├── DayItemForm.tsx            ← MODIFIED: + Week/Month source tab, + block target
│   │   ├── WeekPoolPanel.tsx          ← DELETED (SPEC §6.2)
│   │   ├── FocusReminder.tsx          ← DELETED — both Today and Day (resolved, A3)
│   │   └── JournalSection.tsx         ← DELETED — both Today and Day (resolved, A2)
│   ├── goals/
│   │   └── GoalsView.tsx              ← NEW — current week + month goals in one surface
│   ├── inbox/
│   │   ├── InboxView.tsx              ← MODIFIED: Notes | Tasks tab shell
│   │   ├── InboxTasksSection.tsx      ← NEW — extracted current behaviour + new default filter
│   │   └── InboxNotesSection.tsx      ← NEW — capture + list only, no states, no actions
│   ├── templates/
│   │   ├── TemplateList.tsx           ← NEW — library, rendered inside Settings
│   │   └── TemplateEditor.tsx         ← NEW — ordered line/block rows
│   ├── tree/
│   │   ├── SheetTabs.tsx              ← NEW — tab strip above the canvas
│   │   ├── SheetForm.tsx              ← NEW — create/rename/attach/detach a sheet
│   │   ├── TreeView.tsx               ← MODIFIED: sheet scoping, anchor indicator
│   │   └── TreeNode.tsx               ← MODIFIED: "open sheet" indicator on anchor nodes
│   ├── planner/
│   │   ├── PeriodNav.tsx              ← NEW — prev/next/today + heading, extracted from PlannerShell
│   │   └── PlannerShell.tsx           ← DELETED once Day/Week/Month are separate pages
│   └── nav/
│       ├── NavBar.tsx                 ← MODIFIED: 9 desktop items, 5-item mobile bar (resolved, A9)
│       └── MoreSheet.tsx              ← NEW — mobile overflow sheet behind "More"
│
└── pages/
    ├── DayPage.tsx                    ← NEW
    ├── WeekPage.tsx                   ← NEW
    ├── MonthPage.tsx                  ← NEW
    ├── GoalsPage.tsx                  ← NEW
    ├── PlannerPage.tsx                ← KEPT as a redirect shim (see route table)
    ├── TodayPage.tsx                  ← MODIFIED: Today-variant props (timeline focus window)
    └── SettingsPage.tsx               ← MODIFIED: + language toggle, + templates section

scripts/
├── migration_11_inbox_kind.sql        ← NEW
├── migration_12_lines_blocks.sql      ← NEW
├── migration_13_tasks_steps.sql       ← NEW
├── migration_14_day_templates.sql     ← NEW
└── migration_15_sheets.sql            ← NEW
```

### Route table

| Route | Renders | Note |
|---|---|---|
| `/` | `TodayPage` | Unchanged path — Today stays the home screen |
| `/day` | `DayPage` | New |
| `/week` | `WeekPage` | New |
| `/month` | `MonthPage` | New |
| `/goals` | `GoalsPage` | New |
| `/inbox` | `InboxPage` | Unchanged |
| `/tree` | `TreePage` | Unchanged; `?sheet=<id>` selects a sheet tab |
| `/habits` | `HabitsPage` | Unchanged |
| `/settings` | `SettingsPage` | Unchanged |
| `/planner?tab=day\|week\|month&date=…` | **Permanent redirect** to `/day`, `/week`, `/month` preserving `?date=` | Keeps every existing deep link alive — including anything Atlas holds (see §6, Phase 1) |

---

## 3. Data Models

Five new tables, four altered. All follow existing house conventions: `ns_` prefix, `uuid` PK with `gen_random_uuid()`, `user_id` FK to `auth.users` with `on delete cascade`, RLS `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)`, `position integer` for ordering, `created_at`/`updated_at` timestamptz.

RLS policies are omitted from the DDL below for brevity — **every** new table gets the standard policy above, and `verify_rls.sql` should be re-run after each migration.

### 3.1 Lines — `ns_lines` (migration 12)

A named marker at a fixed time. No content, no completion, not a container.

```sql
create table ns_lines (
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

create index on ns_lines (user_id, date);
```

```typescript
export interface Line {
  id:        string
  userId:    string
  date:      string        // 'YYYY-MM-DD'
  label:     string
  time:      string        // 'HH:MM'
  colour:    string | null
  position:  number
  createdAt: string
  updatedAt: string
}
```

Deliberately per-date rows, not a recurring rule — SPEC §5.4 makes applying a template "a one-time stamp, not a live link", and §10 defers auto-recurring templates. Editing a line affects only that day, for free.

### 3.2 Blocks — `ns_blocks` (migration 12)

A typed time-range container. Not itself completable.

```sql
create table ns_blocks (
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

create index on ns_blocks (user_id, date);
```

```typescript
export type BlockType = 'focused_work' | 'meeting'

export interface Block {
  id:        string
  userId:    string
  date:      string
  type:      BlockType
  title:     string | null
  startTime: string        // 'HH:MM'
  endTime:   string        // 'HH:MM'
  colour:    string | null
  notes:     string | null
  position:  number
  createdAt: string
  updatedAt: string
}
```

**Task assignment into a block** is an FK on the day item, not a join table — a day item can be in at most one block:

```sql
alter table ns_day_items
  add column block_id uuid references ns_blocks(id) on delete set null;

create index on ns_day_items (block_id);
```

`on delete set null` is the deliberate choice: deleting a block releases its tasks back onto the day rather than destroying them (assumption A8). A day item inside a block keeps its own `start_time` — null means "somewhere inside this block", non-null means it also has its own slot within the block's range.

Both `end_time > start_time` (DB) and `validateTimeRange` (app, already exists in `DayItemForm.tsx`) enforce the range — the DB constraint is the backstop the day items table never got.

### 3.3 Task Lists & Split — `ns_tasks` + `ns_task_steps` (migration 13)

This is the highest-risk change in v3. The design goal is to satisfy SPEC §5.3 (one shared entity, many lightweight occurrences, progress carries over automatically) **without** rewriting every existing `ns_day_items` row.

**Core decision:** `ns_tasks` is created **lazily**. A day item with `task_id = null` behaves exactly as it does today — this is every row that exists right now, and every plain one-off task created in future. A task body is materialized only when the item first needs a shared identity, which happens at exactly two moments: **the first step is added**, or **the item is split**. See assumption A1 for why this is behaviourally identical to the spec's "a plain task is a list with one hidden step".

```sql
create table ns_tasks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  source         text not null check (source in ('standalone', 'tree', 'inbox', 'habit')),
  title          text,                              -- required when source = 'standalone'
  tree_node_id   uuid references ns_tree_nodes(id)  on delete cascade,
  inbox_item_id  uuid references ns_inbox_items(id) on delete cascade,
  habit_id       uuid references ns_habits(id)      on delete cascade,
  notes          text,
  is_complete    boolean not null default false,    -- derived from steps when steps exist
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint task_standalone_needs_title check (source != 'standalone' or title is not null),
  constraint task_tree_needs_node        check (source != 'tree'       or tree_node_id  is not null),
  constraint task_inbox_needs_item       check (source != 'inbox'      or inbox_item_id is not null),
  constraint task_habit_needs_habit      check (source != 'habit'      or habit_id      is not null)
);

create index on ns_tasks (user_id);
```

```sql
create table ns_task_steps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  task_id     uuid not null references ns_tasks(id) on delete cascade,
  content     text not null,
  position    integer not null default 0,
  is_done     boolean not null default false,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on ns_task_steps (task_id, position);
create index on ns_task_steps (user_id);
```

```sql
alter table ns_day_items
  add column task_id uuid references ns_tasks(id) on delete cascade;

create index on ns_day_items (task_id);
```

```typescript
export type TaskSource = 'standalone' | 'tree' | 'inbox' | 'habit'

/** The shared entity. Multiple ns_day_items occurrences point at one of these. */
export interface Task {
  id:          string
  userId:      string
  source:      TaskSource
  title:       string | null
  treeNodeId:  string | null
  inboxItemId: string | null
  habitId:     string | null
  notes:       string | null
  isComplete:  boolean       // steps present → all steps done; no steps → set directly
  createdAt:   string
  updatedAt:   string
}

export interface TaskStep {
  id:        string
  userId:    string
  taskId:    string
  content:   string
  position:  number
  isDone:    boolean
  doneAt:    string | null
  createdAt: string
  updatedAt: string
}

/** Additions to the existing RawDayItem in useDayItems.ts */
export interface RawDayItem {
  // …all existing fields unchanged…
  taskId:  string | null   // non-null = this row is an occurrence of a shared task
  blockId: string | null   // non-null = assigned inside a block
}
```

**Rules that make this work:**

1. **Identity resolution.** When `task_id` is non-null, the occurrence's own `title` / `tree_node_id` / `inbox_item_id` / `habit_id` are left null and ignored; display title and source come from the task. This is the same resolve-through-a-map pattern `DayView` already uses for tree/inbox/habit titles — one more map, one more branch in the existing `displayTitle` fallback chain.

2. **Split.** Adding a task to a day it's already on inserts a second `ns_day_items` row with the *same* `task_id` and a different `start_time`/`block_id`. Nothing is copied. Detection: an existing row for that date matching either the same `task_id`, or the same `tree_node_id`/`inbox_item_id`/`habit_id` for not-yet-materialized items — the latter is where a task body gets created and back-linked onto the existing row.

3. **Progress carries over for free.** No per-occurrence step pointer is stored. Every occurrence renders `steps.filter(s => !s.isDone)` sorted by `position` — so marking a step done in the morning session immediately changes what the afternoon session shows, live, with zero synchronisation logic. The "all done" edge case (§5.3) is just the empty result of that filter.

4. **Completion.** With steps: `ns_tasks.is_complete` is recomputed on every step toggle (all done → true). Without steps: toggled directly, exactly like today. Tree propagation is unchanged from the existing two-table rule — a `source = 'tree'` task completing sets `ns_tree_nodes.status = 'complete'`, un-completing reverts to `'in_progress'` (assumption A10).

5. **`is_complete` is mirrored onto occurrence rows.** Every task completion change also runs `update ns_day_items set is_complete = <x> where task_id = <t>`. This is a deliberate denormalization: `useRangeDayItems`, the Dexie offline cache, and the week/month done-counts all read `ns_day_items.is_complete` directly, and none of them should have to join. **Invariant:** for any row with `task_id` non-null, `ns_day_items.is_complete` always equals `ns_tasks.is_complete`. It is never written independently.

**⚠️ The bug this will cause if missed:** `useDayItemsSummary.ts` currently resolves week/month grid titles from `title` / `tree_node_id` / `inbox_item_id` / `habit_id` on the day item row. Task-linked rows have all four null, so every split task will render as **"Untitled"** in the Week and Month grids. This is the exact failure mode that hit the July 12 session (inbox items showing "(untitled)") and the July 20 session (habit items showing "Untitled"). `useRangeDayItems` must add `task_id` to its `select` list and `WeekView`/`MonthView` must add a task map to `resolveEventTitle` **in the same commit** as migration 13.

### 3.4 Day Templates — `ns_day_templates` + `ns_day_template_items` (migration 14)

```sql
create table ns_day_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on ns_day_templates (user_id);
```

```sql
create table ns_day_template_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references ns_day_templates(id) on delete cascade,
  kind        text not null check (kind in ('line', 'block')),
  label       text not null,                       -- line label or block title
  start_time  time not null,                       -- line: the marker time; block: range start
  end_time    time,                                -- block only
  block_type  text check (block_type in ('focused_work', 'meeting')),
  colour      text,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint tmpl_block_needs_end   check (kind != 'block' or end_time is not null),
  constraint tmpl_block_needs_type  check (kind != 'block' or block_type is not null),
  constraint tmpl_line_has_no_end   check (kind != 'line'  or end_time is null),
  constraint tmpl_block_range       check (end_time is null or end_time > start_time)
);

create index on ns_day_template_items (template_id, position);
```

```typescript
export interface DayTemplate {
  id:        string
  userId:    string
  name:      string
  position:  number
  createdAt: string
  updatedAt: string
}

export type TemplateItemKind = 'line' | 'block'

export interface DayTemplateItem {
  id:         string
  userId:     string
  templateId: string
  kind:       TemplateItemKind
  label:      string
  startTime:  string             // 'HH:MM'
  endTime:    string | null      // block only
  blockType:  BlockType | null   // block only
  colour:     string | null
  position:   number
  createdAt:  string
  updatedAt:  string
}
```

One child table with a `kind` discriminator and CHECK constraints, rather than two parallel tables — this matches the house pattern already used on `ns_day_items` (`day_standalone_needs_title` etc.) and keeps the template as one ordered list, which is how it's edited and how it renders.

**Applying** reads the template's items and bulk-inserts into `ns_lines` and `ns_blocks` for the target date — two inserts, one round trip each. No `template_id` is written onto the created rows: it's a stamp, not a link (SPEC §5.4), so editing the template later never touches days already stamped. Merge vs replace behaviour is assumption A6.

### 3.5 Sheets — `ns_sheets` (migration 15)

```sql
create table ns_sheets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  anchor_node_id uuid references ns_tree_nodes(id) on delete set null,  -- null = detached
  position       integer not null default 0,       -- tab order
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on ns_sheets (user_id);
create unique index ns_sheets_anchor_unique
  on ns_sheets (anchor_node_id) where anchor_node_id is not null;
```

```sql
alter table ns_tree_nodes
  add column sheet_id uuid references ns_sheets(id) on delete set null;

create index on ns_tree_nodes (user_id, sheet_id);
```

```typescript
export interface Sheet {
  id:           string
  userId:       string
  name:         string
  anchorNodeId: string | null   // null = detached (blank canvas, not yet attached)
  position:     number
  createdAt:    string
  updatedAt:    string
}

/** Addition to the existing TreeNode */
export interface TreeNode {
  // …all existing fields unchanged…
  sheetId: string | null        // null = main tree
}
```

**The key structural decision: `parent_id` is never rewritten when a subtree moves to a sheet.**

Launching a sheet from a node sets `sheet_id = <new sheet>` on every **descendant** of that node. The anchor node itself stays in the main tree with `sheet_id = null`. Nothing else changes.

This falls out cleanly:

- **Main tree render** filters `sheetId === null`. The moved descendants disappear from the canvas; the anchor node now has no visible children and renders an "open sheet" indicator instead — exactly the decluttering §5.5 asks for.
- **Sheet render** filters `sheetId === <id>`. The moved children have a `parent_id` pointing at a node that isn't in the filtered set, so the existing `buildTree` already treats them as roots. **No change to `buildTree` is needed** — only the list passed into it.
- **Detached sheets** (`anchor_node_id = null`) are just nodes with a `sheet_id` and no anchor. Attaching later = set `anchor_node_id`, and optionally set the sheet roots' `parent_id` to the anchor.
- **Dissolving a sheet** = `update ns_tree_nodes set sheet_id = null where sheet_id = <id>`. The subtree snaps back into place under its anchor, because the parent links were never broken.

**This also resolves SPEC §5.5's flagged assumption directly.** Descendant indicators stay accurate for free, provided one rule is followed: *`countDescendants`, `hasFocusedDescendant`, and `TreeNodePicker` are fed the **unfiltered** node list; only `TreeView`'s canvas render filters by `sheet_id`.* Since those functions build their own tree from whatever list they're given, an anchor node fed the full list still sees its whole subtree — sheet membership is invisible to them. The `sheet_id` filter must be applied at the render layer only, never in `useTreeNodes`.

One thing that does need care: `useMoveNode` must set `sheet_id` alongside `parent_id` when a drag crosses between the main tree and a sheet (or between sheets). `wouldCreateCycle` is unaffected — it walks parent links across the whole node set, which is still correct.

### 3.6 Inbox Notes vs Tasks (migration 11)

```sql
alter table ns_inbox_items
  add column kind text not null default 'task' check (kind in ('task', 'note'));

create index on ns_inbox_items (user_id, kind);
```

```typescript
export type InboxKind = 'task' | 'note'

export interface InboxItem {
  // …all existing fields unchanged…
  kind: InboxKind
}
```

Backfill is the column default — every existing row is a task, which is correct: they are all currently schedulable and promotable.

Notes have no state, no scheduling, no promotion, no completion. `state`, `promoted_node_id`, `carried_over`, `is_completed` are simply unused when `kind = 'note'`; they are left nullable-by-default rather than constrained, because adding CHECK constraints here would require a table rewrite for no behavioural gain on a single-user app.

**Every consumer that lists inbox items for scheduling must filter `kind = 'task'`.** Existing call sites: `DayItemForm.tsx` (inbox tab), `InboxItemActions.tsx`, `useCarryOverSweep.ts`, `usePrefetch.ts`. Consumers v3 will *add*: the inbox tab that `FocusItemForm.tsx` gains per SPEC §5.6, and the Week/Month tab in the day add-flow (Phase 6). Doing this migration early (Phase 2) is deliberate — it gets the filter in place before those new consumers are written, rather than retrofitting it into each one.

### 3.7 Goals rename

**No schema change.** `ns_week_focus` and `ns_month_focus` keep their names, columns, and hooks. This is a label change only, per SPEC §5.6.

Cheapest correct implementation: change the display strings in Phase 1, then in Phase 8 those strings become `t('goals.week')` / `t('goals.month')` like everything else. Renaming the tables would mean touching 6 hooks, 2 Dexie stores, migration 10's FK names, and every query key for zero functional gain.

### 3.8 Settings additions (localStorage, not Supabase)

```typescript
export interface Settings {
  accent:        string
  accentRgb:     string
  theme:         'dark' | 'light'
  weekStartsOn:  0 | 1
  lang:          'en' | 'pl'                                    // NEW
  timelineFocus: 'full' | 'work_hours' | 'rolling'              // NEW
  workHoursStart: string     // 'HH:MM', used when timelineFocus = 'work_hours'
  workHoursEnd:   string
  rollingHours:   number     // ±N, used when timelineFocus = 'rolling'
}
```

Device-local, same as every other setting, and `lib/settings.ts` already validates each field independently with a per-field default fallback — the new fields slot into `sanitize()` with no structural change.

### 3.9 Dexie schema versions

Project rule: bump on every cached-shape change. One bump per migration that touches cached data.

| Version | Phase | Change |
|---|---|---|
| **v8** | 2 | `CachedInboxItem.kind` added. No new index. |
| **v9** | 3 | New stores `lines: 'id, userId, date, [userId+date]'`, `blocks: 'id, userId, date, [userId+date]'`. `CachedDayItem.blockId` added. |
| **v10** | 4 | New stores `tasks: 'id, userId'`, `taskSteps: 'id, taskId, userId'`. `CachedDayItem.taskId` added. |
| **v11** | 7 | `CachedTreeNode.sheetId` added; new store `sheets: 'id, userId'`. |

`clearAllCaches()` must be extended with every new store — it is the sign-out data-leak guard (AUDIT FIX 3), and a store missing from it is a real cross-account leak, not a cosmetic omission.

**Offline write scope stays exactly as narrow as it is today** — inbox capture and day-item completion only. Lines, blocks, steps, templates, and sheets are online-only writes. The sync queue is blind last-write-wins (AUDIT E1/E2) and widening it is not something v3 should do casually. `usePrefetch` should still *read*-cache today's lines and blocks so the offline Today view doesn't render a structureless timeline.

**Day templates are not cached at all** — they're managed from Settings, applied deliberately while online.

---

## 4. Implementation Order

Nine phases. Each ends with something you can use. The ordering rationale matters more than the list, so it's stated per phase.

### Phase 0 — Error boundary *(~1 hour, approved)*
Wrap the router in a boundary with a "something broke, reload" fallback that logs the error.

**Why first:** every later phase adds render surface, and AUDIT A6 means any throw in any of it white-screens the whole app. Cheapest possible risk reduction before the risky work starts. Closes the audit item that bit the July 20 session directly.

---

### Phase 1 — Nav restructure, Goals rename, Goals screen
Split Day/Week/Month into separate routes and sidebar items; extract `PeriodNav` from `PlannerShell`; add `/goals` with `GoalsView`; relabel Focus → Goals; add `/planner` redirect shim; build the 9-item desktop sidebar and the 5-item mobile bar with its `MoreSheet` overflow (A9, resolved). **Then check the Atlas repo against the new route table.**

**Why first:** zero schema risk, and it establishes the routes every later phase plugs into — building Lines/Blocks against a shell that's about to be restructured would mean doing the day view's plumbing twice. It's also the only phase that can break Atlas, and you want that found now rather than after five phases of work. The `/planner` redirect shim means even an unverified Atlas integration keeps working.

**Testable:** all nine desktop sidebar items navigate; on a 375px viewport the bottom bar shows five items at ≥44px each and every remaining screen is reachable through More; Day/Week/Month keep their date state independently; Goals shows this week's and this month's goals and can mark them complete; every old `/planner?tab=…` link still lands correctly.

---

### Phase 2 — Inbox Notes / Tasks split *(migration 11, Dexie v8)*
Add `kind`; split `InboxView` into Notes and Tasks sections; scope the filter bar to Tasks; change the default filter to hide finished tasks; filter every scheduling consumer to `kind = 'task'`.

**Why here:** the smallest possible migration (one column, default backfill), and it must land *before* Phases 3–6 add more consumers of the inbox list. Retrofitting a `kind` filter into five new call sites later is exactly the kind of drift AUDIT Q4 already flags.

**Testable:** capture a note — it never appears in any scheduling picker, has no state badge, and can't be promoted. Capture a task — behaves exactly as today. Completed tasks are hidden until you switch filters.

---

### Phase 3 — Lines & Blocks *(migration 12, Dexie v9)*
`ns_lines`, `ns_blocks`, `ns_day_items.block_id`; `LineMarker`, `BlockCard`, `LineForm`, `BlockForm`; timeline renders three layers (lines → blocks → items); assign items into blocks via the add form and via drag.

**Why here:** this is the day view's new structural foundation, and Phase 4 depends on it (a task list is assigned *into* a block). It's also the single biggest visible win in v3 — the thing that made v3 exist — so it's worth having in daily use early enough to collect real feedback before the harder work lands.

**Watch:** the existing cluster algorithm in `DayTimeline.tsx` groups anchored items within 30 minutes of each other. Blocks are anchored ranges too. Decide explicitly whether blocks participate in clustering (recommendation: **no** — blocks are a background layer behind item cards, clustering stays item-only) or the timeline will start collapsing blocks into cluster cards.

**Testable:** add Wake 07:00 and Sleep 23:00 lines and they render as markers with no checkbox. Create a Focused Work block 09:00–12:00, drag two tasks into it, complete one from inside the block. Delete the block — both tasks stay on the day, unassigned.

---

### Phase 4 — Task Lists & Split *(migration 13, Dexie v10)*
`ns_tasks`, `ns_task_steps`, `ns_day_items.task_id`; `TaskStepList`, `SplitPrompt`; lazy task materialization; the `is_complete` mirror; **and the `useDayItemsSummary` title-resolution fix in the same commit.**

**Why here:** highest-risk change, so it goes after the day view is otherwise stable and before templates and Today changes pile more on top. It needs blocks to exist (splitting across two blocks is the motivating use case in §12).

**Watch:** the "Untitled in Week/Month grids" trap in §3.3. Also the `is_complete` mirror invariant — if any code path writes `ns_day_items.is_complete` directly on a task-linked row, occurrences silently disagree with each other.

**Testable:** turn a day task into a 5-step list. Split it across a morning block and an afternoon block. Tick two steps in the morning — the afternoon occurrence immediately shows step 3 onward. Finish all steps — the afternoon occurrence shows "all done", both occurrences show complete, and (if tree-sourced) the tree node is complete. The Week grid shows the task's real title, not "Untitled".

---

### Phase 5 — Day Templates *(migration 14, no Dexie change)*
`ns_day_templates` + items; `TemplateList`/`TemplateEditor` in Settings; `ApplyTemplateSheet` in Day view.

**Why here:** purely additive and entirely dependent on Phases 3's entities — a template is only a stored list of lines and blocks. Nothing later depends on it, so it can also slip without blocking anything.

**Testable:** build a "Standard day" template (Wake 07:00 / Focused Work 08–12 / Gym 12–15 / Focused Work 16–20 / Sleep 21:00), apply it to an empty future day in one action, then edit one of the stamped lines — the template is unchanged.

---

### Phase 6 — Day-view removals, Week/Month add-tab, done/not-done counts
Delete `WeekPoolPanel`, `FocusReminder`, and `JournalSection` — all three from **both** Today and `/day` (A2/A3, resolved); delete the now-unused `useJournalEntry` hook and drop `prefetchJournalEntry` from `usePrefetch`; add a Week/Month source tab to `DayItemForm` (using migration 10's origin FKs); configurable timeline focus window; Week/Month mini-grids switch from task count to done/not-done.

`migration_10` is already run — no migration prerequisite.

**Why here:** the Week/Month add-tab is the *replacement* for the pull mechanic being deleted, so both must land together or the capability is lost in between. The timeline focus window needs the timeline to be stable post-Lines/Blocks. The done/not-done counts are near-free — `useRangeDayItems` already returns `isComplete`.

**Data is not touched by the removals.** `ns_journal_entries` keeps its rows, its RLS policy, and its Dexie store; only the UI, the hook, and the wasted prefetch round trip go. Deleting the table would destroy existing journal entries irreversibly, which "remove the section" doesn't authorise — see A2 for how to ask for that separately. The Dexie `journalEntries` store is left in place (and still cleared by `clearAllCaches`) because removing it would cost a schema version bump for no benefit.

**Can be pulled forward** if the WeekPool and the two widgets bother you sooner: the deletions, the add-tab, and the count change have no dependency on Phases 3–5. Only the timeline focus window does.

**Testable:** Today and `/day` both show only the timeline, pool, and list — no journal, no week/month reminder, no pull panel. Add an item to a specific day from the Week tab of the add form; the source Goal shows as pulled. Set the timeline focus to work hours and Today opens on 09:00–17:00 with a Sleep line at 23:00 still reachable (per A5). Week grid reads "3/5 done" per day. A journal entry written before this phase is still in Supabase afterwards.

---

### Phase 7 — Sheets *(migration 15, Dexie v11)*
`ns_sheets`, `ns_tree_nodes.sheet_id`; `SheetTabs`, `SheetForm`; sheet-scoped canvas render; "open sheet" indicator on anchor nodes; `useMoveNode` sheet awareness.

**Why this late:** completely independent of the whole planner track — it touches only the tree — and the planner gap is what motivated v3 (SPEC §1). Placed last among the feature phases so it can't destabilize the day work.

**Move it earlier if tree clutter is the thing actually bothering you day-to-day** — it has no dependency on Phases 2–6 and could run immediately after Phase 1.

**Testable:** launch a sheet from a Project node — its children vanish from the main canvas, the Project shows an open-sheet indicator, and the sheet tab shows the same subtree as a proper branching tree. The Project's "N inside" count in `TreeNodePicker` is unchanged. Create a detached sheet, build three nodes in it, attach it to a Goal later. Dissolve a sheet — the subtree snaps back exactly where it was.

---

### Phase 8 — i18n (Polish / English)
`src/i18n/` with `en.ts`/`pl.ts`, `t()` + `Intl.PluralRules`, `lang` in settings, toggle in Settings; extract every UI string.

**Why unconditionally last:** every phase above adds strings. Extracting as you go means re-extracting seven times; extracting once at the end is one sweep. Nothing depends on it.

**Scope honesty:** this is the largest *mechanical* task in v3 — roughly 9,500 lines of TSX with strings in nearly every component, and it touches essentially every file. Budget it as a phase of its own, not a polish pass, and expect the Polish plural forms (§1) to be the only genuinely tricky part.

**Testable:** flip the Settings toggle and every screen — nav, forms, empty states, badges, error messages, date headings — renders Polish with correct plural forms for 1 / 2 / 5 items. Reload: the language persists.

---

## 5. Assumptions & Decisions Not Covered by the Spec

Ordered roughly by how much rework a wrong answer costs. **A2, A3, and A9 are resolved** — confirmed in review, marked inline below, and reflected in §2 and §4. Everything else stands as approved, including A1 (lazy `ns_tasks`, no backfill).

### A1 — "Plain task = one hidden step" is implemented as `task_id = null` — **APPROVED**
SPEC §5.3 says every task is a list with at least one step, hidden when there's only one. Taken literally that means a `ns_tasks` row and a `ns_task_steps` row for every day item that exists — a backfill across all historical data, with the four-way source polymorphism duplicated onto the task table.

Since the single step is *hidden* and has no independent behaviour, "one hidden step" and "no steps, completion on the item" are observably identical. So the plan models plain tasks as `task_id = null` and materializes a task body lazily at the two moments a shared identity actually becomes necessary: first step added, or first split. Zero backfill, zero change to existing rows, and the spec's observable behaviour is preserved exactly — including "a second occurrence of a plain task shows 'already done'", because splitting is one of the two triggers.

Confirmed in review: build the lazy model, no backfill. Migration 13 stays purely additive.

### A2 — The journal section is removed from Today *and* Day — **RESOLVED**
SPEC §6.2 says "Today's Reflection section removed". The only thing matching is `JournalSection`, the collapsible daily journal. Confirmed: that is the section, and it comes out of **both** Today and `/day` — not Today only. `JournalSection.tsx`, its CSS module, and `useJournalEntry.ts` are deleted in Phase 6, along with `prefetchJournalEntry`.

**Scope limit, stated so it isn't assumed either way:** `ns_journal_entries` and its rows are left untouched. Removing a section from the UI doesn't authorise destroying the entries written through it, and a `drop table` is irreversible. If you also want the journal data gone, say so explicitly and it becomes its own migration — otherwise the table sits dormant and the entries stay recoverable.

Consequence worth noting: `/day` also loses journaling, so the app has no journal surface anywhere after Phase 6. That follows directly from "remove entirely", and it removes the only writer of `ns_journal_entries` — flagged because the CONTEXT.md product description currently lists "a daily journal" as a core feature.

### A3 — The week/month focus reminder is removed from Today *and* Day — **RESOLVED**
§6.2 says the week/month focus section is "removed entirely" but names only `WeekPoolPanel` as retired. Confirmed both go, from both screens: `WeekPoolPanel.tsx` (the pull mechanic) and `FocusReminder.tsx` (the read-only reminder widget) are deleted in Phase 6.

No hooks are orphaned by this one — `useWeekFocus` and `useMonthFocus` still serve Week view, Month view, the Goals screen, and the new Week/Month add-tab. The connective-tissue role §8 asks for now lives entirely in the Goals screen and that add-tab, which is a defensible trade: both are reachable deliberately rather than occupying permanent space on every day.

### A4 — Day-item colours are kept alongside block colours (MEDIUM)
§5.2 says Blocks "formalize and replace the existing custom block colours behaviour". Read as *conceptually* replace: `ns_day_items.colour` is **not** dropped (existing data uses it, and a loose anchored item outside any block still benefits), and `ns_blocks.colour` uses the same `BLOCK_COLOURS` palette. Dropping the column would destroy existing colour assignments with no migration path.

### A5 — Timeline focus clips the rendered range, but auto-expands to cover outliers (MEDIUM)
§6.2 asks for a configurable visible window. A hard clip would hide a 23:00 Sleep line under a 09:00–17:00 work-hours window — the window would silently make part of your day invisible. So: the configured window sets the rendered hour range, and the range is automatically widened to include any line, block, or anchored item that falls outside it. The window is a default framing, never a data filter.

### A6 — Applying a template merges by default (LOW)
Applying to a day that already has lines or blocks appends rather than replacing, with a "replace existing" option offered in the confirm step when the day isn't empty. Merge is the non-destructive default; replace has to be chosen.

### A7 — Block types use a CHECK constraint (LOW)
§5.2 calls the type set "extensible". Modelled as `check (type in ('focused_work','meeting'))`, matching every other type/status/source column in this schema. Adding a type is a three-line migration. The alternative — unconstrained text — buys zero-migration extensibility at the cost of the safety every other table in the app has. Flag if you'd rather have free text.

### A8 — Deleting a block releases its tasks (LOW)
`on delete set null` on `ns_day_items.block_id`: deleting a Focused Work block leaves its tasks on the day, unassigned. Cascade would silently delete work you'd scheduled, which no other delete path in this app does.

### A9 — Mobile nav is a 5-item bar with a More overflow — **RESOLVED**
`NavBar` is a sidebar on desktop and a bottom bar on mobile. Nine items in a bottom bar is roughly 42px per target on a 375px viewport, under the 44px minimum the v2 mobile audit set.

Confirmed approach: **desktop keeps all nine** items in the sidebar; **mobile shows five** — Today, Day, Inbox, Tree, More — with Week, Month, Goals, Habits, and Settings behind More, opening in a new `MoreSheet.tsx`. At five items a 375px viewport gives 75px per target, comfortably clear of the minimum.

Two things this has to respect, both existing project rules:
- **The mobile bar changes must live inside the existing breakpoint** — desktop's nine-item sidebar is untouched ("mobile changes inside breakpoints only, never touch desktop layout").
- **Active-route highlighting has to survive the indirection.** When the current route is one of the five hidden behind More (`/week`, `/month`, `/goals`, `/habits`, `/settings`), the More item itself must read as active, or the bar will show nothing highlighted on five of nine screens. `NavLink`'s `isActive` won't do this on its own — More is not a route.

### A10 — Completing a task list propagates to the tree (LOW)
A `source = 'tree'` task whose steps are all done sets `ns_tree_nodes.status = 'complete'`; un-completing reverts to `'in_progress'`. This just extends the existing two-table rule to the new entity. Individual *steps* never touch the tree.

### A11 — Split is same-day only (LOW)
§5.3 defines split as "more than one time slot in **a day**". Cross-day continuation is out of scope; the existing carry-over sweep already handles unfinished work rolling forward.

### A12 — Habits are not task-list-able (LOW)
Habit-sourced day items keep their current behaviour, including `x_per_day` counters, and don't get steps. `ns_tasks` permits `source = 'habit'` so the door isn't closed structurally, but no habit UI changes in v3. §4.4 says nothing changes for Habits.

### A13 — Notes reuse the existing `content` field (LOW)
No separate title/body for Notes. Consistent with the Inbox's "no required fields" philosophy (§4.3), and `content` is already `text`.

### A14 — Goals screen is display + mark-complete only (LOW)
Adopting the spec's own flag in §6.5. Creating goals stays in the Week/Month views. Say if you want creation there too — it's a small addition, but it duplicates a flow.

### A15 — Atlas can't be verified from this repo (INFORMATIONAL)
There are no Atlas references anywhere in this codebase (`grep -ril atlas src/ public/` is empty) — the integration lives on the Atlas side. So the §3 ask can't be discharged here. The concrete mitigation is the permanent `/planner?tab=…&date=…` redirect in Phase 1, which keeps any URL Atlas holds working regardless. **Checking the Atlas repo is still a manual step in Phase 1** — the redirect covers routes, not any widget reading Northstar's Supabase tables directly or embedding a component by import path.

### A16 — "Goals" now means two things (INFORMATIONAL)
`goal` is a tree node type, and Goals is now the name for week/month focus items and a sidebar screen. A tree Goal pulled into a week becomes "a Goal" in a second sense. The spec calls for the rename explicitly, so it's implemented as specified — noted only so it isn't discovered as a surprise mid-build.

---

## 6. What This Plan Does Not Address

Named so they're deliberate gaps, not oversights:

- **AUDIT's deferred list is untouched** except A6 (error boundary, Phase 0, approved). A1 (three disconnected offline caches), A4 (feature triplication across week/month hooks), A5 (no mutation atomicity), and A7 (scattered query keys) all get *worse* with five new tables. None are v3 features, so none are scheduled — but Phase 4's `is_complete` mirror is precisely the kind of multi-step write A5 warns about, and it has no atomicity guarantee beyond sequential mutations with error handling.
- **No tests** (A10). Phase 4 is the first Northstar logic where I'd genuinely argue for them.
- **Performance.** Nine routes on one 698 KB chunk (P3), and `select('*')` whole-table fetches (P4) now spanning five more tables.
- **Recurring targets** — SPEC §10 and §11 both confirm this stays unbuilt.

---

*Technical companion to `SPEC.md` (v3). No implementation begins until this plan is approved.*
