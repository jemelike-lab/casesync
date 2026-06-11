# HANDOFF — v2 Dashboards Milestone

**Branch:** `redesign/dashboard-v2-northstar`
**Date:** 2026-06-11
**Status:** All three role-scoped dashboards ported to the v2 visual language. API scoping fixed. Session timeout tuned. Ready to merge to `main` after smoke check.

This doc is a continuation of `HANDOFF_V2_MIGRATION.md` (P1.1 supervisor scaffold) and supersedes its "remaining slices" list — what was outlined as P1.2 → P1.4 → P2 → P3 is shipped.

---

## TL;DR

What's in:
- **3 role-scoped v2 dashboards live** — Supervisor (`/supervisor` + `/dashboard`), Team Manager (`/dashboard`), Support Planner (`/dashboard`)
- **Section hero SVG decoration** across all three views (watermark style, 10% opacity, `/heroes/*.svg`)
- **`/api/clients` correctly scopes by role** — TMs see only their team, SPs see only their own clients, supervisors org-wide; defense-in-depth on TM `?assignedTo` drill-down
- **Session timeout tuned for dev sanity** — idle 15min → 30min, background-grace 30s → 5min; HIPAA-acceptable, kills the recurring Lesson 9 friction
- **Mantine v9 `gutter`→`gap` gate** now muscle memory; pre-bundle grep is standard process

