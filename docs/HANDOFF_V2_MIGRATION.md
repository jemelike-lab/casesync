# CaseSync v2 Migration — Handoff

**Owner:** Josh Emelike · **Repo:** `jemelike-lab/casesync` · **Branch:** `redesign/dashboard-v2-northstar` · **Last updated:** 2026-06-10

This document is for the next Claude session picking up the v2 visual migration of CaseSync after the north-star phase has been locked. Read it end-to-end before opening any source file. It captures decisions, rationale, gotchas, and the exact order of operations. Claude is the only engineering agent building CaseSync — there are no autonomous co-agents in this loop; Josh delegates each commit to Claude through chat sessions.

---

## 1. Status — where we are right now

### Branch and deployment

- All v2 work lives on `redesign/dashboard-v2-northstar`.
- `main` is untouched by v2 — production at `blhcasesync.com` still serves the legacy visual.
- Preview URL for the branch: `https://casesync-git-redesign-dashboard-187ead-jemelike-6356s-projects.vercel.app`
- `/dashboard-v2` (preview only, mocked data) is the **locked visual north-star**. Treat it as the reference design language for everything else.

### Recent commits on the branch (newest first)

| SHA | Subject |
|---|---|
| `63c648b` | `fix(header): light-mode CSS override now cobalt, not legacy brown` |
| `6a82860` | `feat(header): cobalt v2 styling app-wide (cobalt gradient bg, white nav + buttons)` |
| `9649cda` | `feat(v2): schedule hero illustration in greeting block (Workryn placeholder)` |
| `9df3095` | `feat(v2): team badge SVGs replace letter-initial avatars on Team Overview` |
| `a5d1d45` | `fix(v2): responsive nav row — hide scrollbar, snap-scroll, tighter spacing` |
| `3bb9bce` | `fix(v2): drop bottom 2-col breakpoint to md so it triggers on 1055px viewport` |
| `9469a0a` | `fix(v2): nav row overflow, bottom 2-col layout via Flex, KPI label, emoji collision` |
| `f62f4df` | initial /dashboard-v2 scaffold + Team Tools sidebar |
| `a7d1ae3` | Mantine v9 gutter→gap |
| `b24537e` | first scaffold (broken Grid v9 gutter) |

### Visual state today

- `/dashboard-v2`: self-contained v2 chrome (white app nav row + cobalt floating TopBar + greeting with schedule.svg + 4 KPI tiles + Caseload Trend chart + Team Overview with badge SVGs + Attention Feed + Team Tools sidebar). **Locked, do not iterate on this further unless Josh asks.**
- Every other page on the redesign branch (`/team`, `/supervisor`, `/dashboard`, `/admin`, `/admin/audit`, `/calendar`, `/clients`, `/settings`, `/help`): wears the **cobalt global Header** (last commit), but the page body content is unchanged. So they look "v2 cobalt above, legacy below" — a half-migrated state by design.

---

## 2. North-star design language (locked)

This is the visual contract every migrated page must satisfy.

### Color palette — the only colors that appear in chrome / structural elements

| Role | Hex | Usage |
|---|---|---|
| Cobalt primary | `#1E7CFF` | Header gradient start, primary action |
| Cobalt mid | `#2D8BFF` | Header gradient mid, KPI tile 1 |
| Cobalt deep | `#1A6FEB` | Header gradient end, accents |
| Coral | `#FF3B5C` | Overdue / critical state, KPI tile 2 |
| Amber | `#FFA940` | Due-this-week / warning, KPI tile 3 |
| Emerald | `#10B981` | No-contact / healthy state, KPI tile 4, success |
| Slate ink | `#0F172A` | Primary body text, titles |
| Slate muted | `#475569` | Inactive nav text, body subtitles |
| Slate hint | `#64748B` | Eyebrow labels, helper text, "ORG OVERVIEW" |
| Border | `#E5E7EB` | Card borders, dividers |
| White | `#FFFFFF` | Backgrounds, header text on cobalt |
| Off-white | `#F8FAFC` | Subtle surface for badge wraps |

Cobalt gradient (used on the global Header + the v2 floating TopBar):
```
linear-gradient(135deg, #1E7CFF 0%, #2D8BFF 50%, #1A6FEB 100%)
```

Cobalt glow shadow (under elevated cobalt surfaces):
```
box-shadow: 0 4px 16px rgba(30,124,255,0.18)
```

### Typography

- Body font: Inter (already loaded app-wide via root layout)
- Title (h1 equivalent): `fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: '#0F172A'`
- Section heading: `fontSize: 18, fontWeight: 700, color: '#0F172A'`
- Eyebrow (uppercase label above a section): `fontSize: 13, fontWeight: 600, color: '#64748B', tt: 'uppercase', letterSpacing: '0.06em'`
- Body text: `fontSize: 14, color: '#64748B'`
- KPI tile value: `fontSize: 36-40, fontWeight: 800, color: '#FFFFFF'`
- KPI tile label: `fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', tt: 'uppercase', letterSpacing: '0.06em'`

