# CaseSync — Launch Readiness Handoff

> **Audience:** Next agent session (Claude or OpenClaw) picking up where this one left off, plus Josh as a checklist.
> **Status:** Pre-launch. Engineering is in good shape; data, integration, and operational verification are the remaining gates.
> **Target launch:** Week of 2026-06-14 (one week from this doc).
> **Last updated:** 2026-06-07 by Claude (backup agent session) at production HEAD `56ad34c`.

This is a living doc. The next session should update item status as work progresses and surface new risks as they come up.

---

## 1. Where things stand right now

### 1.1 Production deploy state

Production is live at `https://blhcasesync.com`, currently on commit `56ad34c` (deployment `dpl_7RqMfy4ePkfQLv942qk4poiHtoZ5`). Recent commits to `main`:

| Commit | What it shipped |
|---|---|
| `56ad34c` | Empty redeploy to pick up new env var |
| `2293804` | `proxy.ts` exempts `/api/bot/*` from session auth + CSRF check |
| `398b594` | Merge: file RBAC, in-portal viewer, audited APIs, bot endpoints, reassignment RPC wiring |
| `426f468` | (Pre-existing) logout icon fix |

### 1.2 Database migrations applied to production (Supabase project `iiqttbpaufzlinbufsdx`)

- `client_files_rbac_and_reassignment` — `user_can_access_client(uuid)` access function, RLS on `client_documents` and `storage.objects`, `client_assignment_history` table, `reassign_client(...)` RPC.
- `tighten_new_function_grants` — pins `search_path`, revokes `anon` on the new SECURITY DEFINER functions.
- `allow_team_manager_reassign_client` — adds `team_manager` to the RPC's allow list (alongside `supervisor` and `it`).

### 1.3 What's working

- **Client file storage** in Supabase bucket `client-documents`. Storage path is server-controlled: `{client_id_uuid}/{file_uuid}.{ext}`.
- **RBAC at the database level.** Planner-to-planner file leakage is structurally impossible. Access flips automatically when `clients.assigned_to` is updated.
- **In-portal viewer** for PDF, images, Word (mammoth.js), Excel (SheetJS). Word/Excel libraries are lazy-loaded.
- **Audited API endpoints** under `/api/clients/[id]/files/...` — list, upload, view-url, delete, plus reassign. Denied attempts are also audited.
- **BLH Bot endpoints** under `/api/bot/...` — LTSS match, list files, upload files. Authenticated via `BLH_BOT_API_KEY` bearer token; every action logged with `was_bot=true`.
- **Reassignment** is wired through `reassign_client(...)` RPC. Each reassignment writes three records: the actual swap, a row in `client_assignment_history`, and an entry in `audit_logs`.
- **Deadline cron** is configured in `vercel.json` — runs twice daily (`0 12 * * *` and `0 20 * * *` UTC). Tracks 13 deadline fields, notifies at 1/3/7 days before, on due date, and weekly while overdue.

### 1.4 Verified live as of this doc

