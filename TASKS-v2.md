# Northstar v2 — TASKS.md

Technical plan derived from `Northstar-v2-SPEC.md`. No implementation code. Read the spec first — this document does not repeat it.

---

## 1. Tech Stack

| Layer | Choice | Reasoning |
|---|---|---|
| Framework | React 18 + TypeScript | Component architecture required for Atlas readiness; TypeScript enforces the data model boundary between Supabase and UI |
| Build tool | Vite | Fast dev server; first-class PWA support via plugin |
| PWA | vite-plugin-pwa (Workbox) | Handles manifest, service worker, and offline caching with minimal config |
| Routing | React Router v6 | Handles the 5-route nav shell; supports nested routes for Planner sub-views |
| Backend | Supabase — existing project | Shared auth and data with Overload per spec; no new project setup |
| Server state | TanStack Query (React Query) | Caching, background refetch, offline read support; pairs cleanly with Supabase |
| Styling | CSS Modules + global tokens.css | Scoped component styles; CSS custom properties in `tokens.css` are the single source of truth for every color and design value |
| Dates | date-fns | Lightweight, pure functions; no moment.js; handles week-start and month-start calculations cleanly |
| Drag and drop | @dnd-kit/core | Tree node reordering, floating task ordering; accessible; touch-friendly for mobile |

### Supabase shared-project notes

- **Same project**: No new Supabase instance — same URL and anon key as Overload
- **Auth**: `auth.users` is shared. Same email/password credentials. Northstar runs on a different origin so the user signs in once per app (different `localStorage`), but it's the same account — no new registration needed
- **Table prefix**: All Northstar tables prefixed `ns_` — Overload tables are unaffected
- **RLS**: Enabled on all tables. Every policy gates on `user_id = auth.uid()`

### Design token rule

`src/styles/tokens.css` defines every color, radius, shadow, font size, and spacing value as a CSS custom property on `:root`. Components use `var(--ns-token-name)` exclusively. No hex, rgb, or named color values anywhere in component files or CSS Modules. Dark mode is the default; tokens are structured to support a future `[data-theme="light"]` override with zero component changes.

---

## 2. Supabase Schema

### `ns_tree_nodes`

The backbone. Adjacency list — `parent_id` self-references the same table. `type` is a visual label only: any node can be nested under any other node regardless of type.

