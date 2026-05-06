# CaseSync Guide — Supervisor
**Beatrice Loving Heart (BLH)**
*Your complete guide to the CaseSync case management portal*

---

## Table of Contents
1. [Getting Started](#1-getting-started)
2. [Supervisor Control Panel](#2-supervisor-control-panel)
3. [Full Dashboard View](#3-full-dashboard-view)
4. [Client Cards & Urgency System](#4-client-cards--urgency-system)
5. [Client Detail Page](#5-client-detail-page)
6. [Team Page](#6-team-page)
7. [Calendar](#7-calendar)
8. [BLH Bot & AI Intelligence](#8-blh-bot--ai-intelligence)
9. [Admin Panel — Managing Users](#9-admin-panel--managing-users)
10. [Audit Log — HIPAA Compliance](#10-audit-log--hipaa-compliance)
11. [Bulk Contact Logger](#11-bulk-contact-logger)
12. [Mobile App (PWA)](#12-mobile-app-pwa)
13. [Quick Reference](#13-quick-reference)

---

## 1. Getting Started

### Logging In

1. Go to **blhcasesync.com** in your browser.
2. Enter your email address and password.
3. Click **Sign In**.

### Your Role and Permissions

As a Supervisor, you have the **highest level of access** in CaseSync:
- View all clients across all teams
- Access the Supervisor Control Panel with org-wide analytics
- Manage users via the Admin Panel (invite, change roles, deactivate)
- View the Audit Log for HIPAA compliance
- Access the Team page with planner workload analysis
- Use BLH Bot for org-wide questions
- Reassign clients and manage team structure

---

## 2. Supervisor Control Panel

When you log in, your default view is the **Supervisor Control Panel** — an executive-level overview of the entire organization.

### Org Health Meter

The welcome banner includes an **Org Health** meter — an animated bar showing what percentage of your clients are on track. The bar is color-coded (green = excellent, yellow = good, orange = needs attention, red = critical) with a text label.

### Urgent Client List

Next to the health meter, a live list shows **urgent clients** — those with the worst urgency scores. Each client shows:
- Client name with numbered priority
- Urgency-colored left accent bar
- Whether they're assigned or need a planner
- Click any client to jump to their detail page

### Premium Stat Cards

Four animated stat cards showing org-wide numbers:
- **Active Clients** — total across all teams
- **Overdue** — with % of caseload and animated arc
- **Due This Week** — upcoming deadlines
- **No Contact 7+ Days** — clients needing outreach

Click any card to filter the drill-down list.

### Client Drill-Down

Below the stats, a **Client Drill-Down** section shows clients filtered by the active stat. Each row shows:
- Avatar circle with initials
- Client name and ID
- Urgency badge and assigned planner
- Click to navigate to the client detail page

### Planner Workload

A section showing each planner with:
- Avatar and name
- Animated load bar (relative caseload size)
- Color-coded overdue status (red = 3+ overdue, orange = 1-2, green = 0)
- Metric chips (overdue/due/quiet counts with hover tooltips)

Click any planner to navigate to the Team page filtered to their clients.

### Team Roster

All planners and team managers listed with avatars, role pills, and client counts.

### Switching to Full Dashboard

Click **"← Dashboard"** at the top to switch to the full client-level dashboard view (same as what planners see, but with all clients). This uses the `?full=1` URL parameter.

---

## 3. Full Dashboard View

The full dashboard (accessible via the link on the Control Panel) shows the same features planners see, but scoped to all clients in the organization or filtered by planner.

Features: greeting card, suggested focus, premium stat cards, week strip, alert banner, saved views, view mode toggle (Grid/Ops Table), search/filter/sort. See the Supports Planner guide for full details.

To return to the Control Panel, click **"← Control Panel"** at the top.

---

## 4. Client Cards & Urgency System

### The 5-Tier Urgency System

| Color | Meaning | Threshold |
|---|---|---|
| 🟢 Green | On track | 7+ days until due |
| 🟡 Yellow | Upcoming | Due within 7 days |
| 🟠 Orange | Due soon | Due within 3 days |
| 🔴 Red | Overdue | 1–14 days overdue |
| 🔴 Critical | Critical | 14+ days overdue (pulsing animation) |

This system is consistent across the entire app — dashboard cards, calendar cells, client detail tiles, stat cards, and metric chips all use the same colors and thresholds.

---

## 5. Client Detail Page

The client detail page uses a **2-column layout**:

### Hero Header
- Client name, ID, category, eligibility, planner
- 64px Health Score Ring
- Urgency status pills (overdue count, due soon, contact status)
- Edit/Save/Cancel buttons

### Left Column — Key Deadlines
A **2×5 grid of interactive date tiles**. Hover any tile to see a popup showing:
- Urgency tier (CRITICAL / OVERDUE / DUE SOON / ON TRACK)
- Large countdown number ("12d overdue" or "3d left")
- Action prompt for overdue items

Below the grid: Contact details, Plans & Assessments, CO Details, Notes, Activity Log.

### Right Column — Sidebar
- **AI Intelligence** — ask questions or generate AI summaries
- **Client Info** — assignment, category, goal %, dates, and **Reassign** controls
- Med Tech, Forms, Authorizations, Reporting sections (collapsible)
- Documents upload

### Status Actions
At the bottom, supervisors can **Mark as Deceased** to deactivate a client record while preserving all historical data.

---

## 6. Team Page

Click **Team** in the navigation to access the premium Team page.

The Team page shows the same planner workload cards, metric chips with hover tooltips, and team roster as the Control Panel — but with additional team management features.

Click any planner row to see their clients filtered on the Team page.

---

## 7. Calendar

The premium calendar features:
- **Urgency-colored day cells** — red tint for overdue, amber for due soon, blue for today
- **Hover tooltips** — hover any day cell to see a popup with all clients and their deadlines for that day
- **Animated stat chips** at the top showing overdue/this week/upcoming counts
- **Month/Week/Day** views with vivid grid styling

---

## 8. BLH Bot & AI Intelligence

### BLH Bot

Available via the purple button 🟣 on any page. Supervisors can ask org-wide questions:
- "Which teams have the lowest SPM compliance?"
- "How many clients are overdue across the org?"
- "Who is assigned to [client name]?"
- "What are the HIPAA requirements for audit logs?"

### AI Intelligence

On any client detail page, the AI card lets you ask questions or generate a summary about that specific client. Useful for preparing for supervision meetings or quality reviews.

---

## 9. Admin Panel — Managing Users

Click **Admin** in the navigation.

### User Management

The Admin Panel shows all users with their roles, teams, and status. From here you can:
- View user details
- Change user roles (Planner → TM → Supervisor)
- Deactivate accounts when staff leave
- Send password resets

### Important Notes

- Changing roles takes effect immediately
- **Before deactivating**: reassign their clients to avoid orphaned records
- Granting Supervisor access gives full org-wide access — use carefully

---

## 10. Audit Log — HIPAA Compliance

Click **Audit Log** in the navigation.

### What's Recorded

Every significant action in CaseSync is logged:
- Authentication events (login, logout, failed attempts)
- Client record views and edits
- Contact logs created/edited
- Document uploads and downloads
- Admin actions (role changes, deactivations)

### Using the Audit Log

- Filter by date range, user, action type, or client
- Look for unusual patterns (user accessing many records quickly, or records outside their caseload)
- Review monthly for HIPAA compliance

### HIPAA Reminders

- Review the Audit Log **monthly** for unusual access
- **Deactivate** accounts promptly when staff leave
- Conduct **annual access reviews**
- Audit log exports contain PHI — handle securely

---

## 11. Bulk Contact Logger

Select multiple clients on the dashboard → click **📞 Log N Contacts** → choose date, type, note → all updated at once. See the Supports Planner guide for details.

---

## 12. Mobile App (PWA)

Install on iPhone (Safari Share → Add to Home Screen) or Android (Chrome menu → Install App). All supervisor features including Admin and Audit Log work on mobile.

---

## 13. Quick Reference

### Navigation Summary

| Page | Access | Purpose |
|---|---|---|
| Dashboard | All | Control Panel (Supervisors) or client list |
| Team | TM, Supervisor | Planner workload & assignment |
| Supervisor | Supervisor | Org-wide analytics |
| Admin | Supervisor | User management |
| Audit Log | Supervisor | HIPAA compliance |
| Calendar | All | Deadline tracking |
| Settings | All | Account settings |

### Urgency Colors

| Color | Badge | Meaning |
|---|---|---|
| 🟢 | On track | 7+ days out |
| 🟡 | UPCOMING | Within 7 days |
| 🟠 | DUE SOON | Within 3 days |
| 🔴 | OVERDUE | 1–14 days past |
| 🔴 pulsing | CRITICAL | 14+ days past |

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `/` | Search |
| `N` | New client |
| `C` | Calendar |
| `?` | Shortcuts help |

### Getting Help

1. **BLH Bot** — purple button on any page
2. **AI Intelligence** — on client detail pages
3. **System Administrator** — for infrastructure issues
4. **BLH Compliance Officer** — for HIPAA guidance

---

*CaseSync is built for Beatrice Loving Heart (BLH) by VELOX Automated Operations.*
*Guide version: 2026 | Role: Supervisor*
