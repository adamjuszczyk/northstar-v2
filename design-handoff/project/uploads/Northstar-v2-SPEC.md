# Northstar v2 — Product Specification
**Version:** 2.0
**Last updated:** July 2026
**Author:** Adam
**Status:** Phase 1 complete — ready for technical planning

---

## 1. Vision

Northstar v2 is a personal life planning system. It has two jobs: show you where your life is going, and keep your days organised so you actually get there.

v1 failed because it felt like a collection of disconnected lists. v2 fixes this at the structural level — the tree connects your vision to your daily actions, the inbox catches everything you don't want to forget, and the day view feels like a real scheduler rather than another list.

This is the core of what will eventually become the Atlas personal dashboard. It is built as a standalone PWA now, designed to slot into Atlas later without rebuilding.

---

## 2. Who It's For

Single user. Personal life planning tool. No collaboration, no sharing.

---

## 3. Platform

**Web app built as a PWA (Progressive Web App)**

Used on both PC (planning, reviewing the tree) and phone (checking today, capturing to inbox on the go). Data must be shared between devices — Supabase backend is required in v2.

Connects to the **same Supabase project as Overload** — one login, one account, data unified from the start. This is the Atlas-readiness decision that matters now.

---

## 4. Data Storage and Auth

**Supabase** — same project as Overload
- PostgreSQL database
- Email/password auth (same credentials as Overload)
- Row Level Security on all tables
- Cross-device sync automatically

**Why not local storage:** Phone + PC usage with the same data. Same reason as Overload.

---

## 5. Core Concepts

### 5.1 The Tree

The tree is the backbone of Northstar. It represents your life — where you want to go and what it takes to get there.

**Four node types. Any node can nest under any other node.**

The type is a visual label, not a structural rule. You choose the type based on what the node feels like, not where it sits in the tree.

| Type | What it means | Visual treatment |
|---|---|---|
| **Vision** | A life destination. Not yet actionable. The "why" behind everything. | Largest, most dominant. Immediately distinguishable. |
| **Goal** | A strategic direction. May have no tasks yet — that's fine. | Prominent, but clearly below Vision. |
| **Project** | Bounded, concrete work with a defined end. This is where planning happens. | Clear, workmanlike. |
| **Task** | A specific, completable action. The leaves of the tree. | Minimal — content, not container. |

**The rules that don't exist:**
- A Goal under a Goal: allowed
- A Project under a Project: allowed
- A Project with no Tasks yet: allowed
- A Vision with nothing under it yet: allowed
- A Task directly under a Vision: allowed

The tree is valid at any stage of definition. You don't need to know your plan to capture your vision.

**Real example:**
```
VISION: Own a specific car
  └── GOAL: Earn money for it
        └── GOAL: Start a business
              └── PROJECT: Develop AI skills
                    ├── PROJECT: Build Atlas
                    │     └── TASK: Write SPEC.md
                    │     └── TASK: Design dashboard layout
                    ├── PROJECT: Build Northstar
                    └── PROJECT: Build Overload

VISION: Lead a specific lifestyle
  └── GOAL: Build physical foundation
        └── PROJECT: Follow PPL program consistently
              └── TASK: Log every session in Overload
```

**Node states:** Not started, In progress, Complete. Completed nodes are visually subdued but remain in the tree — history matters.

**The visual design requirement:** The tree must feel like a tree. Branches, visual connectors, clear indentation. The hierarchy is the meaning — if it looks like a flat list, the design has failed.

**Distinguishing Visions from everything else:** Visions sit at the top of the canvas, visually dominant, larger than everything below. When you open the tree view you should immediately see your life direction without reading a word.

### 5.2 Time Layers

Three time views. Each one lets you answer a simple question quickly.

**Month view** — "What am I focusing on this month?"
A compact overview. Active projects, key tasks flagged for this month, standalone monthly tasks. Not detailed — just enough to orient.

**Week view** — "What am I focusing on this week?"
More specific. Tasks and projects flagged for this week, standalone weekly tasks, a glance at each day.

**Day view** — "What am I doing today — and when?"
The most detailed. Two display modes, switchable with one tap:

**Schedule mode:**
A visual day timeline. Anchored events (time-specific — meetings, gym, appointments) sit on the timeline. Floating tasks (no specific time — things you'll complete during the day) live in a pool alongside the timeline. As the day progresses you check off floating tasks without needing to assign them a time. The schedule doesn't break if you wake up late or the day goes sideways.

**List mode:**
Everything flat. Anchored events shown with their time. Floating tasks shown without. Fast, simple, no visual overhead. Some days you don't need a schedule — you just need to see the list.

**Forward planning:** Any day view can be opened — past, present, or future. You plan Thursday on Tuesday night. You rough out next week on Sunday. The day view is a planner, not just a today tracker.

**Pulling from the tree:** From any time view you can flag tasks and projects from the goals tree to focus on in that period. They appear in the time view without leaving the tree — they exist in both places simultaneously.

**Standalone time tasks:** Add tasks directly to any day, week, or month with no goal parent. Not everything connects to a grand vision and that's fine.

### 5.3 Inbox

The capture layer. The notepad. The "I don't want to forget this" bucket.

A flat, unstructured list. No types, no hierarchy, no required fields. You throw things in from anywhere — a task you thought of, a half-formed goal, an idea, a reminder, something someone said you should look into.

From the Inbox, each item can be:
- **Scheduled** — assigned to a specific day, week, or month
- **Promoted** — moved into the goals tree as a node of any type
- **Left alone** — stays in the Inbox as a floating reminder

The Inbox is never empty for long and never needs to be. It's a holding area, not a to-do list. The discipline of emptying it is yours, not the app's.

---

## 6. Navigation Structure

```
Northstar v2
├── Tree        ← Goals, visions, projects, tasks (the backbone)
├── Today       ← Day view for today (default home)
├── Planner     ← Day / Week / Month views, any date
├── Inbox       ← Flat capture list
└── Settings
```

**Today** is the default home screen — you open the app and see your day. **Planner** is for any other date (forward planning, reviewing the past week, planning next month). The Tree is where you maintain your life vision. The Inbox is where things land before they have a home.

---

## 7. Design Direction

**The failure mode of v1:** Unclear while feeling like a list. Everything equal weight. No sense of connection between pieces.

**What v2 must feel like instead:**

The tree must look like a tree — branching, hierarchical, spatial. Visions are visually massive compared to tasks. The hierarchy should be obvious at a glance without reading labels.

The day view in schedule mode must feel like a calendar, not a list. Time flows visually. Anchored events have a clear time position. Floating tasks have a clear visual distinction from anchored events.

The overall app must feel connected — your vision connects to your goals connects to your projects connects to today's tasks. The user should feel that sense of connection even when navigating between sections.

**Dark mode.** Consistent with Overload — same Supabase project, will eventually share a design system in Atlas.

All colors and design tokens must be implemented as CSS custom properties. No hardcoded color values in components. This enables light mode, accent colour personalisation, and Atlas design system unification later.

---

## 8. Atlas Readiness

Two things make Northstar v2 Atlas-ready without any extra work now:

1. **Same Supabase project as Overload** — shared auth, unified data from day one. One login covers both apps. When Atlas is built, one account covers everything.
2. **Component architecture** — build views as self-contained components. What panels Northstar exposes to Atlas, how many, and what they show is an Atlas-level decision made when Atlas is built. No commitments now.

No rebuilding required when Atlas comes. Components get wrapped in panel shells — the data layer and logic stay exactly as built.

---

## 9. Out of Scope for v2

| Feature | Status |
|---|---|
| Habits | Deliberately removed — revisit in v3 after using the tree |
| Recurring targets | Deliberately removed — revisit in v3 |
| AI / Claude API integration | v3+ |
| Collaboration / sharing | Not personal |
| Calendar sync (Google, Apple) | Future |
| Notifications / reminders | Future |
| Atlas shell | Built separately when both apps are stable |

---

## 10. Key Differences from v1

| v1 | v2 |
|---|---|
| Local storage only | Supabase backend, cross-device |
| Four fixed node types in strict hierarchy | Four visual types, any nesting allowed |
| Habits and targets as core features | Removed — revisit later |
| Today-only day view | Any day, forward planning |
| No inbox | Inbox as core capture layer |
| Felt like disconnected lists | Tree connects vision to daily action |
| Goals drove daily items automatically | You pull from tree to time periods intentionally |

---

## 11. Success Criteria for v2

Northstar v2 is successful when:
- You open the tree and immediately see your life direction — Visions are unmistakable
- You can plan any future day and trust the plan will be there when that day comes
- Nothing important gets forgotten — the Inbox catches everything
- The day view in schedule mode feels like a real scheduler, not a list with times
- Your goals and your daily tasks feel connected, not like separate apps
- You have stopped using OneNote for anything this app covers

---

*This document is the source of truth for v2. Claude Code should read this before any technical planning begins.*