### Component patterns

- **KPI tile**: gradient bg in one of the four primary colors, white text, icon top-right at 0.4 opacity, delta sparkline at bottom. Reference: `KpiTile` in `components/casesync-v2/SupervisorDashboardV2Client.tsx`.
- **Section card**: `bg: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 16, padding: 24`. Sectional heading + eyebrow inside.
- **Row item** (team rows, attention items): hover-able left-bar accent in the team's `accentColor`, badge or icon in a 44px white rounded wrap with `boxShadow: 0 2px 8px ${accentColor}26, inset 0 0 0 1.5px ${accentColor}33`. Reference: `TeamRow` and `AttentionRow` in v2 client component.
- **Cobalt floating topbar**: cobalt gradient bg, white pill search field (border-radius 12, height 40, transparent bg with backdrop), bell + mail icons in white-alpha pills, brand-mark `CS` square + "CaseSync" wordmark on the left.

### Layout / breakpoints (Mantine defaults, but verified at this viewport)

- Container max width on v2 pages: `1280px` (or the page-specific clamp)
- KPI tile grid: 4-col at `md` (992px+), stacks 2-col below
- 2-col main content split (left content + right sidebar): 2:1 ratio via `<Flex direction={{base:'column', md:'row'}}>` with `flex: 2` and `flex: 1` children — **NOT `lg`**, see Lesson 1.

### Hero illustrations

- Live in `public/heroes/*.svg` (14 files, ~3-4KB each)
- These were originally drawn for **Workryn** (HR / time-tracking sibling product). Topics: admin, dashboard, evaluations, profile, pto, schedule, settings, tasks, tickets, time-clock, training, plus 3 empty-states (empty-schedule, empty-tasks, empty-tickets).
- For CaseSync v2 they are **placeholders**. The v2 dashboard greeting block currently uses `schedule.svg`. Long-term: commission a CaseSync-specific bespoke hero set in the same Workryn style (emerald + amber + slate palette, flat-illustration-with-glow) — one per CaseSync page (clients, planners, audits, no-contact alerts, deadlines, team roster, etc.).
- Render pattern: `<Image src="/heroes/{name}.svg" width={200} height={120} unoptimized priority />` inside a `<Box visibleFrom="sm">` so PWA gets text-only greeting.

### Team badges

- Live in `public/teams/*.svg` (10 files, 150×150 native, ~1.5-2.8KB each)
- Slugs: `blue-giants`, `bronze-butterflies`, `emerald-guardians`, `gold-giants`, `indigo-gladiators`, `maroon-musketeers`, `purple-penguins`, `sage-sharks`, `silver-titans`, `white-diamonds`
- Mapping in v2 mock data: TahTeona→indigo-gladiators, Sarah→emerald-guardians, Mercedes→maroon-musketeers, Kelly→purple-penguins, Blue Giants→blue-giants, Gold Giants→gold-giants
- For real data: the `Profile` shape has a `team_id` or `team_name` field — confirm before assuming. **Each real team needs an explicit badgeSlug assignment** in the DB or in a static mapping. Defer this decision to Josh — he may want to draw bespoke CaseSync team badges too.
- Render pattern: 44px white rounded square with accent-color glow wrapping the SVG. Reference: `TeamRow` component.

---

## 3. Page inventory and migration order

CaseSync has these top-level authenticated routes (per `find app -maxdepth 2 -type d`). Each one needs a migration pass. Order is chosen by user-facing impact and code-reuse leverage.

### Route table

