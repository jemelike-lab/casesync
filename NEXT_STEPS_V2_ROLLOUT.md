# NEXT STEPS — Cascading v2 to the Rest of CaseSync

**Branch:** `redesign/dashboard-v2-northstar` (or merge to `main` first — see "Pre-flight" below)
**Status:** Dashboards complete. The rest of the CaseSync surfaces (~8 pages + cross-cutting items) still wear pre-v2 styling. This doc maps the remaining work and gives Phase A a concrete starting point.

**Read first:** `HANDOFF_V2_DASHBOARDS.md` — it has the architecture, palette, patterns, role-swap SQL, and the lessons learned that this doc assumes you know.

---

## TL;DR

1. **Next concrete action:** Recon `/clients/[id]` — the highest-leverage remaining surface (where SPs spend most of their day). Pull the file, identify sections, sketch a v2 layout, bundle a first cut.
2. **Pattern is locked:** Same primitives the dashboards use (`KpiTile`, `SectionPaper` with `heroSrc`, lavender canvas, `CaseSyncV2MantineProvider`) apply to every remaining surface. No new design system invention required.
3. **Workryn is out of scope.** Forest green stays forest green. Cascading v2 = CaseSync surfaces only.
4. **Total estimated effort:** 8–12 sessions like the one that shipped the dashboards. Phased into A → B → C → D so it doesn't have to happen all at once.

---

## Pre-flight (do this first)

Before Phase A starts, settle one of these:

- **Option 1: Merge `redesign/dashboard-v2-northstar` → `main` now.** Cleaner. Next phase work happens against `main`. The branch has been stable, three deploys passed first-try.
- **Option 2: Keep the branch open through Phase A.** If you want to roll dashboards + client detail page as one PR. Slower to land, but groups the v2 work as a single product moment.

Either is fine. Default recommendation: **merge now** so the branch doesn't drift while Phase A is in progress.

---

## The full roadmap

Surfaces ranked by user-minutes-spent. Effort estimates assume a single session ≈ one focused half-day of pair work.

### Phase A — Client detail (single biggest leverage)

| Surface | What it is | Effort |
|---|---|---|
| `/clients/[id]` | Per-client detail page. Identity, deadlines, contact history, documents, notes, financial state, audit trail. Where Support Planners spend most of their day. | 2–3 sessions |

**Why first:** This is the single most-used screen in CaseSync. Every meaningful interaction with a real client routes through it. Upgrading it has more daily-user impact than any other surface combined.

### Phase B — Cross-role views

| Surface | What it is | Effort |
|---|---|---|
| `/calendar` | Date grid + event chips + side panel. Used by all roles for deadline-driven work. | 1–2 sessions |
| `/team` | Supervisor/TM roster management. Light surface, reuses primitives we've shipped. | 1 session |

### Phase C — Power-user surfaces

| Surface | What it is | Effort |
|---|---|---|
| `/audit-log` | Table/timeline of access events. HIPAA-adjacent app — this surface signals trust. | 1 session |
| `/admin` | Internal tools. User invite, role assignment, system status. Lower visibility, worth consistency. | 1 session |
| `/settings` | Account/preferences. Smallest surface. | half-session |

### Phase D — Polish layer

| Item | What it is | Effort |
|---|---|---|
| `/login` | First impression. Worth doing last when the rest is solid. | 1 session |
| Modals (BulkContactModal, SavedViews, KeyboardShortcuts, etc.) | Currently older Mantine styling | 1–2 sessions |
| Toast notifications | Should match the v2 palette (currently default Mantine) | half-session |
| Global `<Header>` | The "Sign out" pill wrap has been pending 3+ sessions. Redesign pass. | 1 session |
| Mobile responsiveness audit | Dashboards work mobile; other surfaces may not | 1 session |
| Legacy `DashboardClient` (?full=1 client list, 2137 lines) | Refactor opportunity using v2 row/filter components without rewriting the whole thing | 2–3 sessions |

**Phase D items are independent** — they can be picked up in any order, or interleaved with A/B/C if a specific one becomes blocking.

---

## Phase A in detail — `/clients/[id]` recon

Before writing any v2 code, the next session needs to answer these questions:

### Files to pull and read
- `app/clients/[id]/page.tsx` (server component)
- Whatever client component it imports (likely something like `ClientDetailClient.tsx` — confirm the name)
- `lib/types.ts` — the `Client` type and the deadline-field set (already used in supervisor donut math)
- Any sub-components imported (deadline rows, contact log, document list, etc.)

