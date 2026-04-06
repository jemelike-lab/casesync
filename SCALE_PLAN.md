# CaseSync Scale Plan for 5,000+ Clients

## Goal
Make CaseSync handle 5,000+ active clients without loading full datasets into the browser, while keeping dashboard/search/calendar/admin flows responsive.

## Current bottlenecks found

### 1) Dashboard loads full active client sets
- `app/dashboard/page.tsx`
  - Uses `getActiveClients()` for supervisor/team manager/planner flows.
  - Sends full `clients` arrays into `DashboardClient` / `SupervisorControlPanelClient`.
- `lib/queries.ts`
  - `getActiveClients()` does an unrestricted select of active clients, ordered by last name.
- `components/DashboardClient.tsx`
  - Performs search/filter/sort in-memory on the full client array.
  - Bulk actions and exports also depend on the full dataset being present.

### 2) Calendar builds all events client-side
- `app/calendar/page.tsx`
  - Loads all active clients for user scope.
- `components/CalendarView.tsx`
  - Builds deadline maps/events in the browser from the full client list.

### 3) Summary stats still over-fetch
- `lib/dashboard-summary.ts`
  - `getGlobalSummary()` selects all rows from `client_status_summary` and counts in JS.
  - Fine at small scale, wasteful at 5k+ and gets worse over time.

### 4) API pagination exists, but needs to become the default access pattern
- `app/api/clients/route.ts`
  - Already supports `page`, `limit`, `filter`, `search`.
  - Good starting point, but search/filter/index strategy needs tightening.

### 5) Browser-side exports won’t scale well
- `components/DashboardClient.tsx`
  - `exportToCsv(filtered)` and selected export are browser-generated from loaded rows.
  - Fine for small filtered sets, bad for large supervisor/global exports.

---

## Implementation plan

## Phase 1 — Stop loading all clients into main list screens

### A. Replace full-array dashboard loading with paginated API reads
**Files to change:**
- `app/dashboard/page.tsx`
- `lib/queries.ts`
- `components/DashboardClient.tsx`
- likely `components/SupervisorDashboardClient.tsx`
- likely `components/SupervisorControlPanelClient.tsx`
- `components/ClientGrid.tsx`

**Plan:**
- Keep server-rendered auth/profile/bootstrap logic in `app/dashboard/page.tsx`.
- Stop calling `getActiveClients()` for the main list payload.
- Pass only:
  - current user/profile
  - planner/team-manager metadata
  - initial summary counts
  - maybe first page only if needed for fast paint
- Convert dashboard list area to fetch via `/api/clients` with:
  - `page`
  - `limit`
  - `filter`
  - `search`
  - `assignedTo`
  - `sortField`
  - `sortDir`

**Success criteria:**
- Opening dashboard no longer hydrates thousands of client records.
- Supervisor/team manager/planner dashboards only load visible page(s).

### B. Move search/filter/sort fully server-side
**Files to change:**
- `app/api/clients/route.ts`
- `components/DashboardClient.tsx`
- `components/FilterBar.tsx`
- `components/ClientQuickSearch.tsx`

**Plan:**
- Make UI controls update query params / request state.
- API applies:
  - scope by role
  - assignee filter
  - category filter
  - overdue/due-this-week filters
  - search
  - sort
- Remove large-array client-side `.filter()` / `.sort()` for main views.
- Add debounce for search input.

**Success criteria:**
- Browser only filters current page for presentation-only needs, not whole datasets.
- Searching for a client does not require the full client list in memory.

### C. Decide pagination UX
**Recommendation:**
- Use classic pagination first.
- Add infinite scroll later only if UX strongly benefits.

**Why:**
- Easier to reason about counts, exports, selection, and role-scoped browsing.
- Better for supervisors who may want predictable navigation.

---

## Phase 2 — Tighten database access patterns and indexes

### A. Add practical indexes for current query patterns
**Likely migration:** new file under `supabase/migrations/`

**Recommended indexes:**
- `clients(is_active, assigned_to, last_name)`
- `clients(is_active, category, last_name)`
- `clients(client_id)` unique already exists via schema, confirm in production
- `clients(is_active, last_name)`

**Search indexes:**
Use trigram or lower-expression indexes for fields used in `ilike` search:
- `lower(last_name)`
- `lower(first_name)`
- `lower(client_id)`
- `lower(eligibility_code)`

If using Postgres trigram:
- enable `pg_trgm`
- add GIN trigram indexes for the search fields

**Why:**
Current search in `app/api/clients/route.ts` uses ORed `ilike` clauses across multiple columns. That will become a drag without proper support.

### B. Rework overdue/due-this-week filtering
**Current issue:**
- Filters are OR-heavy across multiple date columns.
- Works, but gets progressively more expensive and harder to optimize.

**Better options:**
1. **Computed/materialized status layer**
   - create a materialized view or helper table with flags like:
     - `has_overdue`
     - `due_this_week`
     - `eligibility_ending_soon`
     - `no_contact_7_days`
2. **Persisted denormalized flags**
   - update on client writes / scheduled refresh
3. **Stay with view, but query it directly for list IDs**
   - then join back to clients

**Recommendation:**
- Short term: keep current view approach but query summary/status views directly for filters.
- Medium term: materialized summary table/view for more predictable performance.