| Route | Audience | Layout uses Header? | Server data complexity | Client component | Lines (main client) | Priority |
|---|---|---|---|---|---|---|
| `/dashboard` | All roles (variant render per role) | Yes | High | `SupervisorControlPanelClient` (for sup/IT), other for SP/TM | 940 (sup variant) | **P1** |
| `/supervisor` | supervisor + it | Yes | High | `SupervisorControlPanelClient` | 940 | **P1 — shares P1 with /dashboard** |
| `/team` | team_manager + supervisor + it | Yes | Medium | Team client component | TBD | **P2** |
| `/clients` | All | Yes | Medium | Clients list client | TBD | **P3** |
| `/clients/[id]` | All | Yes | Medium | Client detail client | TBD | **P3 (part of /clients)** |
| `/clients/new` | All | Yes | Low | Form | Small | **P3 (part of /clients)** |
| `/clients/import` | supervisor + it | Yes | Medium | Import client | TBD | **P3 (part of /clients)** |
| `/admin` | supervisor + it | Yes | High | Admin dashboard | TBD | **P4** |
| `/admin/audit` | supervisor + it | Yes | Medium | Audit log table | TBD | **P5** |
| `/calendar` | All | Probably Header | High | Calendar widget | TBD | **P5** |
| `/settings/security` | All | **No Header** | Low | Settings forms | Small | **P6 (lowest)** |
| `/help` | All | Yes | Low | Help content | Small | **P6 (lowest)** |
| `/chat` | TBD | TBD | TBD | TBD | TBD | **Defer** |
| `/login`, `/reset-password`, `/auth/*`, `/onboarding`, `/accept-invite` | Public | No Header (own design) | Low | n/a | n/a | **Don't migrate** — these have their own design and shouldn't get the in-app cobalt chrome |
| `/(workryn)/*` | All | Workryn-specific | n/a | Separate product | n/a | **Don't touch** — separate product line |

### Migration order (recommended)

**P1 — Supervisor view (covers /supervisor AND /dashboard for sup/IT)**
- This is Josh's daily view. Highest direct value. One commit slate covers two routes.
- `SupervisorControlPanelClient.tsx` (940 lines) is the file. See section 5 below for the exact decomposition.

**P2 — Team page**
- High traffic for team_managers + supervisors. Heavy reuse of team badge SVG work already done in v2.
- Read `app/team/page.tsx` + the client component to see what data drives it.

**P3 — Clients (list + detail + import + new)**
- Most-touched daily by SPs. Big leverage if styled well.
- Likely needs a Drill-down list pattern similar to the v2 Attention Feed.
- Client detail page may need a profile-style hero (`/heroes/profile.svg`?) and a left rail of metadata + right content stack.

**P4 — Admin**
- Heavy: invites, role management, BAA settings, etc. Visual treatment is forms + tables. Lower priority because used infrequently.

**P5 — Calendar + Audit Log**
- Calendar: probably a third-party library (FullCalendar?) — visual integration may require theming the library. Investigate before estimating.
- Audit Log: mostly a filterable table. Should use a v2 styled DataTable pattern.

**P6 — Settings + Help**
- Settings is forms. Help is content + tour replay. Low complexity, low traffic. Polish these last.

### Per-page migration checklist (apply to every P1–P6 page)

