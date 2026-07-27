# Northstar v3 — SPEC.md

*Product source of truth for v3. Supersedes the v2 SPEC.md — the old version is preserved permanently at the `v2-final` git tag, so nothing is lost by overwriting. This document restates what's carried forward from v2 plus everything new in v3, so it stands alone; Claude Code shouldn't need to go digging through tag history to understand the product.*

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
Deferred in the original v2 spec ("revisit in v3"), but actually pulled forward and fully built during v2 — build modes (daily/weekly/x_per_week/x_per_day), a minimal reduce mode, trend charts, tree node linking, auto-add to day/week/month. Nothing changes for Habits in this v3 pass; noted here only so the "revisit in v3" line in the old spec doesn't look unresolved.

**Recurring targets** (the v1 concept: quantity + time window + promotes to a habit) never came back after v2 dropped it — habits absorbed a similar idea via the `x_per_week`/`x_per_day` frequency modes, but the specific target→habit promotion mechanic is gone. Not part of this v3 list either; flagging as a deliberate non-revival rather than an oversight.

## 5. Core concepts — new in v3

### 5.1 Lines
A **Line** is a named marker at a fixed time on the day timeline — e.g. "Wake up" at 07:00, "Work starts" at 09:00, "Sleep" at 23:00. Purely a visual anchor: no content, no completion state, not a container. A day's lines can come from an applied Day Template or be added/edited by hand; editing them only affects that day (applying a template is a one-time stamp, not a live link back to the template).

### 5.2 Blocks
A **Block** is a scheduled time-range container, typed (starting set: *Focused Work*, *Meeting* — extensible). Rendered on the timeline like an anchored item, but can optionally hold content:
- **Focused Work block** — 0+ tasks assigned inside it (from Tree, Inbox, or a Task List).
- **Meeting block** — freeform notes (agenda/plan) and/or assigned tasks.

A block is a time reservation, not itself a completable unit — completion lives on whatever tasks are assigned inside it, if any. This formalizes and replaces the existing "custom block colours" behaviour in Day view.

### 5.3 Task Lists & Split
Every task is modeled as an **ordered list of one or more steps**. A plain task is a list with one (hidden) step; a "task list" is a list with 2+ steps shown as a checklist. Progress — which steps are done — lives on the task/list itself, not on any particular time it's scheduled.

**Split** = scheduling the *same* task/list into more than one time slot in a day, as separate lightweight occurrences that reference the one shared entity — never a duplicate copy. Once a task is already scheduled that day, adding it again offers **Split** instead of creating a second independent task.

**Progress carries over automatically** (confirmed): each occurrence shows the next not-done step onward, live. Marking a step done in a morning session immediately updates what an afternoon session shows — no manual re-assignment of which steps belong to which session.
- *Edge case:* if a later occurrence is opened after everything's already done, it shows an "all done" state rather than an empty screen.
- Applies to plain single-step tasks too — a second occurrence of a plain task just shows "already done" once the first is completed.

### 5.4 Day Templates
A named, reusable layout of Lines + Blocks at fixed times (e.g. Wake 7:00 / Focused Work 8–12 / Gym 12–15 / Focused Work 16–20 / Sleep 21:00). Applying a template to a day creates real Line/Block entries for that specific day — a stamp, not an ongoing rule. Managed from Settings or a lightweight "Templates" library; applied via an action in Day view.

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
- **Timeline focus** — the visible window on Today's timeline becomes configurable (e.g. work hours, or a rolling ±N hours around now) rather than always showing the full day.
- **Today's Reflection section removed.**
- **Week/Month focus section removed entirely** — no pull-into-today mechanic at all. This retires the `WeekPoolPanel` built in the July 20 session. Scheduling only happens by adding items directly to a day; to make Week/Month items reachable from there, the existing Day "add item" flow (which already has Tree/Inbox/Habit tabs) gains a **Week/Month tab** so you can pull a Goal/Task from the current week or month while adding something to a specific day — same mechanism as pulling from Tree or Inbox, just a different source.

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
- Calendar sync, notifications, Claude API-assisted planning (carried from v2's future list, still unscheduled)
- Recurring targets, as originally conceived in v1 (quantity + time window + optional promote-to-habit) — Habits' `x_per_week`/`x_per_day` modes cover part of this today, but the dedicated bridge concept between a goal and a habit is still an open idea worth its own pass

## 12. Success criteria for v3

Still true from v2, unchanged by this pass:
- Opening the tree immediately shows life direction — Visions are unmistakable.
- The goals and daily tasks still feel connected, not like separate apps.

New for v3:
- A day can be built from Lines + Blocks + Task Lists, a Day Template can populate one in one action, and week/month calendars show accurate done/not-done counts.
- A multi-step task split across 2+ blocks in a day resumes automatically at the next open step in every session.
- Today shows only today — no reflection, no week/month section — and the only way anything reaches a day is through the "add to day" flow (Tree/Inbox/Habit/Week-Month tabs).
- Inbox cleanly separates Notes and Tasks; finished tasks are hidden by default.
- Tree supports creating, naming, and switching Sheets, built either from scratch or from an existing node, without breaking existing descendant-count indicators elsewhere in the app.
- Full UI works in Polish and English via a Settings toggle.
- The new Goals screen shows current week/month goals pulled from existing focus data under its new name.
- Atlas's existing integration with Northstar still works after the nav/rename changes (checked, not assumed).

---

*This document is the source of truth for v3. Claude Code should read this before any technical planning begins.*