---

## Phase 3 — Fix summary/precomputed stats

### A. Stop counting summary rows in JavaScript
**Files to change:**
- `lib/dashboard-summary.ts`

**Current issue:**
- `getGlobalSummary()` reads all rows from `client_status_summary` and counts in JS.

**Replace with:**
- SQL aggregate query or aggregate view returning one row:
  - `total_clients`
  - `overdue_clients`
  - `due_this_week_clients`
  - `eligibility_ending_soon_clients`
  - `no_contact_7_days_clients`

**Plan:**
- Add a dedicated aggregate view or RPC.
- Keep `client_status_summary_by_assignee` for grouped cards.
- Consider also adding:
  - `client_status_summary_by_team_manager`
  - global one-row summary view

**Success criteria:**
- Summary cards do not require loading all summary rows into app memory.

### B. Cache low-volatility dashboard summaries briefly
**Plan:**
- Cache overview counts for 30–120 seconds where appropriate.
- Revalidate after writes that affect dashboard state.

**Good candidates:**
- assignee summary cards
- supervisor overview totals
- admin invite counts/state summaries

---

## Phase 4 — Rework calendar for windowed fetches

### A. Stop loading all client deadlines for all active clients
**Files to change:**
- `app/calendar/page.tsx`
- `components/CalendarView.tsx`
- likely add new API route such as `app/api/calendar/route.ts`

**Plan:**
- Calendar view should request only the visible window:
  - one day
  - one week
  - one month
- API returns only deadlines within that range for current role scope.
- Optionally flatten deadlines server-side so the client receives event rows directly.

**Suggested event payload:**
- `clientId`
- `clientName`
- `deadlineType`
- `deadlineDate`
- `assignedTo`
- `urgency`

**Success criteria:**
- Month view loads only relevant events for that month.
- Switching months/weeks does not require all-client hydration.

---

## Phase 5 — Move heavy exports/reports to the server

### A. Replace browser CSV export for large datasets
**Files to change:**
- `components/DashboardClient.tsx`
- likely add `app/api/reports/...`
- possibly add a report/job table in Supabase

**Plan:**
- Keep browser export for tiny visible subsets if desired.
- For supervisor/team-manager/all-results exports:
  - submit export request to server
  - generate CSV server-side
  - store temporarily
  - return download link or notification

**Good background-job candidates:**
- full caseload export
- overdue reports
- weekly summary reports
- audit exports

**Success criteria:**
- Large exports don’t depend on the browser holding all rows.

---

## Phase 6 — Identify UI surfaces most likely to choke

### Highest priority to fix
1. `components/DashboardClient.tsx`
2. `app/dashboard/page.tsx`
3. `lib/queries.ts#getActiveClients`
4. `app/calendar/page.tsx`
5. `components/CalendarView.tsx`
6. `lib/dashboard-summary.ts`

### Likely follow-up review targets
- `components/SupervisorControlPanelClient.tsx`
- `components/SupervisorDashboardClient.tsx`
- `components/ClientQuickSearch.tsx`
- `app/admin/page.tsx` if user/invite counts grow enough
- any future audit/report pages that assume full-array rendering

---

## Concrete build order

### Step 1
Refactor dashboard lists to use `/api/clients` as the source of truth.

### Step 2
Expand `/api/clients` to support:
- assignee filter
- server-side sort
- stronger scoped search
- role-safe access rules

### Step 3
Replace client-side filtering/sorting/search in dashboard views.

### Step 4
Add DB indexes + search support migration.

### Step 5
Replace `getGlobalSummary()` with SQL aggregate view/RPC.

### Step 6
Create calendar range API and stop all-client event hydration.

### Step 7
Add server-generated exports/background report flow.

---

## Notes on role/security

### `/api/clients` currently uses service role after authenticating the caller
This can work, but only if every scope rule is enforced perfectly in the route.

**Recommendation:**
- Keep this only if the endpoint remains tightly controlled and well-tested.
- Otherwise prefer RLS-backed querying where practical.
- If service role stays, explicitly support and validate all roles now used in the app (`supports_planner`, `team_manager`, `supervisor`, etc.).

### Potential correctness issue spotted
In `app/api/clients/route.ts`, role handling checks `supports_planner`, while older schema text in `001_initial_schema.sql` references `case_manager` / `supervisor`.

That likely means migrations/schema history evolved. Worth auditing role consistency across:
- migrations
- RLS policies
- app role checks
- profile creation logic

This is both a scale and correctness task.

---

## Recommended immediate tickets

1. **Dashboard pagination refactor**
   - remove full-array client hydration from dashboard
   - fetch paged client results from API

2. **Client search/filter API hardening**
   - add assignee + sort params
   - tighten role-scoped access
   - add debounce in UI

3. **DB index migration**
   - add list/scope indexes
   - add search/trigram indexes

4. **Summary aggregation refactor**
   - replace JS counting with SQL aggregate output

5. **Calendar range API**
   - month/week/day scoped event reads only

6. **Server-side export job**
   - background CSV generation for large datasets

---

## Bottom line
CaseSync does not need a total rewrite for 5,000+ clients.

It does need one architectural shift:
**treat client lists as query-driven, paginated server data — not as arrays loaded into React and massaged in the browser.**

That one change will remove most of the scaling pain.
