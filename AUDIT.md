# Northstar v2 — Audit Tracker
Source: Fable 5 technical audit, July 2026

---

## Fixed
- FIX 1: B1 + B2 + B2b — offline mutations dead code (July 7, commit 8991dbb)
- FIX 2: S1 — RLS scripts generated (verify_rls.sql + enforce_rls.sql) — run manually in Supabase
- FIX 3: S2 + S3 — sign-out added, queryClient.clear() on auth change, Dexie wiped on sign-out (July 7, commit 8991dbb)
- FIX 4: B4 + B5 — week-start key corruption fixed, MonthView respects setting (July 7, commit 8991dbb)
- FIX 5: B6 + B7 — drag preserves duration, end > start validation in both forms (July 7, commit 8991dbb)
- FIX 6: B3 — sync queue entries scoped per user_id (July 7, commit 8991dbb)
- FIX 7: B8 — completion semantics consistent across day/week/month views (July 7, commit 8991dbb)
- FIX 8: B10 — week view resolves titles for tree/inbox items, no bare glyphs (July 7, commit 8991dbb)
- FIX 9: B11 — today refreshes on visibilitychange and at midnight (July 7, commit 8991dbb)
- FIX 10: B12 + B13 — Untitled not baked in on edit, env var error surfaced clearly (July 7, commit 8991dbb)
- FIX 11: P1 — Dexie compound index [userId+date] added with version bump to v4 (July 7, commit 8991dbb)
- FIX 12: Q6 — settings validated on load from localStorage before applying (July 7, commit 8991dbb)

---

## Pending your action
- S1 (RLS): run scripts/verify_rls.sql then scripts/enforce_rls.sql in Supabase SQL editor
- P1 (Dexie v4): test offline on real phone (airplane mode → capture inbox item → reconnect → verify sync)

---

## Deferred (not urgent for personal use)
### Architecture
- A1: offline layer is three disconnected caches with no coherent policy — needs deliberate rebuild
- A2: useAuth is a hook not a context — auth subscription fan-out
- A3: two competing type systems, one dead (types/index.ts unused)
- A4: copy-paste feature triplication (useWeekFocus, useMonthFocus, schedule mutations)
- A5: multi-step mutations with no atomicity — belong in Postgres RPC functions
- A6: no error boundary — any render throw white-screens the app
- A7: query keys are scattered string literals, no central key factory
- A8: layout constants (PXH, TOPPAD) live in the data layer (useDayItems.ts)
- A9: shared Supabase project with Overload — intentional, Atlas decision
- A10: zero test infrastructure

### Performance
- P2: reordering N siblings issues N sequential UPDATEs — use upsert or RPC
- P3: 698 KB single JS chunk — no route-level code splitting
- P4: select('*') + whole-table fetches — grows linearly with usage
- P5: per-minute full-timeline re-render — unmemoized children
- P6: auth subscription fan-out (dozens of getSession() per screen mount)

### Security
- S4: no CSP / security headers in vercel.json or index.html

### Code Quality
- Q1: db shadowing footgun in useInboxItems.ts:126
- Q2: error feedback inconsistent — toggle/delete actions show no error on failure
- Q3: dead code (prefetchWeekFocus, Dexie treeNodes write-only, unused types)
- Q4: duplicated micro-logic drifting apart (normPriority, formatTimeLabel, error allowlist)
- Q5: user!.id non-null assertions in queryFns
- Q7: CSS module duplication across WeekView and MonthView

### Edge Cases
- E1: two-device conflict handling (queue replay is blind last-write-wins)
- E2: poison queue entries retry forever — no dead-letter, no attempt count
- E3: scheduling to the past allowed — no min date on inbox date picker
- E4: midnight/rollover family beyond B11
- E5: Dexie open failure unhandled — no degraded online-only mode
- E6: un-promoting / re-triage doesn't exist — inbox items permanently "PROCESSED"
- E7: useReorderNodes partial failure leaves torn server state
- E8: same-position inserts — all creates hardcode position: 0