- `BLH_BOT_API_KEY` env var is set in Vercel (Production + Preview, marked Sensitive). Confirmed via:
  - No-auth probe → `HTTP 401 {"error":"Missing or malformed Authorization header"}` (proves env var is set, otherwise we'd see 503).
  - Bad-bearer probe → `HTTP 401 {"error":"Invalid bot token"}` (proves the auth path executes end-to-end).
- The proxy bypass for `/api/bot/*` works — requests reach `withBotAuth` instead of the session wall.

---

## 2. Launch-readiness checklist

Status legend: ⬜ not started · 🟡 in progress · ✅ done · ⚠️ blocked / needs Josh decision

### Section A — Data hygiene & user provisioning

| # | Task | Owner | Status | Notes |
|---|---|---|---|---|
| A1 | Decide final real BLH staff roster — names, emails, and roles (`it`, `supervisor`, `team_manager`, `supports_planner`, `case_manager`) | Josh | ⚠️ | Block on this; everything downstream needs the roster. |
| A2 | Deactivate test profiles (`CaseSync Smoke Test`, `Nigel Test Supervisor`) — set `onboarded=false` so they can't sign in | Next session | ⬜ | Don't hard-delete; keep audit_logs FK integrity. |
| A3 | Decide what happens to existing test profiles that map to real people in disguise (e.g. `Bianca Parker`, `Chris McBorrough`, etc.) — keep & reclassify, or delete & re-invite | Josh | ⚠️ | Either works; reclassifying preserves any test activity. |
| A4 | Delete the 16 test clients (Doe family etc.) and any associated test files in storage | Next session | ⬜ | Use a single SQL transaction; storage objects need an explicit `storage.objects` cleanup pass. |
| A5 | Invite real BLH staff via `/accept-invite` flow with correct roles + `team_manager_id` set | Josh + next session | ⬜ | Bulk: build a small admin page or apply via SQL. Each invite triggers an email. |
| A6 | Seed real client data — decide source of truth (SharePoint? existing spreadsheet? old DB export?) and define the import path | Josh | ⚠️ | Per memory: target is ~5000 clients. Schema is mature; will need a column-mapping pass. |
| A7 | Build a one-shot import script (CSV → `clients` table) with idempotency (re-runnable) and a dry-run mode | Next session | ⬜ | Once A6 decision is made. |
| A8 | After import: set `assigned_to` correctly so RBAC actually does its job (otherwise everything is null and only supervisors see clients) | Next session | ⬜ | Either bulk via SQL from the import data, or via the new reassignment UI. |
| A9 | Verify final state: no test data, every real staff has correct role + manager, every real client has an assigned planner | Next session | ⬜ | Smoke test queries provided in §6. |

### Section B — BLH Bot integration testing

| # | Task | Owner | Status | Notes |
|---|---|---|---|---|
| B1 | Configure BLH Bot with `BLH_BOT_API_KEY` and the production endpoints | Josh / Bot side (OpenClaw) | ⬜ | Bot sends `Authorization: Bearer <key>` + `X-Bot-Origin: nigel` (or `rachel`, etc.). |
| B2 | End-to-end smoke test: bot calls `POST /api/bot/ltss/match` with `{ma_number: "..."}` for a real client, gets confidence 1.0 | Joint | ⬜ | Confirms matching works with real MA numbers. |
| B3 | End-to-end smoke test: bot calls `POST /api/bot/clients/[id]/files` with a real LTSS Excel/PDF, then `GET /api/bot/clients/[id]/files` to confirm it landed | Joint | ⬜ | Then verify in CaseSync UI the file appears for the assigned planner. |
| B4 | Verify audit trail: every bot action should appear in `audit_logs` with `user_role='bot'`, `user_email='bot:<origin>'`, `details.was_bot=true` | Next session | ⬜ | Query in §6. |
| B5 | Test bot's domain knowledge end-to-end: does it know what CFC, DDA waivers, MFP, SPM, POS, MDH dates mean in BLH's specific context? Does it know how to fill in the right deadline fields? | Josh + Bot side | ⬜ | This is a Bot-side capability question, not a CaseSync API question. |
| B6 | Decide bot's confidence threshold for autonomous action vs human confirmation. Recommended: 1.0 = auto-apply, anything less = surface to human for confirmation | Josh | ⚠️ | Pre-decision drives the bot's calling pattern. |
| B7 | Rotate the bot key once before going live with real PHI (one rotation drill so the procedure is proven) | Joint | ⬜ | Procedure: generate new key on VPS, update Vercel env, redeploy, update Bot, verify with curl, retire old key. |

### Section C — Deadline tracking & notifications

| # | Task | Owner | Status | Notes |
|---|---|---|---|---|
| C1 | Confirm Vercel Cron is firing `/api/check-deadlines` twice daily (look at Vercel logs around 12:00 and 20:00 UTC) | Next session | ⬜ | Vercel Cron has known quirks on free/hobby plans; verify on the actual plan. |
| C2 | Confirm `/api/health` cron is firing hourly and Sentry / Vercel surfaces failures | Next session | ⬜ | Health route should be cheap and side-effect-free. |
| C3 | Email delivery: which sender does Resend use? Verify SPF / DKIM / DMARC on the sending domain in DNS | Josh | ⚠️ | If sender is `noreply@blhnurses.com` or `@blhcasesync.com`, ensure DNS records are in place — otherwise deliverability is poor. |
| C4 | Send a test email through `/api/check-deadlines` with one fake near-due record, verify it lands in a real inbox (Gmail and Outlook both) | Next session | ⬜ | Add a temporary test client with a deadline 3 days out. |
| C5 | Verify the 13 deadline fields in `app/api/check-deadlines/route.ts` match the actual fields BLH tracks in real life. Add or rename if needed | Josh + next session | ⚠️ | Current fields: eligibility_end_date, three_month_visit_due, pos_deadline, assessment_due, thirty_day_letter_date, spm_next_due, co_financial_redet_date, quarterly_waiver_date, med_tech_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date. |
| C6 | Verify the daily digest email (`dailyDigestEmail` template) and the team manager planner alert (`teamManagerPlannerAlertEmail`) actually trigger and contain accurate data | Next session | ⬜ | Send to test staff first before going live. |
| C7 | Confirm notification preferences UI exists and works (`/api/workryn/notifications/preferences`). Each role should be able to opt-in/out of email channels | Next session | ⬜ | Check the Workryn settings page. |
| C8 | Consider: should reassignment trigger a notification to the new assigned planner? Currently it doesn't (only writes audit log + sends `sendAssignmentEmail` call which may or may not be configured) | Josh | ⚠️ | Decide. The hook exists in `ClientEditForm.handleReassign` but its delivery is unverified. |

### Section D — Compliance, HIPAA, audit

| # | Task | Owner | Status | Notes |
|---|---|---|---|---|
| D1 | Confirm Supabase PITR (Point-in-Time Recovery) is enabled on project `iiqttbpaufzlinbufsdx` | Josh | ⚠️ | Check Supabase dashboard → Database → Backups. Required for HIPAA; this was flagged earlier in the original session as never explicitly verified. |
| D2 | Confirm Supabase has a signed BAA in place with BLH | Josh | ⚠️ | Supabase Enterprise / Pro plans support BAA on request. |
| D3 | Confirm Vercel has a signed BAA in place with BLH (or move hosting to a HIPAA-compliant alternative) | Josh | ⚠️ | Vercel Enterprise supports BAA. Hobby/Pro plans do not. |
| D4 | Confirm Resend (email) has a BAA or document that no PHI is sent via email | Josh | ⚠️ | Current templates may include client names or deadline labels — that can constitute PHI. Either get the BAA or sanitize templates to refer to "Client #XYZ" with a deep link instead of the name. |
| D5 | Document audit_logs retention. Per memory: 6 years. Verify there's a retention enforcement mechanism (cron deletion of rows > 6 years old) or that the table is configured to keep indefinitely | Next session | ⬜ | If no enforcement exists, write a monthly cron that deletes old rows. |
| D6 | Document backup/restore runbook: how to restore a deleted file, how to restore a client record, how to restore the whole database from PITR | Next session | ⬜ | Save as `docs/RUNBOOK_BACKUP_RESTORE.md`. |
| D7 | Document incident response: who to call if there's a data exposure, what to do in the first hour, who notifies clients per Maryland breach notification laws | Josh + next session | ⚠️ | Maryland Personal Information Protection Act applies. Template runbook to be written. |
| D8 | Access review: confirm only people who genuinely need org-wide access have `supervisor` or `it` roles. Document who can self-promote and why | Josh | ⬜ | Once A1 roster is set. |

### Section E — Operational readiness

| # | Task | Owner | Status | Notes |
|---|---|---|---|---|
| E1 | Verify Sentry is capturing errors in production. Trigger a known error and confirm it appears in the dashboard | Next session | ⬜ | `SENTRY_DSN` env var is set; `sentry.client.config.ts` exists. |
| E2 | Configure Sentry alerts: email Josh on any error in `/api/clients/*` or `/api/bot/*`, on 5xx responses, on database connection failures | Josh + next session | ⬜ | Critical paths shouldn't fail silently. |
| E3 | Review rate limits in `proxy.ts`: currently 100 req/min/user on data APIs. With ~90 concurrent users projected, that's 9000 req/min capacity per minute — but a single user doing bulk file ops could hit the limit. Decide if 100 is right | Josh | ⬜ | Bump to 200 if needed; revisit during the first week of real traffic. |
| E4 | Vercel deployment protection: should production be behind any extra auth (password protection / IP allowlist)? Probably no — public app — but confirm | Josh | ⬜ | |
| E5 | DNS settings: confirm `blhcasesync.com` and `www.blhcasesync.com` both resolve, SSL is valid, HSTS is enabled (if desired) | Josh | ⬜ | |
| E6 | VPS redundancy — Josh's original concern #1. Pending. Decision: defer to post-launch unless something on the VPS is actually on the critical path | Joint | ⚠️ | Post-launch ok if LTSS billing cron can survive a one-day VPS outage. |
| E7 | Document on-call: who responds during BLH business hours, who responds out-of-hours, what the escalation path is | Josh | ⬜ | |

### Section F — Pre-launch testing

| # | Task | Owner | Status | Notes |
|---|---|---|---|---|
| F1 | E2E test on a real planner account: upload a PDF + Word + Excel + image, view each inline, download one, delete one. Verify audit_logs has the expected events | Next session | ⬜ | The shape we want to see. |
| F2 | RBAC live test: log in as Planner A and confirm you can see Client X; log in as Planner B (no relation) and confirm Client X is not visible | Next session | ⬜ | Most important security guarantee. |
| F3 | Reassign test: as supervisor, reassign Client X from Planner A → Planner B with a reason. Verify the file access transfers, the `client_assignment_history` row appears, the activity_log shows the action, and Planner B sees the files immediately | Next session | ⬜ | Confirms the whole RBAC flip works end-to-end. |
| F4 | Bot test: real bot end-to-end using BLH Bot's real configuration. Verify happy path (1.0 confidence match), edge case (no match), and degraded case (0.5 confidence) | Joint | ⬜ | Bot should not auto-apply 0.5; surface for human. |
| F5 | Deadline notification test: create a client with a deadline 3 days out, manually trigger `/api/check-deadlines` (with the right `CRON_SECRET`), verify the right people get the email | Next session | ⬜ | Don't wait 3 days for the cron — fire it manually. |
| F6 | Mobile / PWA test: install the PWA on iOS Safari and Android Chrome. Sign in, navigate to a client, view a file, sign out. Pay special attention to: PWA backgrounding (30s logout per the iOS PWA fix), session cookie expiry, file viewer on small screens | Next session | ⬜ | The PWA cookie behavior had several fixes in May; verify they all hold. |
| F7 | Backup restore drill: pick a non-critical client, delete it, restore from PITR, verify all metadata + file storage was recovered | Next session | ⬜ | If we never restore once, we don't actually have a backup. |
| F8 | Load test: use the staged k6 script (`/home/openclaw/casesync-load-test.js` on the VPS) to confirm the system handles 90 concurrent users without falling over | OpenClaw | ⬜ | Per AGENT_PROTOCOL.md, OpenClaw owns this autonomously. |

### Section G — Cutover & first week

| # | Task | Owner | Status | Notes |
|---|---|---|---|---|
| G1 | Decide cutover date and communicate it to staff. Suggest a low-traffic day (e.g. Friday afternoon or weekend) so any rough edges land before Monday | Josh | ⚠️ | |
| G2 | Training materials: docs/guide-supports-planner.md, guide-team-manager.md, guide-supervisor.md already exist. Verify they're up to date and link to the new file viewer flow | Next session | ⬜ | The new ClientFiles component changes the upload UX; the guides need a quick refresh. |
| G3 | Schedule training sessions: 30 min walk-through per role group. Record one and post in CaseSync's training section | Josh | ⬜ | |
| G4 | Day-of cutover runbook: see §4 below | Next session | ⬜ | |
| G5 | Rollback plan: if something is catastrophically wrong, what do we do? Per Vercel `isRollbackCandidate: true` on past deploys, we can roll back in one click. The DB migrations are forward-compatible and don't need rolling back (RLS is additive; the new tables are new) | Next session | ⬜ | Write up as a one-pager. |
| G6 | First-week support: a designated person on Slack / phone for staff questions for the first 5 business days | Josh | ⬜ | |
| G7 | Daily ops review for the first week: every morning, check Sentry, check audit_logs for anomalies, check Vercel deploy status, check email delivery | Next session | ⬜ | 15 min/day, save the queries as a reusable script. |

---

## 3. Open questions for Josh (please answer before next session)

These are blockers for autonomous work. Most are short answers.

1. **Real BLH staff roster.** Names, emails, roles. (Section A1.)
2. **Real client data source.** Where does the existing data live, in what format? (Section A6.) Are we doing a one-shot import or progressive entry?
3. **Sending domain for emails.** What from-address should notifications use? Are DKIM/SPF records already set on that domain? (Section C3.)
4. **HIPAA paperwork.** Are BAAs already signed with Supabase, Vercel, and Resend? If not, who's chasing? (Section D2, D3, D4.)
5. **PITR enabled?** Quick check in Supabase console — Database → Backups. (Section D1.)
6. **Bot confidence threshold.** Auto-apply at 1.0 only, or also at 0.7? (Section B6.)
7. **Cutover date.** When? (Section G1.)
8. **On-call.** Who's the human on the other end of the support hotline during launch week? (Section E7.)

---

## 4. Day-of-launch runbook (draft — fill in once cutover date is set)

T-2 hours
- Final smoke test pass (Section F1, F2, F3) on production.
- Confirm Sentry inbox is empty.
- Confirm Vercel latest deploy is READY.
- Confirm Supabase PITR enabled.
- Take an explicit PITR snapshot timestamp (record it; this is the rollback target).

T-1 hour
- Send "system going live" email to all staff with a sign-in link and the relevant docs/guide-*.md page.
- Open Vercel Logs and Sentry side-by-side for monitoring.

T-0
- (No code changes today. The system is already live; this is just the "real data starts flowing" moment.)
- Real planners and team managers sign in. They will arrive at clients via the dashboard.

T+1 hour
- Pull `audit_logs` for the last hour. Look for: any `*.denied` events (could indicate RBAC misconfiguration), any 5xx in Vercel logs, any unhandled errors in Sentry.
- Pull active session count from Supabase if available.

T+24 hours
- Daily ops review. Notification delivery report (how many sent, how many failed). Audit log volume report. Most-active users, most-active clients.

---

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Real client import has data quality issues (missing assigned_to, wrong dates, duplicates) | Medium | High — RBAC + deadlines depend on this | Import in batches, dry-run first, manual review of a 50-row sample before bulk run |
| BLH Bot misroutes a file due to ambiguous match | Low if conf-1.0-only, Medium otherwise | High — wrong-client file is a HIPAA exposure | Require human confirmation for any match < 1.0. Bot's caller is responsible for confirming. |
| Email deliverability fails due to missing DNS records | Medium | Medium — deadline alerts don't reach staff | Verify DKIM/SPF/DMARC in DNS before launch. Test deliverability to Gmail + Outlook + Apple Mail. |
| Supabase PITR not actually enabled | Low | Catastrophic — no rollback | Verify in console pre-launch. Test a restore. |
| VPS goes down during launch week | Low | Low — LTSS billing cron delayed; CaseSync itself is fine | Accept the risk; address post-launch. |
| Vercel function cold start exceeds reasonable latency on first hit each day | Medium | Low — annoying but not breaking | Keep hourly `/api/health` cron, which acts as a warmer. |
| Too many people get `supervisor` role and accidentally see clients they shouldn't | Medium if A1 is rushed | High — silent over-access | A1 review with Josh; reaffirm "supervisor" is HR-grade, not "senior planner" |
| BAA not signed with one of the data processors | Unknown | Catastrophic — non-compliance | Verify in D2/D3/D4 before launch. |

---

## 6. Reference: quick verification queries

Drop these into the Supabase SQL editor (or `Supabase:execute_sql` tool) during checklist work.

### Bot activity audit (last 24h)
```sql
select created_at, action, resource_id, details
from audit_logs
where user_role = 'bot'
  and created_at >= now() - interval '24 hours'
order by created_at desc
limit 50;
```

### Denied access attempts (last 7 days) — should be zero or near-zero in normal operation
```sql
select created_at, user_email, action, resource_id, details
from audit_logs
where action like '%.denied'
  and created_at >= now() - interval '7 days'
order by created_at desc;
```

### Roster sanity check — counts by role
```sql
select role, count(*) filter (where onboarded = true) as active,
              count(*) filter (where onboarded is not true) as pending
from profiles
group by role
order by role;
```

### Clients without an assigned planner — should be zero post-import
```sql
select count(*) as unassigned_active_clients
from clients
where is_active = true and assigned_to is null;
```

### Test data still present? — should return zero rows post-cleanup
```sql
select id, first_name, last_name, created_at
from clients
where lower(last_name) in ('doe', 'test', 'smoke')
   or lower(first_name) like '%test%';
```

### Reassignment history — verify it's being populated
```sql
select count(*) as reassignments_30d
from client_assignment_history
where occurred_at >= now() - interval '30 days';
```

---

## 7. Reference: key identifiers & paths

- **Supabase project:** `iiqttbpaufzlinbufsdx`
- **Vercel project:** `prj_uPD5Jl6BJwRMwOsAa5UACo1K5UbW` (team `team_fASanR2j8wd8bhOUYS07f3NL`)
- **GitHub repo:** `jemelike-lab/casesync`, default branch `main`
- **Production URL:** `https://blhcasesync.com`
- **Storage bucket:** `client-documents` (private, 50MB max, MIME-restricted)
- **Storage path convention:** `{client_id_uuid}/{file_uuid}.{ext}`
- **Bot auth:** `Authorization: Bearer $BLH_BOT_API_KEY` + optional `X-Bot-Origin: <name>` header
- **Bot endpoints:**
  - `POST /api/bot/ltss/match` — `{ma_number?, first_name?, last_name?}` → ranked candidates
  - `GET /api/bot/clients/[id]/files` — list files for a client
  - `POST /api/bot/clients/[id]/files` — upload a file (multipart, field `file`)
- **Vercel Cron:** see `vercel.json` — `/api/check-deadlines` at 12:00 + 20:00 UTC daily; `/api/health` hourly
- **Audit log retention target:** 6 years (HIPAA)
- **Signed URL TTL for file views:** 5 minutes

---

## 8. For the next session

When you pick this up:

1. Read this doc top to bottom (5 minutes).
2. Pull the latest `main` and check `git log -10` to see if anything's changed since `56ad34c`.
3. Check Vercel deploy status and Sentry inbox.
4. Run the queries in §6 to see the current state of the world.
5. Ask Josh which open question from §3 he wants to start with, or — if he's said "proceed" — start with whichever blocker is most actionable given his answers in the chat so far.
6. Update the status column in §2 as you make progress.

Per `AGENT_PROTOCOL.md` on the VPS:
- This handoff type is `BACKUP_SESSION` continuing toward `TASK_COMPLETE`.
- Reason for original handoff: `BACKUP_NEEDED` (Josh invoked Claude as backup agent for this engineering push).
- OpenClaw remains the primary autonomous agent for VPS-side work (load testing, billing cron, etc.). Claude should not duplicate that work.

Stay autonomous where the task is bounded and safe. Escalate only when an action could cause data loss, user lockouts, or PHI exposure, or when Josh's domain knowledge is required (Section 3 is the canonical list of those).
