# Northstar v3 — SPEC.md

*Product source of truth for v3. Supersedes the v2 SPEC.md — the old version is preserved at `SPEC-v2.md` in the repo root, not a git tag. This document restates what's carried forward from v2 plus everything new in v3, so it stands alone; nobody should need to go digging through another file to understand the product from here.*

---

## 1. Vision

Northstar is a personal life planning system with two jobs: show you where your life is going, and keep your days organised so you actually get there. The Tree connects vision to daily action, the Inbox catches everything you don't want to forget, and the planner is meant to feel like a real scheduler.

v3 exists because the planner still didn't match how a day actually runs — no fixed anchors (wake/sleep/work hours), no way to reserve a stretch of time for a *kind* of work without over-specifying it, no way to work a long task in sessions and pick up where you left off. v3 adds Lines, Blocks, Task Lists with automatic split, and Day Templates to close that gap, declutters the Tree with Sheets, narrows Today back down to *just today*, and splits Inbox into Notes vs. Tasks.

This is still the same product that's meant to become part of Atlas — no rebuild, same Supabase project as Overload, same component architecture. Atlas v1 is now actually live and connects to Northstar's widgets via its canvas system, which makes this constraint concrete rather than aspirational: v3's nav and renames should be checked against how Atlas currently consumes this app (see §3).

## 2. Who it's for

Single user (Adam). No collaboration, no sharing.

## 3. Platform, data & Atlas readiness

**Platform:** PWA, used on both PC (planning, reviewing the tree) and phone (checking today, capturing to inbox on the go).

**Data:** Supabase — same project as Overload, `ns_` table prefix, email/password auth shared with Overload, RLS on all tables, cross-device sync. Required because data must move between PC and phone in the same workflow. New v3 tables follow the same `ns_` convention (see §9).

**Atlas readiness:** Northstar was built to slot into Atlas without rebuilding — same Supabase project as Overload (unified auth/data from day one), self-contained components (Atlas decides how to panel them, not Northstar). Atlas v1 is now live and connects to Northstar via its widget/canvas system with a connection layer where extensions send requests to Atlas rather than writing to each other directly. **v3 should treat this as a real constraint, not a note**: the sidebar restructure (Day/Week/Month split out, new Goals screen) and the Focus→Goals rename could affect whatever widgets Atlas currently pulls from Northstar. Worth a quick check against Atlas's current integration points before or during Phase 3, not something to discover after shipping.

**Repo:** v3 continues in the existing `northstar-v2` repo. This is a feature deepening of the same product, not a new product concept, and needs no new infrastructure — unlike the v1→v2 jump, which required migrating from local storage to Supabase and justified a fresh repo. No rebuild here.

## 4. Core concepts carried forward from v2

### 4.1 The Tree
The backbone — represents your life, where you want to go and what it takes to get there. Four node types, and **any node can nest under any other node** — type is a visual label, not a structural rule:

| Type | What it means | Visual treatment |
|---|---|---|
| **Vision** | A life destination. Not yet actionable. The "why" behind everything. | Largest, most dominant, unmistakable at a glance. |
| **Goal** | A strategic direction. May have no tasks yet — that's fine. | Prominent, but clearly below Vision. |
| **Project** | Bounded, concrete work with a defined end. Where planning happens. | Clear, workmanlike. |
| **Task** | A specific, completable action. The leaves of the tree. | Minimal — content, not container. |

Rules that deliberately don't exist: a Goal under a Goal, a Project under a Project, a Project with no Tasks yet, a Vision with nothing under it, a Task directly under a Vision — all allowed. The tree is valid at any stage of definition.

Node states: Not started / In progress / Complete. Completed nodes are visually subdued but stay in the tree — history matters.

**Visual requirement:** the tree must *look* like a tree — branches, connectors, indentation. If it reads as a flat list, the design has failed. Visions sit visually dominant at the top; opening the tree should show life direction without reading a word.

### 4.2 Time Layers (baseline)
Three views, each answering one question fast: Month ("what am I focusing on this month?"), Week ("this week?"), Day ("what am I doing today, and when?").