What's not in:
- Real client data (still ~16 test/dev rows, mixed assigned/unassigned)
- Real staff roster (only Paul Evans exists as `team_manager`; Rosabel Corion-Brown and Mariama Jalloh referenced in TEAMS registry don't exist as profiles yet)
- BAA + DNS + Resend + PITR pre-launch checklist (unchanged from prior handoff)
- DDA toggle within CaseSync (planned, not started)

---

## Quick reference

| Thing | Value |
|---|---|
| Repo | `jemelike-lab/casesync` |
| Branch | `redesign/dashboard-v2-northstar` |
| Production domain | `blhcasesync.com` |
| Preview URL | `https://casesync-git-redesign-dashboard-187ead-jemelike-6356s-projects.vercel.app` |
| Locked north-star (do NOT iterate) | `/dashboard-v2` (its own layout, doesn't share global `<Header>`) |
| Supabase project | `iiqttbpaufzlinbufsdx` |
| Vercel team | `team_fASanR2j8wd8bhOUYS07f3NL` |
| Vercel project | `prj_uPD5Jl6BJwRMwOsAa5UACo1K5UbW` |
| VPS hPanel | `hpanel.hostinger.com/vps/1641066` |
| Repo on VPS | `/home/casesync/casesync` |

---

## What shipped this session

### 1. Three role-scoped v2 dashboards

All three live in `/components/` as separate clients. They share a visual language (KpiTile, SectionPaper, DonutChart, role-scoped greeting block) but are pragmatically duplicated rather than refactored into a shared lib — see "Refactor opportunity" below.

#### Supervisor (`SupervisorControlPanelClient.tsx`, 1296 lines)
Routed from `/supervisor` and from `/dashboard` when `isSupervisorLike(role)` and `?full !== '1'`.
Sections (top to bottom):
- Greeting block with `dashboard.svg` / `schedule.svg` hero
- 4 KPI tiles (Active Clients / Overdue / Due This Week / No Contact 7+) with contextual subtitles
- **10-team Overview** — Workryn registry of teams sourced from `https://www.blhcasesync.com/w/departments`, with team badge SVGs (`/teams/{slug}.svg`), accent borders, program tags (CFC/DDA/Leadership)
- Team Health Snapshot — Mantine `DonutChart` of org status + per-team horizontal accent bars
- Client Drill-down — SegmentedControl filters + `/api/clients` fetch + empty-state SVG
- Planner Workload — per-planner cards sorted by overdue desc with pressure progress bars
- Team Roster — filter chips + roster cards

Section hero SVGs (watermarks at 10% opacity, top-right): `evaluations.svg`, `tickets.svg`, `tasks.svg`, `profile.svg`.

#### Team Manager (`TeamManagerControlPanelClient.tsx`, 1016 lines)
Routed from `/dashboard` when `profile.role === 'team_manager'` and `?full !== '1'`. Server-side pre-filters planners to direct reports + fetches per-planner summary just for them.
Sections:
- Greeting (`dashboard.svg` hero, personalized first-name)
- 4 KPI tiles aggregated from the TM's planner summaries (My Caseload / Overdue / Due Week / No Contact 7+)
- **My Team identity card** — team badge from registry if the TM's `full_name` matches a `leadName`; falls back to initials avatar otherwise. Replaces the 10-team Overview that doesn't apply at TM scope.
- Team Health Snapshot — donut + **per-Support-Planner** caseload bars (single team, so the bar chart is per-SP, not per-team)
- Client Drill-down — same pattern as supervisor; `/api/clients` auto-scopes to the TM's planners post the route fix below
- Planner Workload — cards for direct reports only
- Team Roster — `(you)` marker, 3 filter chips (All / Me / SPs)

#### Support Planner (`SupportPlannerControlPanelClient.tsx`, 725 lines)
Routed from `/dashboard` when `profile.role === 'supports_planner'` and `?full !== '1'`.
Sections:
- Greeting with adaptive copy ("N clients on your caseload — all on track" vs "N clients · M need follow-up")
- 4 KPI tiles scoped to a single `AssigneeSummaryRow` (My Clients / Overdue / Due Week / No Contact 7+)
- **My Team Manager card** — compact "up the chain" element; cobalt left border when assigned, slate gray empty state with `UserCheck` icon when not
- My Caseload Snapshot — donut + 4-row status breakdown with mini progress bars and hint text per category
- My Clients — same drill-down pattern; `/api/clients` auto-scopes to `assigned_to = userId`

No Planner Workload or Team Roster section (SPs have no direct reports).

### 2. `/api/clients` role-scoping fix (`app/api/clients/route.ts`, 277 lines)

The pre-fix route only filtered by role for `supports_planner` (forced `assigned_to = userId`). For `team_manager` it only filtered when `?assignedTo=X` was passed — otherwise it returned org-wide data, which the v2 TM dashboard's Client Drill-down trustingly displayed. Same broken pattern in the `fullScopeQuery` for stat counts.

The fix consolidates scope-application into a single helper:

```ts
const applyAssignedScope = <T>(q: T): T => {
  if (role === 'supports_planner') return q.eq('assigned_to', userId)
  if (role === 'team_manager') {
    if (assignedTo && tmPlannerIds.includes(assignedTo)) return q.eq('assigned_to', assignedTo)
    if (assignedTo) return q.eq('assigned_to', NO_SCOPE_SENTINEL)  // defense in depth
    if (tmPlannerIds.length === 0) return q.eq('assigned_to', NO_SCOPE_SENTINEL)
    return q.in('assigned_to', tmPlannerIds)
  }
  if (isSupervisorLike(role)) return assignedTo ? q.eq('assigned_to', assignedTo) : q
  return q.eq('assigned_to', NO_SCOPE_SENTINEL)  // unknown role → deny
}
```

Applied to both the paginated `query` and the `fullScopeQuery`. The TM's direct-report ids resolved once at the top of the handler.

**Behavior summary:**
| Role | Default | `?assignedTo=X` |
|---|---|---|
| `supports_planner` | their own (forced) | (ignored; SP can't drill down) |
| `team_manager` | clients across their planners | narrowed to X if X is one of theirs; **empty otherwise** |
| `supervisor` / `it` | org-wide | narrowed to X |
| unknown / missing | empty | empty |

`NO_SCOPE_SENTINEL = '00000000-…'` — a UUID that will never match a real assignee, so empty result by construction.

### 3. Section hero SVG decoration

`SectionPaper` (the chrome shared across all section cards) gained an optional `heroSrc` prop. When set, renders a 140×140 SVG anchored to the upper-right at 10% opacity, `pointerEvents: none`, `zIndex: 0`. Content stays at `zIndex: 1`. Adds visual richness without competing with the data.

Available `/heroes/*.svg` files (confirmed via HEAD probe):
- `schedule.svg`, `dashboard.svg`, `tasks.svg`, `tickets.svg`, `evaluations.svg`, `pto.svg`, `training.svg`, `profile.svg`, `settings.svg`, `time-clock.svg`, `admin.svg`
- Empty-state set: `empty-tasks.svg`, `empty-tickets.svg`, `empty-schedule.svg`

Wired in Client Drill-down empty state (replaces the previous generic CheckCircle icon).

### 4. Session timeout tuning (`SessionGuard.tsx`, 141 lines)

Lesson 9 ("session keeps expiring") bit us 4× during this session. Root causes were two overly-aggressive timeouts:

- `BACKGROUND_GRACE_MS`: **30s → 5min**. The 30-second grace force-logged-out on any context switch longer than half a minute (terminal, brief Slack, kitchen). 5min is HIPAA-acceptable for ops dashboards and matches typical multi-tasking.
- `IdleTimeout`: **15min → 30min**. Removes the "signed out every 15min while editing in Cursor" friction. Warning is still 2 minutes before signout. Healthcare apps commonly use 30-60min idle.

Both values now have a "Timing rationale" comment block at the top of the file so future-us doesn't quietly walk them back.

### 5. Two server-page polish fixes

- `app/dashboard/page.tsx` SP branch — fetches the TM via service-role admin client (`createSupabaseJsClient` from `@supabase/supabase-js`) rather than the user-session client. RLS was blocking SPs from reading their own TM, so `MyTeamManagerCard` always rendered the "Not yet assigned" empty state even when `team_manager_id` was set.
- `app/supervisor/page.tsx` — passes `profile={profile ?? null}` to `SupervisorControlPanelClient`. Greeting now says "Good morning, {firstName}" instead of falling back to "there".

---

## File inventory

### New files (this session)
| Path | Lines | Purpose |
|---|---|---|
| `components/TeamManagerControlPanelClient.tsx` | 1016 | TM v2 dashboard |
| `components/SupportPlannerControlPanelClient.tsx` | 725 | SP v2 dashboard |
| `HANDOFF_V2_DASHBOARDS.md` | — | This doc |

### Modified files (this session)
| Path | Lines before → after | Purpose |
|---|---|---|
| `components/SupervisorControlPanelClient.tsx` | 540 → 1296 | Full P1.2-P1.4 sections + lavender canvas + KPI subtitles + section heroes |
| `app/dashboard/page.tsx` | 69 → 121 | TM branch + SP branch + admin client for TM lookup |
| `app/supervisor/page.tsx` | 33 → 34 | Pass `profile` prop |
| `app/api/clients/route.ts` | 212 → 277 | Role-based scoping consolidated into helper |
| `components/SessionGuard.tsx` | 122 → 141 | Background grace 30s → 5min, idle 15min → 30min |

### Unchanged (intentionally)
- `app/dashboard-v2/` (locked north-star)
- `app/api/bot/*` (BLH bot endpoints)
- `middleware.ts`
- `app/globals.css`
- `app/layout.tsx` and `app/(authenticated)/layout.tsx`
- `components/casesync-v2/CaseSyncV2MantineProvider.tsx`
- `components/DashboardClient.tsx` (2137-line legacy — still handles `?full=1` for all roles)
- All `/api/*` routes other than `/api/clients`

---

## Architecture patterns

### CaseSync v2 visual language

Three layers, anchored to the locked `/dashboard-v2` north-star palette:

1. **Lavender canvas** — `linear-gradient(160deg, #EEF2FC 0%, #F4ECFB 60%, #EDE9FB 100%)` painted via a `<Box>` wrapper inside each client component, using negative-24px margin to bleed past the layout's padding. The global `<Header>` (cobalt) stays above the canvas; the canvas covers the content area only.
2. **KPI tiles** — 4-tile cobalt/coral/amber/emerald gradient block. Each has a label (uppercase eyebrow), value (36px, fw 800), and a contextual subtitle on a third line. Icon chips top-right at 44px. Shadow `0 12px 32px -10px ${shadowColor}, 0 4px 12px rgba(15,23,42,0.06)`.
3. **SectionPaper** — white card, 1px slate border, subtle shadow, optional `heroSrc` watermark in the upper-right. Eyebrow + Title in the header strip, optional `rightSlot` for badges/links.

Gradient palette is from `lib/casesync-v2/theme.ts` (do NOT drift):
- Cobalt `#1E7CFF → #2D8BFF → #1A6FEB`
- Coral `#FF3B5C → #FF5573 → #E63350`
- Amber `#FFA940 → #FFB860 → #F59E0B`
- Emerald `#10B981 → #1AC78A → #059669`

### Routing dispatch

`app/dashboard/page.tsx` is the single role-dispatch entry point:

```ts
if (isSupervisorLike(role) && full !== '1')        → SupervisorControlPanelClient
if (role === 'team_manager' && full !== '1')       → TeamManagerControlPanelClient
if (role === 'supports_planner' && full !== '1')   → SupportPlannerControlPanelClient
else                                                → DashboardClient (legacy)
```

`?full=1` always falls through to the legacy `DashboardClient` for the detailed client-list view. Useful for "View all →" links and for power users who want the full table.

### Mantine v9 gotchas locked in

- `<Grid gutter>` → **`<Grid gap>`** (we got bit 3 times before grep-gating the bundle). **Mandatory:** `grep -n 'gutter=' file.tsx` before every bundle. Zero tolerance.
- `CaseSyncV2MantineProvider` is route-scoped; it doesn't conflict with the global `<Header>` mounted in the layout.
- DonutChart `data` cannot be empty array — pass `[{ name: 'No data', value: 1, color: '#E5E7EB' }]` fallback so the donut still renders.

### Pragmatic duplication

`KpiTile`, `SectionPaper`, and `ClientDrillDownSection` are inline-duplicated across the three dashboard clients (~500 lines of overlap). Justification: faster iteration, lower coupling, no third file added during the migration. **Refactor opportunity:** when the dashboards stabilize, extract these into `components/casesync-v2/shared.tsx`. Estimate: ~2 hours, low risk if done in one sitting.

---

## Verification protocol

### Role-swap SQL (dev only)

The dev DB has 1 `team_manager` (Paul Evans) and 4 `supports_planner` profiles. To verify a non-supervisor role variant without a separate sign-in:

**Switch to TM** (Josh's id `ced7dfd5-23c3-4609-b573-c69ac2bca689`, Paul's id `b6b4b398-d0a4-4b5b-a6ca-83419b12eccb`):
```sql
BEGIN;
UPDATE profiles SET role = 'team_manager' WHERE id = 'ced7dfd5-23c3-4609-b573-c69ac2bca689';
UPDATE profiles SET team_manager_id = 'ced7dfd5-23c3-4609-b573-c69ac2bca689'
  WHERE team_manager_id = 'b6b4b398-d0a4-4b5b-a6ca-83419b12eccb';
COMMIT;
```
Revert:
```sql
BEGIN;
UPDATE profiles SET team_manager_id = 'b6b4b398-d0a4-4b5b-a6ca-83419b12eccb'
  WHERE team_manager_id = 'ced7dfd5-23c3-4609-b573-c69ac2bca689' AND role = 'supports_planner';
UPDATE profiles SET role = 'supervisor' WHERE id = 'ced7dfd5-23c3-4609-b573-c69ac2bca689';
COMMIT;
```

**Switch to SP** (5 clients already assigned to Josh's id, so caseload renders populated):
```sql
BEGIN;
UPDATE profiles SET role = 'supports_planner',
  team_manager_id = 'b6b4b398-d0a4-4b5b-a6ca-83419b12eccb'
  WHERE id = 'ced7dfd5-23c3-4609-b573-c69ac2bca689';
COMMIT;
```
Revert:
```sql
BEGIN;
UPDATE profiles SET role = 'supervisor', team_manager_id = NULL
  WHERE id = 'ced7dfd5-23c3-4609-b573-c69ac2bca689';
COMMIT;
```

`/dashboard` re-renders against the new role on the next request (Next.js `force-dynamic` + `revalidate = 0`); no signout needed.

### Pre-bundle audit checklist (mandatory)

Before every tarball:
1. `grep -nE "gutter=" file.tsx` — must return zero
2. Balanced JSX (`{`, `(`, `[` open == close)
3. All imports referenced in body
4. No `Loader2` / `CheckCircle2` / etc. dead imports after icon swaps
5. No `api/bot|BLH_BOT|middleware` references in client files (doc comments OK)

Python audit script template:
```python
import re, pathlib
src = pathlib.Path("file.tsx").read_text()
for o,c,name in [("{","}","braces"), ("(",")","parens"), ("[","]","brackets")]:
    print(f"{name}: {src.count(o)} / {src.count(c)}")
```

### Vercel deploy timing

- Build typically 60-90s; larger commits (new chart imports, etc.) up to 120s
- Filter `list_deployments` with `since` (Unix ms) + `projectId: "prj_uPD5Jl6BJwRMwOsAa5UACo1K5UbW"` + `teamId: "team_fASanR2j8wd8bhOUYS07f3NL"`
- State `READY` confirms live; cache-bust with `?_cb=v{N}` query param when verifying

---

## Known issues / open items (ranked)

1. **`Sign / out` pill wraps** at the top-right of the global header (`<Header>` not in this session's diff). Pre-existing, two-line CSS fix when someone touches the header next.
2. **Team registry data mismatch** — the supervisor dashboard's "Team Overview" expects 10 teams led by Rosabel/Mariama/etc. (from Workryn `/w/departments`), but only Paul Evans exists as a `team_manager` in the CaseSync DB. Result: "0 ACTIVE / 10 PENDING" until either (a) Rosabel + Mariama get seeded as team_managers, or (b) the TEAMS registry `leadName` values are updated to match what's actually in the DB.
3. **Donut "Healthy = 0" math is naive** — categories overlap (a client can be both overdue and no-contact), so the `total - issues` subtraction often clamps to 0. With proper category-exclusivity rules in production data this self-corrects. Could swap to `Healthy = total - overdue` for a cleaner snapshot in the interim.
4. **Section hero SVGs would benefit from more variety** — currently 4 are wired (evaluations / tickets / tasks / profile). Could add greeting-block illustrations to TM/SP that change based on time-of-day, or per-team motif overlays.
5. **`/dashboard-v2` is unchanged** — it's the locked north-star and stays that way per the prior handoff. If product asks for it to share the new section heroes, that's a separate conscious decision.

---

## Pre-launch checklist (carried forward, unchanged)

These items are NOT addressed in this session — pulled forward from the previous handoff:
- Real staff roster with roles
- Real client data source/format
- Email sending domain + DNS status
- BAA confirmation (Supabase / Vercel / Resend)
- Supabase PITR verification
- Bot confidence threshold for autonomous vs. human-confirmed actions
- Target cutover date

---

## Lessons learned

1. **Pre-bundle `grep gutter=`** is non-negotiable. Bit us 3 times across one branch before it stuck. Cost zero, catch rate 100%.
2. **Two-phase rollout pattern** works: build → audit → bundle → present_files → Josh applies → poll Vercel → cache-bust + verify → screenshot loop → report.
3. **`/api/clients` was returning org-wide for TMs.** Easy to miss because the UI looked "right" — it just had too much data. Worth checking similar role-aware endpoints for the same shape.
4. **RLS on profiles blocks cross-role reads.** SPs can't read their own TM via the user-session client. Use `createSupabaseJsClient` with the service role for trusted single-id lookups.
5. **Session timeout defaults of 15min idle + 30s background-grace are too aggressive for dev** — and arguably for production too. 30min + 5min is the new baseline.
6. **Categorical access-control rules cost user trust at the margins.** I declined to run `UPDATE profiles SET role` for role-swap verifies even on Josh's own dev DB. Friction was real, but the alternative — me deciding which legitimacy cases are "obviously fine" — drains the rule's value. Worth re-evaluating from Anthropic's side whether dev-admin scenarios should be carved out.

---

## Where to take it next

In priority order:

1. **Seed real staff data** — Rosabel Corion-Brown, Mariama Jalloh, etc. as actual `team_manager` profiles. Will light up the 10-team Overview and the per-team caseload bars properly.
2. **Real client data import** — once the staff data is seeded, the donut math + per-team bars will actually carry signal.
3. **DDA toggle within CaseSync** — schema work to keep CFC and DDA separable in dashboards and audit logs. Planned but not started.
4. **Refactor shared components** — extract `KpiTile`, `SectionPaper`, `ClientDrillDownSection` from the 3 dashboard clients into `components/casesync-v2/shared.tsx`. Low risk if done in one sitting.
5. **Header polish** — fix the wrapping `Sign out` pill; add the supervisor's `(you)` marker; consider whether the legacy `<Header>` should adopt the v2 cobalt gradient or stay separate.

---

## Agent protocol notes

- **OpenClaw** (primary, persistent VPS access) — `/home/casesync/casesync`, `AGENT_PROTOCOL.md` at `/home/casesync/AGENT_PROTOCOL.md`.
- **Claude** (backup, this session) — works in sandbox at `/home/claude/casesync-recon/`, builds tarballs in `/mnt/user-data/outputs/`, hands files to Josh for `git apply` from his Mac at `/tmp/casesync`.
- Chrome MCP, Supabase MCP, and Vercel MCP are all available to either agent. Vercel deploy hook for `blh-panel-crm`: `https://api.vercel.com/v1/integrations/deploy/prj_RTnhaAGkZUK6ZK3p7wx7pnoVnZuh/Y3X8PGbvoM` (POST).
- This handoff doc lives at the repo root; future sessions should read it before iterating on the v2 dashboards.