### Structural questions to answer
1. What sections does the current page have? Make a list, in render order.
2. What data is fetched server-side vs client-side?
3. Is there role-based section visibility? (E.g. supervisors see audit trail, SPs don't, or similar.)
4. What's the largest current pain point — is it visual, is it slow, is it a usability issue with sub-flows like "log a contact"?
5. Does the route have its own auth gate, or rely on the global one?

### v2 layout sketch (starting point — adjust after recon)

```
Greeting/Identity strip
  ├─ Avatar (client initials, accent color = program tag)
  ├─ Name + client_id + program tag (CFC / DDA / Leadership-adjacent)
  ├─ Status pills (eligibility code, last_contact_date relative, planner name)
  └─ Right slot: quick actions (Log Contact, Edit, View History)

KPI strip (4 tiles)
  ├─ Days Since Contact (color codes: green <7, amber 7-14, red 14+)
  ├─ Next Deadline (smallest pending date across the 13 deadline fields)
  ├─ Goal % (existing field, color codes)
  └─ Risk Score (existing field or computed)

SectionPaper: Deadlines
  ├─ Each of the 13 deadline fields, sorted by soonest
  ├─ Status colors: overdue=coral, due-week=amber, due-soon=cobalt, healthy=emerald
  └─ heroSrc: /heroes/evaluations.svg

SectionPaper: Contact History
  ├─ Timeline view: last_contact_date, last_contact_type, with iconography
  ├─ "Log Contact" CTA inline
  └─ heroSrc: /heroes/schedule.svg (or /heroes/profile.svg)

SectionPaper: Documents / Notes
  ├─ Attachments + free-text notes
  └─ heroSrc: /heroes/tickets.svg

SectionPaper: Financial State (if applicable)
  ├─ Goal %, financial redet dates, MFP consent, etc.
  └─ heroSrc: /heroes/admin.svg

SectionPaper: Audit Trail (role-gated: supervisor/IT only)
  ├─ Per-row access log scoped to this client
  └─ heroSrc: /heroes/settings.svg
```

The layout above is a **sketch**, not a commitment. Refine after seeing the current implementation.

### Role-scoping considerations
- **Server-side**: the client detail page probably should reject access by SPs viewing clients not assigned to them, and by TMs viewing clients outside their team's planner set. Worth confirming the existing route handles this; if not, mirror the `applyAssignedScope` pattern from `/api/clients/route.ts`.
- **UI-side**: certain sections (audit trail, financial state) may be supervisor-only. Already an established pattern in the codebase — find existing examples before inventing new ones.

### What to ship in the first bundle
1. The recon notes (what's there now, what we're keeping vs replacing).
2. A first-cut `ClientDetailClient.tsx` (or whatever the existing file is named) wrapped in `CaseSyncV2MantineProvider`, with the Identity strip + KPI tiles + Deadlines section.
3. If the existing page already has a `page.tsx` server component, leave it alone for the first commit — wrap the new client where the old one was used.
4. Defer the timeline/documents/audit sections to commit 2 or 3.

---

## Pattern playbook (what to reuse from the dashboards)

Every v2 surface follows the same recipe. No reinvention needed.

### Required imports / providers
```tsx
'use client'
import CaseSyncV2MantineProvider from '@/components/casesync-v2/CaseSyncV2MantineProvider'
// then wrap the inner component in <CaseSyncV2MantineProvider>...</CaseSyncV2MantineProvider>
```

### The lavender canvas wrapper
```tsx
<Box style={{
  background: 'linear-gradient(160deg, #EEF2FC 0%, #F4ECFB 60%, #EDE9FB 100%)',
  margin: '-24px',
  padding: '24px',
  width: 'calc(100% + 48px)',
  minHeight: 'calc(100dvh - 100px)',
}}>
  <Container size={1280} px={0} pb={80}>
    {/* sections */}
  </Container>
</Box>
```

### Color palette (do NOT drift)
| Token | Use | Gradient |
|---|---|---|
| Cobalt | Default/clients/info | `#1E7CFF → #2D8BFF → #1A6FEB` |
| Coral | Overdue/critical/red | `#FF3B5C → #FF5573 → #E63350` |
| Amber | Due-soon/warning | `#FFA940 → #FFB860 → #F59E0B` |
| Emerald | Healthy/quiet/green | `#10B981 → #1AC78A → #059669` |

### Patterns to copy verbatim from the dashboards
- **KpiTile** — copy from `SupervisorControlPanelClient.tsx` (or any of the three). Refactor into shared lib later.
- **SectionPaper** — same. The `heroSrc` prop is the watermark anchor.
- **DonutChart wrapper** — when status breakdown applies, copy from `CaseloadSnapshotSection` in the SP file.
- **Empty states** — use the `/heroes/empty-*.svg` set, 96px, centered in a dashed-border slate-50 box.

### Hero SVG inventory (`/public/heroes/`)
| Slug | Best for |
|---|---|
| `dashboard.svg` | Greeting blocks (desk-with-sun motif) |
| `schedule.svg` | Calendars, contact history, time-based |
| `tasks.svg` | Workload, to-dos, planner panels |
| `tickets.svg` | Lists, drill-downs, items requiring action |
| `evaluations.svg` | Analytics, donut sections, status breakdowns |
| `profile.svg` | People, rosters, team |
| `settings.svg` | Audit trail, configuration |
| `admin.svg` | Power-user / financial / sensitive sections |
| `pto.svg`, `training.svg`, `time-clock.svg` | Workryn-flavored; use sparingly in CaseSync |
| `empty-tasks.svg`, `empty-tickets.svg`, `empty-schedule.svg` | Empty states |

---

## Pre-bundle audit checklist (mandatory)

Same as the dashboards milestone. Repeated here so this doc is self-contained.

Before every tarball:
1. `grep -nE "gutter=" file.tsx` → must return zero. Mantine v9 forbids `gutter` on `Grid`.
2. Balanced JSX (`{`, `(`, `[` open == close).
3. All imports referenced in body. Remove dead icon imports after swaps.
4. No `api/bot|BLH_BOT|middleware` references in client files (doc comments OK).
5. Section heroes (`heroSrc`) actually exist in `/public/heroes/`.

Python audit template:
```python
import re, pathlib
src = pathlib.Path("file.tsx").read_text()
for o,c,name in [("{","}","braces"), ("(",")","parens"), ("[","]","brackets")]:
    print(f"{name}: {src.count(o)} / {src.count(c)}")
```

---

## Verification protocol (per surface)

1. Build locally if possible; otherwise rely on Vercel preview.
2. Vercel deploy ≈ 60-90s. Use `since` timestamp + `projectId: prj_uPD5Jl6BJwRMwOsAa5UACo1K5UbW` + `teamId: team_fASanR2j8wd8bhOUYS07f3NL` when polling.
3. Cache-bust with `?_cb=v{N}` when verifying.
4. If the surface is role-scoped, verify each relevant role via the swap SQL in `HANDOFF_V2_DASHBOARDS.md`.
5. Eyeball the surface at multiple viewports (desktop 1280+, mobile 380 emulated).
6. Console-check for app errors (filter out Chrome-extension noise: `"listener indicated an asynchronous response, message channel closed"`).

---

## Open questions for Josh (answer before Phase A starts)

1. **Merge to `main` first, or keep the branch open through Phase A?** Default: merge.
2. **Phase A scope — pure v2 restyle, or also fix UX issues you've noticed on `/clients/[id]`?** If there are flow problems (e.g. logging a contact is buried), worth bundling them into the same pass.
3. **Role-scoping audit — should `/clients/[id]` reject access by an SP viewing clients not assigned to them?** Currently unknown; we'd verify during recon.
4. **DDA toggle within CaseSync** — this is a separate, larger feature you've flagged in memory. Does Phase A need to anticipate DDA-mode display (CCS instead of SP, different deadline fields)? Or is DDA a strictly later concern?
5. **Real client data import** — still on the pre-launch checklist. Worth scheduling alongside Phase A so the new client detail page renders against realistic data.

---

## What's intentionally NOT in this doc

- Workryn (`/w/*`) surfaces — separate visual system, separate cascade if needed
- `/dashboard-v2` — locked north-star, do not iterate
- BLH bot endpoints (`/api/bot/*`) — out of scope for visual work
- Pre-launch checklist items (BAA, PITR, Resend, DNS) — operational, separate workstream
- Database schema changes — Phase A is presentation-layer only

---

## Where to take it after Phase D

Once the full v2 cascade is done, the natural next workstreams in order:

1. **DDA toggle** — actually wire the CFC/DDA split through the schema, dashboards, and audit logs.
2. **Real data migration** — replace test profiles + clients with the real BLH roster + caseload.
3. **Email/notifications layer** — Resend integration, deadline reminders, contact log automation.
4. **BLH Bot expansion** — autonomous vs. human-confirmed action thresholds.

These four are independent of the v2 visual cascade. Could happen in parallel with Phase D, or after.

---

## Quick-start command for the next session

When you sit down to start Phase A:

```bash
# Confirm we're on the right branch and current
cd /tmp/casesync
git checkout main   # or redesign/dashboard-v2-northstar if still un-merged
git pull --rebase

# Read the previous handoff first
cat HANDOFF_V2_DASHBOARDS.md
cat NEXT_STEPS_V2_ROLLOUT.md   # this doc

# Then start recon on /clients/[id]
ls app/clients/
cat app/clients/\[id\]/page.tsx
```

That's the entry point. Everything else flows from there.