For each page, the migrator should:
1. **Read the current client component end-to-end** before changing anything. Don't migrate what you don't understand.
2. **Catalog its functionality**: every filter, drilldown, tooltip, modal, action. Map each to v2 patterns.
3. **Identify reused sub-components** (PremiumStatGrid, TeamHealthPanel, ClientQuickSearch, etc.). Decide per-component: reuse, wrap-in-v2-styling, or rebuild from scratch.
4. **Confirm the data shape**. Pull the `page.tsx` server fetches and the Props interface. The client component should keep the same Props (so the server component doesn't change).
5. **Plan the commit slice**: don't ship one giant rewrite. Split into 4-6 commits per page, each leaving the page functional. See section 5.
6. **Verify in preview after every commit**. Use `Vercel:list_deployments` + a real screenshot + DOM check. Never trust a commit landed correctly without seeing it in the browser.

---

## 4. Critical lessons (gotchas already discovered — don't repeat)

### Lesson 1: viewport width ≠ screenshot resolution

Screenshots taken via the browser-automation MCP come back at 1.25× device pixel ratio. A 1319px-wide screenshot = 1055px actual viewport (`window.innerWidth`). The MCP's `resize_window` tool can't shrink below the macOS WM floor (~955px), so PWA-width verification has to happen on Josh's actual phone.

**Implication for breakpoint choices:** Mantine `lg` = 1200px, which is GREATER than the actual viewport at Josh's typical screen size. The /dashboard-v2 bottom 2-col layout originally used `lg` and never triggered. Fixed by switching to `md` (992px).

**Rule:** before choosing a Mantine breakpoint, DOM-inspect `window.innerWidth` on the deployed page. Don't infer from screenshot dimensions.

### Lesson 2: inline styles do NOT beat `!important` in CSS

The Header restyle initially failed because `app/globals.css` had:
```css
[data-theme="light"] header {
  background: #3b2a1a !important;
}
```
This `!important` rule clobbered the inline `background: linear-gradient(...)` on the `<header>` element. The cobalt JS bundle deployed correctly, the deployment ID matched, the source had cobalt — but the rendered page was still brown.

**Rule:** before assuming an inline-style edit is sufficient, **grep `app/globals.css` and any `app/*.css` files for the element selector**. Especially watch for `[data-theme="light"]` and `[data-theme="dark"]` overrides — there are many of them. If a CSS rule with `!important` exists, either edit it to match the new styling or remove it.

Verification trick: in browser DevTools console / `javascript_tool`, do:
```js
const h = document.querySelector('header');
const cs = getComputedStyle(h);
({bg: cs.backgroundColor, img: cs.backgroundImage})
```
If `backgroundColor` is a solid color and `backgroundImage` is `none` despite you setting a gradient in inline style → CSS override is winning. Find and fix.

### Lesson 3: caching ≠ the problem when DOM disagrees with source

If a page renders an old style but the deployed source has the new style and the deployment ID matches the latest deploy: **don't blame browser cache first.** Check whether a `!important` CSS rule is overriding. This is what bit us during the Header restyle.

Cache busting via `?_cb=v2` query parameter is useful to RULE OUT cache, but it shouldn't be the first hypothesis.

### Lesson 4: `/dashboard` for supervisor role renders SupervisorControlPanelClient

In `app/dashboard/page.tsx`:
```
if (isSupervisorLike(profile?.role) && full !== '1') {
  return <SupervisorControlPanelClient ... />
}
```
So migrating `SupervisorControlPanelClient` covers `/supervisor` AND `/dashboard` for supervisor/IT roles in one shot. The `?full=1` query param shows the SP-style dashboard even for supervisors.

This is good leverage but also a constraint: be careful not to over-fit the component to /supervisor (e.g., adding URL-aware logic that breaks on /dashboard).

### Lesson 5: `direction={{ base, md, lg }}` on Mantine Flex IS the right responsive pattern

Mantine v9's `<Flex direction={{ base: 'column', md: 'row' }}>` works correctly — it generates a `@media (min-width: 62em)` query and applies `flex-direction: row` past that. Verified via DOM check after my first failed attempt with `lg`. Don't switch to CSS-in-JS or styled-jsx unless you have a specific reason — Flex's responsive object syntax is the recommended approach.

### Lesson 6: Workflow lives on Josh's Mac, not the VPS

Josh runs `git pull --rebase` / `git commit` / `git push` from `/tmp/casesync` on his MacBook. The VPS at `/home/casesync/casesync/` is for recon and file inspection only — NOT for Claude to commit and push from. When delivering a code change to Josh, bundle it as a tarball, present_files it, and give him the `tar xzf ~/Downloads/{name}.tar.gz` + `git add` + `git commit` + `git push` recipe.

**Critical:** Mac tar commands run in a zsh shell. NEVER include `#` comments inside the bash commands you send to Josh — zsh interprets `#` as a literal character at the start of a word but ignores everything after it on the same line. To be safe, just don't put comments in commands he runs.

### Lesson 7: SVG src in Next.js needs `unoptimized` flag

`<Image src="/heroes/foo.svg" width={...} height={...} unoptimized priority />` is the canonical render for SVGs in `/public`. Without `unoptimized`, Next.js tries to optimize SVGs and either rejects them or breaks them. With `priority`, they don't lazy-load above the fold (important for the greeting hero).

### Lesson 8: emoji collisions render identically across browsers

Originally Team Tools had Client Transfer Board (🔀), Team Manager Board (🧭), and Queue Command Center (🧭) — two distinct emoji codepoints rendering as the same compass dial glyph on macOS Safari. The fix: change Team Manager Board to 🔄. **Rule:** when picking icons for adjacent cards, render the page first and visually confirm distinct glyphs. Lucide-react icons are more reliable than emoji for this reason.

### Lesson 9: there are signed-out redirects

While verifying /supervisor and /dashboard during the Header commit, both pages bounced to `/login?reason=signed_out`. This is the pre-existing session bug (also tagged in memory) — affects every authenticated page after ~2min idle on the preview branch. Not new, not v2-related, but **annoying during verification**. Workaround: have Josh log in fresh before each verification round. Real fix is its own task on `main` — see Open Items.

### Lesson 10: Vercel `list_deployments` needs `since` to filter stale results

`Vercel:list_deployments` without a `since` Unix-ms timestamp returns the latest deployment regardless of when it was created. Always pass a `since` value just below the current Unix time to get the newest deploy after a push.

---

## 5. The specific /supervisor migration plan (P1, ~6 commits)

This is the explicit slice plan for replacing `components/SupervisorControlPanelClient.tsx`.

### Source files to read first

In order — don't write code until you've read these:

1. `app/supervisor/page.tsx` (33 lines) — server data fetches + auth gate
2. `app/supervisor/layout.tsx` (27 lines) — wraps with `<Header>` (now cobalt), `<IdleTimeout>`, `<main>`
3. `app/dashboard/page.tsx` (around 100+ lines) — confirms the supervisor variant renders the same client
4. `lib/types.ts:4` — `Profile` interface
5. `lib/dashboard-summary.ts:3` — `AssigneeSummaryRow` interface
6. `lib/dashboard-summary.ts` (whole file, 58 lines) — `getGlobalSummary` query (returns row of `client_status_summary_global` table)
7. `lib/queries.ts` — `getPlanners`, `getTeamManagers`, `getCurrentUserAndProfile`
8. `components/SupervisorControlPanelClient.tsx` (940 lines) — **the target**
9. `components/PremiumStatGrid.tsx` (355 lines) — KPI tile component, reused
10. `components/TeamHealthPanel.tsx` (205 lines) — Team Health bar chart, reused
11. `components/ClientQuickSearch.tsx` (100 lines) — search field, reused
12. `components/casesync-v2/SupervisorDashboardV2Client.tsx` — the v2 north-star, the visual template for the migration
13. `lib/mock-data.ts` (in `lib/casesync-v2/`) — Look at TeamSummary shape and badgeSlug field for porting

### Props interface — preserve exactly

The new client must accept the same Props the server passes:
```ts
interface Props {
  planners: Profile[]
  teamManagers: Profile[]
  summaryByAssignee?: Record<string, AssigneeSummaryRow>
  globalSummary?: {
    total_clients: number
    overdue_clients: number
    due_this_week_clients: number
    eligibility_ending_soon_clients: number
    no_contact_7_days_clients: number
  }
  profile?: Profile | null
}
```

`/dashboard` for supervisors also passes additional `savedViews: SavedViewRecord[]`. Check that page and decide whether the new client component should accept savedViews too (probably yes).

### Existing functionality to preserve (don't drop any)

Catalog from the 940-line component:
- **Hero row**: greeting card + ORG HEALTH meter (Excellent / Good / Needs Attention / Critical based on overdue rate) + an "URGENT — NEEDS ATTENTION" pulse-dot list of urgent clients
- **`<ClientQuickSearch>`**: live client search field with results dropdown
- **`<PremiumStatGrid>`**: 4 KPI tiles (Active Clients / Overdue / Due This Week / No Contact 7+ Days) with click-to-filter behavior
- **Metric chips with tooltips**: small "X Support Planners" / "Y Team Managers" chips, tooltips on hover
- **2-col main grid (`scp-two-col`, 1.15fr / 1fr)**: `<TeamHealthPanel>` on the left (bar chart with 3 tabs: Overdue Rate / Caseload Size / No Contact 7d+) + 6 stacked alert summary cards on the right (e.g., "9 overdue clients", "2 due this week", "9 no-contact 7d+", etc.)
- **Client Drill-down section**: filtered client list with 4 filter modes (`all | overdue | due_this_week | no_contact_7`) and a "View full results" link, pagination
- **Planner Workload section**: per-planner card with caseload counts + a "pressure score"
- **Team Roster section**: filter chips (`all | planners | team_managers | unassigned_planners`) + a roster card per profile with role badge and stats
- **SUPERVISOR SCOPE footer**: explanatory note distinguishing /supervisor from /admin
- **Mobile responsive `<style>` block**: hides 2-col grid, stacks hero row, shrinks KPI tiles below 768px

### Commit slice plan

#### Commit P1.1 — scaffold + KPIs + Team Overview wired

- Build new `SupervisorControlPanelClient.tsx` that ports the v2 visual shell:
  - Cobalt floating TopBar (or skip — the new global Header already provides cobalt; decide based on what the page needs)
  - Greeting block with `/heroes/schedule.svg` hero (or better: pick a more supervisor-themed hero — see Section 7)
  - 4 KPI tiles (cobalt / coral / amber / emerald) wired to `globalSummary` props
  - Team Overview rows wired to planners + teamManagers (need to derive team grouping — see "Team derivation" below)
- Render placeholders for the sections not yet ported: "Team Health (loading…)", "Client Drill-down (loading…)", "Planner Workload (loading…)", "Team Roster (loading…)"
- Auth gate stays in `app/supervisor/page.tsx`, unchanged
- Verify: visit /supervisor on preview, see new visual, confirm KPI numbers match real data

#### Commit P1.2 — port Team Health bar chart

- Rebuild the 3-tab Team Health chart using `@mantine/charts` `BarChart` (consistent with v2's `LineChart` for Caseload Trend)
- Reuse the existing data shape from `TeamHealthPanel.tsx` so server code doesn't change
- Tabs: Overdue Rate / Caseload Size / No Contact 7d+
- Verify: switch tabs, confirm data redraws correctly

#### Commit P1.3 — port Client Drill-down

- Filter chips: `all | overdue | due_this_week | no_contact_7`
- List card per client with: name, assigned SP, team, due / overdue badge
- Pagination (or "View full results →" link if the existing component used a link)
- Verify: change filter, confirm list updates

#### Commit P1.4 — port Planner Workload + Team Roster

- Planner Workload: card per planner from `summaryByAssignee` with: name, role badge, caseload count, overdue count, pressure score
- Team Roster: filter chips `all | planners | team_managers | unassigned_planners` + roster cards
- Verify: scroll through both sections, confirm all planners + TMs render

#### Commit P1.5 — port stacked alert summary rows + SUPERVISOR SCOPE footer

- Convert the right column of the existing scp-two-col into single-column stacked alert rows (matching the v2 Attention Feed pattern)
- Footer card with explanatory text
- Verify: confirm content, no regressions

#### Commit P1.6 — polish

- Mobile responsive: verify all sections stack correctly at PWA width (~390px). Use `<Flex direction={{base:'column', md:'row'}}>` pattern from Lesson 5 wherever a 2-col layout exists.
- Delete leftover `scp-*` CSS classes from `app/globals.css` if no longer used
- Remove unused imports
- Verify across /supervisor and /dashboard (for supervisor role)
- **Final cross-check:** screenshot a side-by-side of old (production blhcasesync.com/supervisor) vs new (preview /supervisor). Confirm visual parity in functionality, just rebadged in v2 styling.

### "Team derivation" — open question for Commit P1.1

The v2 Team Overview rows show 6 teams. Real data has:
- N supervisors (each "owns" a team named "X's Team")
- M team_managers (Rosabel → Blue Giants, Mariama → Gold Giants)
- Planners are assigned to one supervisor and possibly one team_manager

So a "team" in the supervisor view = either a supervisor's team OR a team_manager's named team. Deriving this from `planners` + `teamManagers` props requires:
- Group planners by `supervisor_id` → that's one team per supervisor
- Group planners by `team_manager_id` → that's one team per TM
- The same planner can appear in both (counts shouldn't double — clarify with Josh)

**Decision needed before Commit P1.1:** does the supervisor dashboard show supervisor-level groupings, team_manager-level groupings, or both? Confirm with Josh, then encode in `derivedTeams: TeamSummary[]` helper.

For the badge mapping (each derived team → a `badgeSlug`), see Section 2 (Team badges). Without a real mapping in the DB, fall back to a deterministic hash-to-badge mapping so each team always gets the same badge across renders.

---

## 6. Workflow — how to make every commit safely

### The standard loop

1. **Read** the file(s) in question via VPS terminal first
2. **Plan** the slice — what changes, in what file, why
3. **Edit** the file in `/home/claude/` (sandbox)
4. **Audit**: grep for unused imports, balanced braces, no leftover TODOs
5. **Bundle**: tar the changed files preserving repo paths
6. **present_files** the tarball
7. **Wait** for Josh to apply on Mac and push
8. **Poll** Vercel via `list_deployments` with a `since` timestamp until READY
9. **Navigate** to the changed page on the preview URL
10. **DOM-check** computed styles for the changed element
11. **Screenshot** for visual confirmation
12. **Report** to Josh: what changed, what verified, what's next

### Tarball recipe

```bash
STAGE=/mnt/user-data/outputs/casesync-{slice-name}
rm -rf $STAGE
mkdir -p $STAGE/{path1,path2,...}
cp /home/claude/edited-file-1.tsx $STAGE/{path1}/file1.tsx
cp /home/claude/edited-file-2.tsx $STAGE/{path2}/file2.tsx
cd $STAGE && tar czf /mnt/user-data/outputs/casesync-{slice-name}.tar.gz {top-level-dirs}
```

Then present_files: `["/mnt/user-data/outputs/casesync-{slice-name}.tar.gz"]`

### Mac apply recipe (what to tell Josh)

```
cd /tmp/casesync
git pull --rebase
tar xzf ~/Downloads/casesync-{slice-name}.tar.gz
git diff --stat
git add {explicit files}
git commit -m "{conventional commit message}"
git push
```

NO `#` comments. Always `git diff --stat` BEFORE `git add` so Josh sees what changed.

### Verification recipe

```
sleep 75-90s for build
Vercel:list_deployments(since=Date.now()-5min)
when state==READY, navigate browser to https://casesync-git-redesign-dashboard-187ead-jemelike-6356s-projects.vercel.app/{route}
take screenshot
javascript_tool:javascript_exec → check computed style of the element you just edited
report findings
```

### Tools at your disposal

- **VPS terminal** (tab varies): browser-automated terminal at `https://bos2.hostingervps.com/3115/`. Click at the active prompt line before typing. Paste limit ~2000 chars (chunk if needed).
- **Claude in Chrome**: `navigate`, `computer` (screenshot/click/scroll/key), `javascript_tool` (param is `text`, not `code` or `script`), `read_console_messages`, `read_network_requests`, `resize_window` (capped at macOS WM floor ~955px)
- **Vercel MCP**: `list_deployments` (always pass `since`), `get_deployment_build_logs`, `web_fetch_vercel_url`
- **Supabase MCP**: `execute_sql`, `apply_migration` (project ID: `iiqttbpaufzlinbufsdx`) — use sparingly, only when DB changes are required
- **str_replace** + **create_file** + **view**: standard file ops in `/home/claude/`
- **bash_tool**: full bash in the sandbox. Use for curl from GitHub raw, building bundles
- **present_files**: how files get to Josh
- **visualize:show_widget**: for previewing SVGs / options inline in chat. Read `visualize:read_me({modules:['mockup']})` silently first.

---

## 7. CaseSync-specific hero illustrations — to commission

Currently every CaseSync page hero uses a Workryn placeholder. Long-term, CaseSync deserves its own bespoke set, themed around case management. Style match: same artist, same emerald + amber + slate palette, flat-illustration-with-glow.

Proposed CaseSync hero set (one per page):

| Page | Theme | Visual concept |
|---|---|---|
| `/dashboard` (SP) | "My caseload today" | SP figure at desk, clipboard with checkmarks, a few faces (clients) floating around |
| `/supervisor` | "Org pulse" | Pulse-meter illustration with a small chart graph, glowing emerald sphere |
| `/team` | "Team coverage" | Hexagonal grid of avatars / silhouettes, color-coded |
| `/clients` (list) | "Client roster" | Stack of profile cards fanned out, the top one in focus with a small badge |
| `/clients/[id]` | "Client deep-dive" | Single profile card with a thread of timeline events behind it |
| `/calendar` | (use existing schedule.svg) | n/a |
| `/admin` | "Admin controls" | Existing admin.svg (shield + dashboard panel) — already matches |
| `/admin/audit` | "Audit trail" | A scroll/timeline with checkmarks down the side |
| `/settings/security` | "Lock + keys" | A vault door, half-open, with a key |
| `/help` | "Help & tour" | A friendly compass / map illustration |

Defer commissioning until Josh decides on the artist. The placeholders work for now.

---

## 8. Open items / known risks

### App-wide

- **`/login?reason=signed_out` recurrence**. Every authenticated page bounces to login after ~2 min idle. Affects both production (main) and preview (redesign branch). Independent of v2. Will impede verification. Earlier fix attempt: commit `70d54b2` removed pagehide handler from `SessionGuard.tsx`. Another path still fires — possibly visibilitychange or focusout. Investigate when ready: log `signOut` calls, narrow down trigger.
- **Mobile bottom nav** (`.mobile-nav` in `Header.tsx`) still uses `var(--surface)` — wasn't included in the cobalt restyle. Leave alone for now. Polish as its own commit once the inner pages are migrated.
- **`GlobalSearch` and `NotificationBell`** sub-components inside Header haven't been visually verified on cobalt. They may have internal styling that clashes. Iterate when noticed.
- **`workryn-light-mode.css`** is loaded by the root layout for ALL routes, including non-workryn ones. It has 1132 lines of light-mode rules. There may be more `!important` rules in there that override v2 styles. Grep when you hit unexpected styles.
- **Header role label "SUPERVISOR" slightly clipped** behind the Sign out pill in the latest screenshot. Add `marginRight` to the user-meta div or shrink the Sign out label.
- **"Audit Log" wraps to two lines** in the nav row at the current viewport. Either shorten the label ("Audit") or widen the row's max content width.

### Per migration

- **The signed-out issue will hit verification.** Have Josh re-log in before each verify round. Or fix the session bug as its own commit first if it becomes intolerable.
- **`PremiumStatGrid` and other reused components reference `var(--accent)`, `var(--border)`, `var(--surface)`, `var(--text)`, `var(--text-secondary)`** — these are app theme variables that change between light and dark mode. When you wrap a reused component in v2-styled chrome, the inner component may not match the new palette. Either rebuild the component with v2 inline styles, or write CSS to override the variables in a v2 scope.
- **Old `SupervisorDashboardClient.tsx`** exists alongside `SupervisorControlPanelClient.tsx`. Confirm which is in use and delete the dead one when safe.
- **CSS class cleanup**: `app/globals.css` has many classes prefixed with `scp-` (scp-hero-row, scp-hero-welcome, meter-fill, pulse-dot, scp-two-col, metric-chip-wrap, metric-chip-tooltip). After /supervisor migration, audit these and delete the unused ones.

### Future considerations

- **Real BLH staff roster import** (per recent_updates memory) — not v2 concern, but needed for go-live.
- **Bot confidence threshold** decision pending — separate from v2.
- **Email sending domain + DNS** — separate from v2.
- **BAA confirmations** for Supabase / Vercel / Resend — separate from v2.
- **PITR verification** — separate from v2.

---

## 9. Quick reference — file paths

```
Repo:                                       jemelike-lab/casesync
Branch:                                     redesign/dashboard-v2-northstar
Preview URL:                                https://casesync-git-redesign-dashboard-187ead-jemelike-6356s-projects.vercel.app
Vercel project ID:                          casesync
Vercel team ID:                             jemelike-6356s-projects
Supabase project ID:                        iiqttbpaufzlinbufsdx

Josh's working dir on Mac:                  /tmp/casesync
VPS clone dir:                              /home/casesync/casesync (recon only)
Sandbox working dir (Claude):               /home/claude/

KEY FILES (paths in repo):
  app/layout.tsx                             root layout (theme init, providers)
  app/globals.css                            global styles — CAREFUL of [data-theme="light"] overrides
  app/workryn-light-mode.css                 1132 lines of light-mode rules
  app/supervisor/layout.tsx                  supervisor layout (uses <Header>)
  app/supervisor/page.tsx                    supervisor server component (33 lines, simple)
  app/dashboard/page.tsx                     dashboard with role-based variant rendering
  components/Header.tsx                      app-wide top nav (cobalt as of 6a82860 + 63c648b)
  components/SupervisorControlPanelClient.tsx   THE 940-line target for P1
  components/PremiumStatGrid.tsx             355-line KPI tile component
  components/TeamHealthPanel.tsx             205-line Team Health bar chart
  components/ClientQuickSearch.tsx           100-line client search
  components/GlobalSearch.tsx                global header search
  components/NotificationBell.tsx            global notification bell
  components/casesync-v2/SupervisorDashboardV2Client.tsx  the v2 NORTH STAR — visual template
  components/casesync-v2/CaseSyncV2MantineProvider.tsx    Mantine provider for the v2 page
  lib/casesync-v2/theme.ts                   v2 theme tokens (colors, fonts)
  lib/casesync-v2/mock-data.ts               v2 mock data (teams, KPIs, trend, attention items)
  lib/types.ts                               app-wide types (Profile, Client, etc.)
  lib/dashboard-summary.ts                   supervisor data fetches (getGlobalSummary, getAssigneeSummaryMap)
  lib/queries.ts                             user / planner / team_manager queries
  public/heroes/*.svg                        14 hero illustrations (Workryn placeholders)
  public/teams/*.svg                         10 team badges
```

---

## 10. Definition of done — when is v2 migration complete?

- [ ] /supervisor and /dashboard (supervisor role) match v2 visual language with all functionality preserved
- [ ] /team uses v2 visual language with team badges integrated
- [ ] /clients (list + detail + new + import) uses v2 visual language
- [ ] /admin uses v2 visual language
- [ ] /admin/audit uses v2 visual language
- [ ] /calendar uses v2 visual language
- [ ] /settings + /help use v2 visual language
- [ ] CaseSync-specific bespoke hero illustration set commissioned and wired into all hero blocks
- [ ] Empty-state SVGs wired into all "no items" placeholders (existing 3 empty-* heroes are already deployed but unused)
- [ ] `app/globals.css` cleaned of dead `scp-*` and legacy theme overrides
- [ ] `workryn-light-mode.css` audited and any rules that conflict with v2 cobalt are resolved
- [ ] Mobile bottom nav restyled to match v2
- [ ] Header's Audit Log label wrapping and SUPERVISOR role clipping fixed
- [ ] Old `SupervisorDashboardClient.tsx` deleted if confirmed dead
- [ ] redesign branch merged to `main` and production `blhcasesync.com` serves v2
- [ ] Signed-out bug ('/login?reason=signed_out' on idle) resolved as a separate-but-blocking task

---

## 11. Cheat sheet for the next session opener

When the next Claude session picks this up, the very first thing to do:

```
1. Open this doc end-to-end.
2. cd into a sandbox, git clone or curl-pull from raw.githubusercontent for the files in Section 5.
3. Check Josh is signed in on the preview URL before any verification — refresh if needed.
4. Confirm the redesign branch state: git log redesign/dashboard-v2-northstar -10
5. Start with Commit P1.1 (supervisor scaffold).
6. Apply the standard loop from Section 6 (Read → Plan → Edit → Audit → Bundle → present_files → Wait → Poll → Verify → Report).
7. Do not make assumptions about the data shape — re-read the Props interface in Section 5 against the actual source.
8. Use the v2 north-star at /dashboard-v2 (preview) as the live visual reference. If you're not sure what something should look like, screenshot /dashboard-v2 and match it.
```

End of handoff.