Day view's base vocabulary — **Anchored** items (time-specific: meetings, gym, appointments, sit on the timeline at their time) and **Floating** items (no specific time, live in a pool, checked off without needing a time slot) — still holds in v3. Blocks and Lines *extend* this vocabulary rather than replace it: a Line is a new anchored-but-content-free marker type; a Block is a new anchored-but-container type. Scheduling a task directly at a specific time, or leaving it floating in the pool, remains available without wrapping it in a Block.

Forward planning (any date, past/present/future) and pulling flagged items from the Tree into a time period both carry forward unchanged. Standalone time tasks (no tree parent) remain supported.

### 4.3 Inbox (baseline)
The capture layer — flat, unstructured, no required fields, a holding area rather than a to-do list. Each item can be Scheduled, Promoted to the tree, or Left alone. v3 splits this into Notes and Tasks (§6) but the underlying "catch everything, no discipline required" philosophy is unchanged — only Tasks promote to the tree; Notes don't.

### 4.4 Habits
Deferred in the original v2 spec ("revisit in v3"), but actually pulled forward and fully built during v2 — build modes (daily/weekly/x_per_week/x_per_day), a minimal reduce mode, trend charts, tree node linking, auto-add to day/week/month. Habits' own tracking (counters, build/reduce mode, trend charts) is unchanged by v3.

**One deliberate extension, decided during Phase 4:** habit-sourced day items get Task Lists (steps) too, same as tree/inbox/standalone items — a habit's day item can optionally carry a checklist, entirely independent of its own counter/build-reduce tracking; the two layers coexist without either one replacing the other. This part works and stays.

**Split, however, is explicitly out of scope for habits.** Real use surfaced it behaving oddly, and there's a genuine conceptual mismatch worth naming rather than treating as a bug to chase: Split's whole point is shared step-progress across occurrences of the *same* ongoing task, while a habit's `x_per_day`/`x_per_week` target is about repeating a *discrete* action N independent times — sharing one checklist's progress across those repetitions doesn't match what a habit target actually means. Deprioritized, not solved; revisit only if it's ever worth the design work, not on the current v3 timeline.

**Recurring targets** (the v1 concept: quantity + time window + promotes to a habit) never came back after v2 dropped it — habits absorbed a similar idea via the `x_per_week`/`x_per_day` frequency modes, but the specific target→habit promotion mechanic is gone. Not part of this v3 list either; flagging as a deliberate non-revival rather than an oversight.

## 5. Core concepts — new in v3

### 5.1 Lines
A **Line** is a named marker at a fixed time on the day timeline — e.g. "Wake up" at 07:00, "Work starts" at 09:00, "Sleep" at 23:00. Purely a visual anchor: no content, no completion state, not a container. A day's lines can come from an applied Day Template or be added/edited by hand; editing them only affects that day (applying a template is a one-time stamp, not a live link back to the template).

### 5.2 Blocks
A **Block** is a scheduled time-range container, **freely named by you** — "Focused Work," "Meeting," "Gym," anything that fits. Not a type picked from a fixed list; a plain label, same as naming anything else in the app. Rendered on the timeline like an anchored item. Every block, regardless of name, can optionally hold:
- 0+ assigned tasks (from Tree, Inbox, or a Task List)
- freeform notes (agenda, plan, whatever)

There's no behavioral split by name — a block called "Meeting" and one called "Gym" both get the same optional notes + optional tasks capability. The name is a label, not a mode.