```sql
create table ns_tree_nodes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  parent_id   uuid references ns_tree_nodes(id) on delete cascade,  -- null = root
  type        text not null check (type in ('vision', 'goal', 'project', 'task')),
  title       text not null,
  notes       text,
  status      text not null default 'not_started'
              check (status in ('not_started', 'in_progress', 'complete')),
  position    integer not null default 0,  -- ordering among siblings with same parent_id
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on ns_tree_nodes (user_id);
create index on ns_tree_nodes (user_id, parent_id);

alter table ns_tree_nodes enable row level security;

create policy "Users own their tree nodes"
  on ns_tree_nodes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### `ns_inbox_items`

Flat, unstructured capture list. Single `content` field — no required structure. Three states: unassigned (default), scheduled (a time-period record exists for it), promoted (converted into a tree node).

```sql
create table ns_inbox_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  content           text not null,
  state             text not null default 'unassigned'
                    check (state in ('unassigned', 'scheduled', 'promoted')),
  promoted_node_id  uuid references ns_tree_nodes(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on ns_inbox_items (user_id, state);

alter table ns_inbox_items enable row level security;

create policy "Users own their inbox items"
  on ns_inbox_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### `ns_day_items`

Items on a specific calendar date. `start_time` present = anchored (sits on the timeline). `start_time` null = floating (lives in the task pool). `source` tracks origin: added standalone, pulled from tree, or scheduled from inbox.

```sql
create table ns_day_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  date            date not null,
  source          text not null check (source in ('standalone', 'tree', 'inbox')),
  title           text,            -- required when source = 'standalone'
  tree_node_id    uuid references ns_tree_nodes(id) on delete cascade,
  inbox_item_id   uuid references ns_inbox_items(id) on delete cascade,
  start_time      time,            -- null = floating; non-null = anchored
  end_time        time,
  is_complete     boolean not null default false,
  position        integer not null default 0,  -- ordering within the floating pool
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint day_standalone_needs_title
    check (source != 'standalone' or title is not null),
  constraint day_tree_needs_node
    check (source != 'tree' or tree_node_id is not null),
  constraint day_inbox_needs_item
    check (source != 'inbox' or inbox_item_id is not null)
);

create index on ns_day_items (user_id, date);

alter table ns_day_items enable row level security;

create policy "Users own their day items"
  on ns_day_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### `ns_week_focus`

Items flagged for a specific week. `week_start` is always a Monday (enforced in application layer).

```sql
create table ns_week_focus (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  week_start      date not null,   -- always a Monday
  source          text not null check (source in ('standalone', 'tree', 'inbox')),
  title           text,
  tree_node_id    uuid references ns_tree_nodes(id) on delete cascade,
  inbox_item_id   uuid references ns_inbox_items(id) on delete cascade,
  is_complete     boolean not null default false,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint week_standalone_needs_title
    check (source != 'standalone' or title is not null),
  constraint week_tree_needs_node
    check (source != 'tree' or tree_node_id is not null),
  constraint week_inbox_needs_item
    check (source != 'inbox' or inbox_item_id is not null)
);

create index on ns_week_focus (user_id, week_start);

alter table ns_week_focus enable row level security;

create policy "Users own their week focus items"
  on ns_week_focus for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### `ns_month_focus`

Items flagged for a specific month. `month_start` is always the 1st of the month (enforced in application layer).

```sql
create table ns_month_focus (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  month_start     date not null,   -- always the 1st of the month
  source          text not null check (source in ('standalone', 'tree', 'inbox')),
  title           text,
  tree_node_id    uuid references ns_tree_nodes(id) on delete cascade,
  inbox_item_id   uuid references ns_inbox_items(id) on delete cascade,
  is_complete     boolean not null default false,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint month_standalone_needs_title
    check (source != 'standalone' or title is not null),
  constraint month_tree_needs_node
    check (source != 'tree' or tree_node_id is not null),
  constraint month_inbox_needs_item
    check (source != 'inbox' or inbox_item_id is not null)
);

create index on ns_month_focus (user_id, month_start);

alter table ns_month_focus enable row level security;

create policy "Users own their month focus items"
  on ns_month_focus for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

---

## 3. File & Folder Structure

```
northstar-v2/
├── public/
│   ├── manifest.json
│   └── icons/                      ← PWA icons (192×192, 512×512)
├── src/
│   ├── main.tsx
│   ├── App.tsx                     ← router + auth guard
│   ├── styles/
│   │   ├── tokens.css              ← all CSS custom properties (colors, spacing, type scale, radii, shadows)
│   │   ├── global.css              ← resets + base styles that reference tokens only
│   │   └── animations.css
│   ├── lib/
│   │   ├── supabase.ts             ← Supabase client (existing project env vars)
│   │   └── dates.ts                ← date-fns wrappers: weekStart(), monthStart(), formatDate()
│   ├── types/
│   │   └── index.ts                ← all TypeScript interfaces/types — single source of truth
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useTreeNodes.ts
│   │   ├── useInboxItems.ts
│   │   ├── useDayItems.ts          ← takes a date string param
│   │   ├── useWeekFocus.ts         ← takes a weekStart date param
│   │   └── useMonthFocus.ts        ← takes a monthStart date param
│   ├── components/
│   │   ├── nav/
│   │   │   └── NavBar.tsx
│   │   ├── tree/
│   │   │   ├── TreeView.tsx        ← fetches flat list, builds nested structure in memory, recursive render
│   │   │   ├── TreeNode.tsx        ← single node + its children; type-driven visual weight
│   │   │   ├── NodeConnector.tsx   ← branch lines / visual hierarchy connectors
│   │   │   └── NodeEditor.tsx      ← create / rename / change type / change status / delete
│   │   ├── inbox/
│   │   │   ├── InboxView.tsx
│   │   │   ├── InboxItem.tsx
│   │   │   └── InboxItemActions.tsx  ← schedule / promote bottom sheet
│   │   ├── day/
│   │   │   ├── DayView.tsx         ← date nav header + Schedule/List mode toggle
│   │   │   ├── ScheduleMode.tsx    ← scrollable timeline + floating pool
│   │   │   ├── ListMode.tsx        ← flat sorted list
│   │   │   ├── AnchoredEvent.tsx   ← positioned on timeline at start_time
│   │   │   └── FloatingTask.tsx    ← lives in the floating pool
│   │   ├── week/
│   │   │   └── WeekView.tsx
│   │   ├── month/
│   │   │   └── MonthView.tsx
│   │   ├── planner/
│   │   │   └── PlannerShell.tsx    ← Day / Week / Month tab switcher + date navigation
│   │   └── settings/
│   │       └── SettingsView.tsx
│   └── pages/
│       ├── AuthPage.tsx
│       ├── TodayPage.tsx           ← DayView locked to today
│       ├── TreePage.tsx
│       ├── PlannerPage.tsx         ← PlannerShell with any date
│       ├── InboxPage.tsx
│       └── SettingsPage.tsx
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 4. TypeScript Data Models

```typescript
// src/types/index.ts

// ─── Tree ─────────────────────────────────────────────────────────────────────

export type NodeType = 'vision' | 'goal' | 'project' | 'task';
export type NodeStatus = 'not_started' | 'in_progress' | 'complete';

export interface TreeNode {
  id: string;
  userId: string;
  parentId: string | null;  // null = root; adjacency list — the only structural field
  type: NodeType;           // visual label only; any type can nest under any other
  title: string;
  notes: string | null;
  status: NodeStatus;
  position: number;         // ordering among siblings sharing the same parentId
  createdAt: string;
  updatedAt: string;
}

// ─── Inbox ────────────────────────────────────────────────────────────────────

export type InboxState = 'unassigned' | 'scheduled' | 'promoted';

export interface InboxItem {
  id: string;
  userId: string;
  content: string;                // single free-text field — no required structure
  state: InboxState;
  promotedNodeId: string | null;  // set when state = 'promoted'
  createdAt: string;
  updatedAt: string;
}

// ─── Day Items ────────────────────────────────────────────────────────────────

export type DayItemSource = 'standalone' | 'tree' | 'inbox';

interface BaseDayItem {
  id: string;
  userId: string;
  date: string;                   // 'YYYY-MM-DD'
  source: DayItemSource;
  title: string | null;           // populated for standalone; null for tree/inbox (use the referenced record's title)
  treeNodeId: string | null;
  inboxItemId: string | null;
  isComplete: boolean;
  position: number;               // ordering within the floating pool
  createdAt: string;
  updatedAt: string;
}

export interface AnchoredDayItem extends BaseDayItem {
  startTime: string;              // 'HH:MM' — presence of startTime defines anchored
  endTime: string | null;
}

export interface FloatingDayItem extends BaseDayItem {
  startTime: null;                // absence of startTime defines floating
  endTime: null;
}

export type DayItem = AnchoredDayItem | FloatingDayItem;

// ─── Week & Month Focus ───────────────────────────────────────────────────────

export type FocusSource = 'standalone' | 'tree' | 'inbox';

export interface WeekFocusItem {
  id: string;
  userId: string;
  weekStart: string;              // 'YYYY-MM-DD' — always a Monday
  source: FocusSource;
  title: string | null;          // for standalone items
  treeNodeId: string | null;
  inboxItemId: string | null;
  isComplete: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface MonthFocusItem {
  id: string;
  userId: string;
  monthStart: string;             // 'YYYY-MM-DD' — always the 1st of the month
  source: FocusSource;
  title: string | null;
  treeNodeId: string | null;
  inboxItemId: string | null;
  isComplete: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}
```

---

## 5. Implementation Phases

Each phase ends with something testable. No phase starts until the previous is confirmed working.

---

### Phase 1 — Foundation

**Goal:** Running app, Supabase connected, navigable shell, design tokens established.

- [ ] Scaffold: `npm create vite@latest northstar-v2 -- --template react-ts`
- [ ] Install dependencies: React Router, TanStack Query, @supabase/supabase-js, date-fns, @dnd-kit/core, vite-plugin-pwa
- [ ] `src/lib/supabase.ts` — client using existing Overload project URL + anon key (from `.env`)
- [ ] `src/styles/tokens.css` — full token set for dark mode: background layers, surface colors, text hierarchy, accent, border, radius, spacing scale, type scale
- [ ] `src/styles/global.css` — body, box-sizing reset, base font; references tokens only
- [ ] `useAuth` hook — reads current Supabase session; no new auth tables needed
- [ ] `AuthPage.tsx` — email/password sign-in form using existing credentials
- [ ] `App.tsx` — router with auth guard: unauthenticated → AuthPage; authenticated → nav shell
- [ ] Empty page components for all 5 nav routes
- [ ] `NavBar.tsx` — bottom nav on mobile, side nav on desktop; active route highlighted

**Testable:** App loads, sign-in screen appears, accepts existing Overload credentials, nav shell visible with five routes navigable and empty pages.

---

### Phase 2 — Tree

**Goal:** Full tree CRUD. Every other view references this — it must be solid before proceeding.

- [ ] Run SQL: `ns_tree_nodes` table + RLS policy
- [ ] `useTreeNodes` hook — fetch all nodes for user; mutations: create, update, delete, reorder
- [ ] `TreeView.tsx` — fetch flat list from Supabase; build parent→children map in memory; recursive render from root nodes
- [ ] `TreeNode.tsx` — renders one node; visual weight driven by type (Vision = largest/most dominant; Task = minimal); expand/collapse children
- [ ] `NodeConnector.tsx` — branch lines and indentation connectors that make the hierarchy spatial
- [ ] `NodeEditor.tsx` — create node (type, title, parent, notes); rename; change type; change status; delete
- [ ] Sibling reordering: drag with @dnd-kit; write updated `position` values on drop
- [ ] Status display: not_started (default); in_progress (accent indicator); complete (subdued opacity, remains visible — history matters)

**Testable:** Recreate the spec example tree. Visions are visually dominant compared to Tasks. Any type nests under any type. Drag to reorder siblings. Mark a node complete — it stays in the tree but visually subdued.

---

### Phase 3 — Inbox

**Goal:** Capture layer. Add freely, then act on items by scheduling or promoting.

- [ ] Run SQL: `ns_inbox_items` table + RLS policy
- [ ] `useInboxItems` hook — fetch items by state; mutations: create, update, delete
- [ ] `InboxView.tsx` — flat list, newest first; default view shows unassigned + scheduled; toggle to show all including promoted
- [ ] `InboxItem.tsx` — content display; state badge (scheduled shows period, promoted shows tree location)
- [ ] Quick-add: single text input at top; saves with `state = 'unassigned'`
- [ ] `InboxItemActions.tsx` — bottom sheet with three actions:
  - **Promote**: open `NodeEditor` pre-filled with inbox content; on save, create tree node, set inbox item `state = 'promoted'`, set `promoted_node_id`
  - **Schedule to day**: date picker → create `ns_day_items` record (`source = 'inbox'`); set inbox item `state = 'scheduled'`
  - **Schedule to week**: week picker → create `ns_week_focus` record (`source = 'inbox'`); set `state = 'scheduled'`
  - **Schedule to month**: month picker → create `ns_month_focus` record (`source = 'inbox'`); set `state = 'scheduled'`

**Testable:** Add items quickly. Promote one to a tree node — appears in tree, inbox shows promoted label. Schedule one to today — appears in Day view (Phase 4). Schedule one to next week — appears in Week view (Phase 5).

---

### Phase 4 — Day View

**Goal:** The most-used view. Any date, two modes, tree pulling.

- [ ] Run SQL: `ns_day_items` table + RLS policy
- [ ] `useDayItems(date: string)` hook — fetch all items for a date; mutations: create, update (complete/uncomplete, make anchored), delete
- [ ] `DayView.tsx` — date display header; Schedule / List mode toggle (one tap); prev/next day nav; jump-to-today button
- [ ] **List mode** (`ListMode.tsx`):
  - Anchored items sorted by `start_time`, time shown inline
  - Floating items below, no time shown
  - Check-off for both; quick-add floating standalone task
- [ ] **Schedule mode** (`ScheduleMode.tsx`):
  - Scrollable vertical timeline (00:00 – 23:59, 30-minute slots)
  - `AnchoredEvent.tsx` — positioned at its `start_time` on the timeline; shows duration if `end_time` set
  - Floating pool alongside timeline — `FloatingTask.tsx` with check-off
  - Drag a floating task onto timeline: sets `start_time`, converts it to anchored
- [ ] Pull from tree: tree browser in a bottom sheet; tap a node to add it to the day (`source = 'tree'`, `tree_node_id` set)
- [ ] **Two-table completion rule:** when checking off a `ns_day_items` record where `source = 'tree'`, the mutation must atomically set `is_complete = true` on the day item AND `status = 'complete'` on the referenced `ns_tree_nodes` row. Source = `'standalone'` and `'inbox'` update only `ns_day_items`.
- [ ] `TodayPage.tsx` — `DayView` locked to today's date; this is the default home screen

**Testable:** Open today, see day items including any inbox items scheduled to today. Add floating tasks and anchored events. Schedule mode shows events on the timeline with correct positions. Switch to list mode — same data. Navigate to any future date, plan the day, navigate away and back — plan persists.

---

### Phase 5 — Week & Month Views

**Goal:** Higher-resolution planning layers connected to the tree.

- [ ] Run SQL: `ns_week_focus` + `ns_month_focus` tables + RLS policies
- [ ] `useWeekFocus(weekStart: string)` and `useMonthFocus(monthStart: string)` hooks
- [ ] `PlannerShell.tsx` — Day / Week / Month tab switcher; date navigation header (prev/next + current period label); renders correct sub-view
- [ ] **Week view** (`WeekView.tsx`):
  - List of week focus items (standalone, tree refs, and inbox items scheduled to this week)
  - Pull from tree: add tree node as week focus item
  - Quick-add standalone week task
  - 7-column day strip — count of `ns_day_items` per day; tap column to open that day in Day view
- [ ] **Month view** (`MonthView.tsx`):
  - List of month focus items (same sources)
  - Pull from tree: add tree node as month focus item
  - Quick-add standalone month task
  - Week summary strip — tap row to jump to that week in Week view
- [ ] **Two-table completion rule:** when checking off a `ns_week_focus` or `ns_month_focus` record where `source = 'tree'`, the mutation must atomically set `is_complete = true` on the focus record AND `status = 'complete'` on the referenced `ns_tree_nodes` row. Source = `'standalone'` and `'inbox'` update only their own table.
- [ ] `PlannerPage.tsx` — wraps `PlannerShell`, opens on current week by default

**Testable:** Flag a tree node for this week — it appears in week view and remains in tree unchanged. Schedule an inbox item to next month — appears in month view. Navigate between weeks and months. Day strip in week view shows correct counts; clicking opens the right day.

---

### Phase 6 — PWA & Offline

**Goal:** Installable on phone and PC. Reads work without a network connection.

- [ ] `vite.config.ts` — configure vite-plugin-pwa; register service worker; Workbox strategies
- [ ] `public/manifest.json` — name, short_name, icons, theme_color (from token), background_color, display: standalone, start_url: `/`
- [ ] PWA icons — 192×192 and 512×512
- [ ] Workbox strategies: cache-first for static assets; network-first with cache fallback for Supabase reads
- [ ] TanStack Query `staleTime` and `gcTime` tuned so cached data survives offline use
- [ ] Offline indicator — unobtrusive banner when navigator.onLine is false
- [ ] Test install flow on both phone (Add to Home Screen) and desktop (browser install prompt)

**Testable:** Install on phone. Go to Airplane Mode. Open app — today's data is visible from cache. Return online — data syncs without manual refresh.

---

### Phase 7 — Settings & Polish

**Goal:** Production-quality feel. Nothing rough visible.

- [ ] `SettingsView.tsx`:
  - Account section: email from Supabase session; Sign Out button
  - Placeholder sections for future: Accent colour, Light mode, Notifications (visible but disabled)
- [ ] `updated_at` triggers — PostgreSQL function that auto-updates `updated_at` on row change; apply to all `ns_` tables
- [ ] Page transitions: fade on route change; tree node expand/collapse animation
- [ ] Mobile audit: tap targets ≥ 44px; scroll areas correct; no horizontal overflow on 375px viewport
- [ ] Loading states: skeleton placeholders on all data-fetching views
- [ ] Error states: retry prompt if any Supabase call fails
- [ ] Empty states: first-time prompts in Tree ("Add your first Vision"), Inbox ("Throw anything in here"), and Day view ("Nothing planned yet")

**Testable:** Full walkthrough of all five nav sections on a 375px mobile viewport. Everything loads smoothly, transitions feel intentional, no layout breaks. Sign out, sign back in — all data intact.

---

## 6. Open Assumptions

These three are not explicitly covered by the spec. Flag before implementation if the answer changes the schema or architecture.

---

### 1. Auth session — same credentials ≠ same session (MEDIUM CONFIDENCE)

The spec states "no new auth setup needed if the user is already signed in to Overload." However, Supabase sessions are stored in `localStorage` per origin — Northstar on a different domain will not inherit Overload's session automatically. **Assumption:** the user signs in to Northstar once using their existing email/password. Same account, same credentials, separate sign-in action. If both apps later live on the same origin (e.g. as Atlas subpaths), session sharing becomes automatic. **Schema impact:** none — purely a UX question.

---

### 2. Completion propagation — day item vs tree node (RESOLVED)

**Confirmed behaviour:** When a `ns_day_items` record with `source = 'tree'` is checked off, the mutation must update **two tables** atomically: set `ns_day_items.is_complete = true` AND set `ns_tree_nodes.status = 'complete'` on the referenced `tree_node_id`. Source = 'standalone' and source = 'inbox' day items update only `ns_day_items`. The same propagation rule applies to `ns_week_focus` and `ns_month_focus` records with `source = 'tree'`. Use a Supabase transaction (or sequential mutations with error handling) in the `useDayItems`, `useWeekFocus`, and `useMonthFocus` hooks to keep both rows in sync.

---

### 3. Schedule mode timeline hour range (RESOLVED)

**Confirmed:** Full 24-hour timeline — 00:00 – 23:59, scrollable, with 30-minute grid slots. No clamping needed; all valid `time` values fit. No schema impact — `start_time` is already a `time` column with no range constraint.

---

*This document is the technical companion to `Northstar-v2-SPEC.md`. No implementation begins until this plan is approved.*