A block is a time reservation, not itself a completable unit — completion lives on whatever tasks are assigned inside it, if any. It coexists with the existing "custom block colours" behaviour in Day view (kept as a separate, lighter-weight option per TASKS.md's A4) rather than replacing it — worth revisiting if the two feel redundant once you're actually using both, but not consolidated for now.

### 5.3 Task Lists & Split
Every task is modeled as an **ordered list of one or more steps**. A plain task is a list with one (hidden) step; a "task list" is a list with 2+ steps shown as a checklist. Progress — which steps are done — lives on the task/list itself, not on any particular time it's scheduled.

**Creatable everywhere a task can be created** — Tree, Inbox, and Day. Choosing "list" as the kind of task happens at creation time in any of these three places, not only retroactively after something's already been scheduled to a day. Steps can still be added or edited later from Day view too, but that's not the only entry point.

**Step management:** within a list, steps can be renamed, deleted, and reordered — as easily as managing items anywhere else in the app (Inbox, Tree). Not a buried or awkward flow.

**Display:** every step stays visible, always — done and not-done alike. Checking a step off marks it (checkmark, strikethrough, whatever reads clearly) but never removes it from view. "Automatic resume" (below) governs which step gets emphasis as next, not what gets rendered — steps disappearing from view the moment they're checked is exactly the behavior this section rules out.

**Completion is derived, not directly settable, for list tasks:** a task with 2+ steps can't be checked off directly through the ordinary single completion checkbox — that control is disabled for list tasks. It becomes complete automatically, and only, once every step is done. A plain (1-step) task keeps the ordinary direct checkbox.

**Visual distinction:** wherever a day item renders (timeline, pool, list mode, week/month grids), a list task needs a clear, glanceable indicator that it's a list rather than a plain task — e.g. a small checklist icon plus a step count ("1/3") — discoverable at a glance, not only after opening it.

**Split** = adding another occurrence of the *same* task/list to today, immediately, as a floating (unscheduled) item in the pool — no time-picker step, no modal asking for a slot. It's still the same shared task entity, never an independent duplicate; drag it onto the timeline afterward if you want it at a specific time, same as any floating item. Triggered via the explicit Split action on an already-scheduled task — this is the only way the same task should ever appear twice in a day; trying to add it any other way should redirect into Split rather than create a genuine second copy.

**Progress carries over automatically** (confirmed): opening a later occurrence surfaces/focuses the next not-done step, live — this is about which step gets emphasis for picking up where you left off, not about which steps are visible (see Display, above). Marking a step done in a morning session immediately updates what an afternoon session shows — no manual re-assignment of which steps belong to which session.
- *Edge case:* if a later occurrence is opened after everything's already done, it shows an "all done" state rather than an empty screen.
- Applies to plain single-step tasks too — a second occurrence of a plain task just shows "already done" once the first is completed.

### 5.4 Day Templates
A named, reusable layout of Lines + Blocks at fixed times (e.g. Wake 7:00 / Focused Work 8–12 / Gym 12–15 / Focused Work 16–20 / Sleep 21:00). Applying a template to a day creates real Line/Block entries for that specific day — a stamp, not an ongoing rule, and always merges alongside whatever's already on the day rather than replacing it.

Managed from Settings, applied via an action in Day view. **Creating a new template must also be reachable directly from that same Day/Planner entry point** — not only from Settings. Someone applying a template and realizing they don't have the right one yet shouldn't have to back out and navigate elsewhere.

**Save a day as a template:** alongside building one from scratch, an existing day's actual Lines/Blocks should be saveable directly as a new template — a reverse/copy flow, not only forward creation. A one-time copy, same as applying a template is a one-time stamp — editing the day afterward doesn't change the template it was saved from.

**Future direction, not this pass:** template creation today is a form (set times, add items to a list) rather than visual. A mockup-timeline creator — reusing the existing Day timeline's rendering (LineMarker/BlockCard) so you see what you're building as you build it — is worth doing, but it's a real UI project on its own, not a quick add. Deferred; recorded here and in §11 so it isn't lost.

### 5.5 Sheets
A **Sheet** is a separate tree structure — its own nodes — created either:
- fully detached (blank canvas, built independently, attached to a node in the main tree later), or
- launched directly from an existing node (moves that node's subtree out into its own dedicated canvas).

An attached sheet is anchored to a node in the main tree; that node shows an "open sheet" indicator instead of rendering the full subtree inline — that's the whole point of decluttering. Sheets are named and switchable via tabs at the top of the tree screen.
*Assumption to confirm:* nodes inside an attached sheet still count toward the anchor node's existing descendant indicators (child count badges, "has scheduled descendant" dot in `TreeNodePicker`) — otherwise those become inaccurate the moment something moves into a sheet.

### 5.6 Goals (rename)
"Focus" is renamed to **Goals** in the UI (week and month). Underlying `ns_week_focus`/`ns_month_focus` tables keep their names — this is a label change, not a schema rename, unless Phase 2 decides otherwise.

The standalone Tasks sections (added in v2) gain:
- **Add from tree/inbox** (multi-select, same pattern as `DayItemForm`/`FocusItemForm`) at both week and month level.
- **Week's Tasks section additionally gains "add from month's task list"** — pull an item down from Month into Week.

## 6. Screen-by-screen changes

### 6.1 Planner (Day / Week / Month)
- Day, Week, Month become separate sidebar items instead of tabs inside one Planner screen.
- Day view gains Lines, Blocks, Task Lists/Split, and Day Template application.
- Week/Month mini-calendars switch from showing task *count* to showing **done vs. not-done counts** per day.
- Week/Month Focus → **Goals**; Tasks sections gain tree/inbox add (and week gains "from month") per §5.6.

### 6.2 Today
- **Timeline** — always fully scrollable across all 24 hours; nothing is ever cut or hidden. Opening Day view on **today specifically** auto-scrolls so the current time sits centered in the viewport — a starting scroll position, not a restriction on what's viewable. No Settings toggle for this; it's the only behavior, not a configurable option. Viewing any other date doesn't auto-center on "now" (there's no coherent "current time" for a day that isn't today) — opens at a sensible default position instead.
- **Current-time indicator** — the line marking "now" on the timeline renders only when viewing today. It must not appear when forward-planning a future day or reviewing a past one; showing "now" on a day that isn't today is confusing, not informative.
- **Today's Reflection section removed.**
- **Week/Month focus section removed entirely from Today** — no pull-into-today mechanic sits passively on the Today screen itself; that's what retires the `WeekPoolPanel` built in the July 20 session. Scheduling still primarily happens by adding items directly to a day: the Day "add item" flow (Tree/Inbox/Habit tabs) gained a **Week/Month tab** so you can pull a Goal/Task from the current week or month while adding something to a specific day — same mechanism as pulling from Tree or Inbox, just a different source. **Separately, WeekView/MonthView keep their own direct "Pull to today" button** — a quick shortcut for the common case, deliberately coexisting with the Week/Month tab rather than being replaced by it. Two paths to the same result, both intentional.

### 6.3 Inbox
- **Notes** and **Tasks** become separate sections/tabs, each with its own capture flow. The existing filter bar (All/Unassigned/Scheduled/Promoted/Completed) applies only to Tasks — Notes has no states to filter.
- **Finished tasks hidden by default** (default filter changes; still viewable on demand).

### 6.4 Tree
- Sheets per §5.5.

### 6.5 Goal screen (new)
A dedicated screen surfacing current week/month Goals in one place. Primarily a display/overview surface (mark-complete supported); creating new Goals still happens from the Week/Month planner views. *Flagged as an assumption — say if you want goal creation here too.*

### 6.6 Settings
- Language toggle: Polish / English, same pattern as the existing dark/light and accent switchers. All UI strings externalized.

## 7. Navigation structure

```
Sidebar
├─ Today
├─ Day
├─ Week
├─ Month
├─ Goals        (new)
├─ Inbox        (Notes | Tasks)
├─ Tree         (sheet tabs on canvas)
├─ Habits
└─ Settings
```

## 8. Design principles

Carried forward from v2, and still the bar for everything new in v3, not just the original screens:
- **The tree must look like a tree** — branching, hierarchical, spatial, Visions visually dominant. Sheets don't get an exemption from this just because they're a separate canvas — a sheet should feel like *more tree*, not a different kind of screen.
- **The day view must feel like a calendar, not a list** — time flows visually, anchored items have a clear time position. Blocks and Lines need to reinforce this, not undercut it with another flat list dressed up as a timeline.
- **The app must feel connected** — vision → goals → projects → today's tasks, felt even when navigating between sections. The new Goals screen and the Week/Month "add from tree/inbox" features are in service of this, not just convenience.
- All colours and design tokens as CSS custom properties (`tokens.css`) — no hardcoded hex anywhere.
- Dark mode primary, celestial aesthetic, gold `#F6C87A` accent, Space Grotesk + JetBrains Mono.

## 9. Data model implications (high level — full modeling is TASKS.md's job)

- Tasks become one entity with an ordered step list, referenced by possibly-multiple schedule occurrences (the split mechanic) rather than one-to-one rows.
- Likely new tables: `ns_lines`, `ns_blocks`, `ns_day_templates` (+ template contents), `ns_sheets` (+ a parent/anchor reference into `ns_tree_nodes`).
- Existing `ns_day_items` schema needs an occurrence model for split (referencing a shared task id) instead of one independent row per scheduled task.
- `ns_week_focus`/`ns_month_focus` stay as-is, UI-relabeled to Goals.

## 10. Explicitly out of scope for v3

| Feature | Why deferred |
|---|---|
| Auto-recurring Day Templates (e.g. auto-apply by weekday) | Manual apply only for v3; revisit once templates are in daily use |
| Sheet-level analytics/rollup dashboards | Not requested; sheets are for decluttering, not reporting |
| Notes → Tree promotion | Only Tasks promote to Tree, per existing Inbox behaviour |
| Languages beyond Polish/English | Two-language toggle only |
| Multi-user / shared sheets or trees | Still a single-user app |
| Recurring targets (v1 concept: quantity + window + promote-to-habit) | Not part of the v3 build. Habits' frequency modes cover part of this today, but the dedicated bridge concept is a real future idea, not a dead one — see §11 |
| AI / Claude API integration | Still deferred — core UX first, per the standing v2 decision |
| Calendar sync (Google, Apple) | Still deferred |
| Notifications / reminders | Still deferred |
| Collaboration / sharing | Not personal — still out of scope |

## 11. Future versions (ideas, not commitments)

- Auto-apply Day Templates by day-of-week rule
- Relative-time templates (offsets instead of fixed clock times)
- Lightweight rollups per sheet (e.g. "N open under this branch")
- Visual (mockup-timeline) Day Template creator, reusing LineMarker/BlockCard rendering so a template is built by seeing it, not just filling in times — real scope on its own, deliberately deferred out of Phase 5
- Calendar sync, notifications, Claude API-assisted planning (carried from v2's future list, still unscheduled)
- Recurring targets, as originally conceived in v1 (quantity + time window + optional promote-to-habit) — Habits' `x_per_week`/`x_per_day` modes cover part of this today, but the dedicated bridge concept between a goal and a habit is still an open idea worth its own pass

## 12. Success criteria for v3

Still true from v2, unchanged by this pass:
- Opening the tree immediately shows life direction — Visions are unmistakable.
- The goals and daily tasks still feel connected, not like separate apps.

New for v3:
- A day can be built from Lines + Blocks + Task Lists, a Day Template can populate one in one action, and week/month calendars show accurate done/not-done counts.
- A multi-step task split across 2+ blocks in a day resumes automatically at the next open step in every session.
- Today shows only today — no reflection, no week/month section — and reaching a day happens either through the "add to day" flow (Tree/Inbox/Habit/Week-Month tabs) or the direct "Pull to today" shortcut kept in Week/Month views.
- Inbox cleanly separates Notes and Tasks; finished tasks are hidden by default.
- Tree supports creating, naming, and switching Sheets, built either from scratch or from an existing node, without breaking existing descendant-count indicators elsewhere in the app.
- Full UI works in Polish and English via a Settings toggle.
- The new Goals screen shows current week/month goals pulled from existing focus data under its new name.
- Atlas's existing integration with Northstar still works after the nav/rename changes (checked, not assumed).

---

*This document is the source of truth for v3. Claude Code should read this before any technical planning begins.*
