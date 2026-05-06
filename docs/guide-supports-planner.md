# CaseSync Guide — Supports Planner
**Beatrice Loving Heart (BLH)**
*Your complete guide to the CaseSync case management portal*

---

## Table of Contents
1. [Getting Started](#1-getting-started)
2. [Your Dashboard](#2-your-dashboard)
3. [Client Cards & Urgency System](#3-client-cards--urgency-system)
4. [Client Detail Page](#4-client-detail-page)
5. [Bulk Contact Logger](#5-bulk-contact-logger)
6. [Calendar](#6-calendar)
7. [BLH Bot & AI Intelligence](#7-blh-bot--ai-intelligence)
8. [Notes & Activity Log](#8-notes--activity-log)
9. [Documents](#9-documents)
10. [Mobile App (PWA)](#10-mobile-app-pwa)
11. [Quick Reference](#11-quick-reference)

---

## 1. Getting Started

### Logging In

1. Go to **blhcasesync.com** in your browser.
2. Enter your email address and password.
3. Click **Sign In**.

If you forget your password, click **"Forgot password?"** on the login page to receive a reset link via email.

### First-Time Onboarding

When you first log in, a guided tour will walk you through the main features. Complete the onboarding steps — they only take a few minutes and will help you get oriented.

### Your Role

As a Supports Planner, you can:
- View and edit clients assigned to you
- Log contacts (individually or in bulk)
- Track all key dates and deadlines
- Use the AI assistant (BLH Bot) to ask questions about your clients
- Access the calendar to plan your week
- Upload and view client documents

---

## 2. Your Dashboard

The Dashboard is your home base — everything you need starts here.

### Greeting Card

At the top of your dashboard, you'll see a personalized greeting with your name, today's date, and urgency status pills showing how many items are overdue, due soon, or need contact. Click any pill to filter your view.

### Suggested Focus

Below the greeting, a **Suggested Focus** card tells you the smartest thing to do next. It might say "Start with overdue pressure, then work the upcoming queue" with a one-click **Focus overdue** button.

### Premium Stat Cards

Four large stat cards show your key numbers:
- **Active Clients** — total client count
- **Overdue** — clients with at least one overdue deadline (with % of caseload)
- **Due This Week** — clients with deadlines in the next 7 days
- **No Contact 7+ Days** — clients you haven't contacted in over a week

Each card has an **animated progress arc** showing the ratio. Click any card to filter your client list to just those clients.

### Week Strip

The week strip shows 7 days starting from today. Each day cell is color-coded by deadline intensity — red for heavy overdue days, amber for 2+ deadlines, olive for 1. Click any day to filter clients with deadlines on that date.

### Alert Banner

A colored banner highlights: how many items are overdue (red), due this week (orange), and eligibility ending soon (blue). Click any pill to jump to that filter.

### View Mode

Toggle between **Grid** (card layout) and **Ops Table** (dense spreadsheet-style view) using the toggle at the top of your client list.

### Saved Views

Save your current filter, search, and sort combination as a reusable saved view. Use the starter queues — **My Overdue**, **My Due This Week**, **My Active Clients** — or create your own.

### Search, Filter & Sort

- **Search**: Type any part of a client's name, ID, or eligibility code
- **Filter**: Click stat cards or alert pills to filter by urgency
- **Sort**: Change sort order by name, goal %, last contact date, or eligibility end date

---

## 3. Client Cards & Urgency System

### The 5-Tier Urgency System

CaseSync uses a 5-color system for all dates:

| Color | Meaning | Threshold |
|---|---|---|
| 🟢 Green | On track | 7+ days until due |
| 🟡 Yellow | Upcoming | Due within 7 days |
| 🟠 Orange | Due soon | Due within 3 days |
| 🔴 Red | Overdue | 1–14 days overdue |
| 🔴 Critical | Critical | 14+ days overdue (pulsing) |

These colors appear everywhere — client cards, the calendar, the client detail page, and stat cards.

### Client Card Features

Each client card shows:
- **Client name** with a status dot matching their worst urgency
- **Health Score Ring** (top right) — a circular score from 0–100
- **Risk badge** — "HIGH" or "MED" pill inline with the name
- **Meta info** — client ID, category (CO/CFC/CPAS), eligibility code, assigned planner
- **Date pills** — compact colored capsules showing only non-green (urgent) dates
- **Footer** — days since last contact, goal %, and a quick Log Contact button

### Interactive Features

- **Hover** any card to see it lift with an urgency-colored glow shadow
- **Swipe right** (mobile) to quickly log a contact
- **Swipe left** (mobile) to pin/unpin the client
- **Click the name** to open the client detail page
- **📌 Pin** up to 5 favorite clients for quick access at the top

---

## 4. Client Detail Page

Click any client name to open their full profile in a premium 2-column layout.

### Hero Header

The top banner shows:
- Client name (large, bold)
- ID, category, eligibility code, and assigned planner
- **Health Score Ring** (64px) showing their overall goal progress
- Status pills: overdue count, due soon count, last contact info
- **Edit** button to enter edit mode

### Key Deadlines Grid (Left Column)

A 2×5 grid of interactive date tiles covering:
- Eligibility End, 3-Month Visit Due, Quarterly Waiver, Med-Tech Redet
- POS Deadline, Assessment Due, Doc MDH, SPM Next Due
- 30-Day Letter, Last Contact

**Hover any tile** to see a popup card showing:
- The urgency tier label (CRITICAL, OVERDUE, DUE SOON, etc.)
- A large countdown ("12d overdue" or "3d left")
- The date label and formatted date
- An action prompt for overdue items ("⚡ Action needed")

Each tile shows a countdown chip (e.g., "24d overdue") and has urgency-tinted gradient backgrounds.

### Right Sidebar

- **AI Intelligence** — Ask BLH Bot questions about this client, or generate an AI Summary
- **Client Info** — assigned planner, category, goal %, created/updated dates
- **Med Tech** — status and redet date
- **Forms & Signatures** — FOC, provider forms, signatures needed
- **Authorizations** — ATP, SNFs, Lease
- **Reporting & Reviews** — audit review, QA review status
- **Documents** — upload and view client documents

### Collapsible Sections

Less-critical sections (Forms, Authorizations, CO Details, Reporting) are **collapsed by default** to reduce scroll fatigue. Click any section header to expand it.

### Edit Mode

Click **Edit** in the hero header to enable editing on all fields. Change dates, update statuses, adjust goal progress. Click **Save** when done — changes are logged in the Activity Log automatically.

---

## 5. Bulk Contact Logger

When you need to log contact for multiple clients at once:

1. Go to your dashboard
2. Click **Select** in the toolbar
3. Check the clients you want (or use **Select All**)
4. Click **📞 Log N Contacts**
5. In the modal, set the date, contact type, and an optional shared note
6. Click **Log Contacts**

All selected clients will have their last contact date updated instantly with an optimistic UI update.

---

## 6. Calendar

### Accessing the Calendar

Click **Calendar** in the top navigation bar (desktop) or the calendar icon in the bottom nav (mobile).

### Views

Switch between **Month**, **Week**, and **Day** views using the toggle buttons.

### Urgency-Colored Cells

Calendar day cells are color-tinted based on urgency:
- Red-tinted days have overdue deadlines
- Amber-tinted days have items due soon
- Blue highlight for today

### Hover Tooltips

**Hover any day cell** with events to see a popup showing:
- Number of deadlines and clients
- Each client listed with their worst urgency badge
- All deadline types as colored dots
- Client ID and assigned planner

### Planning Your Week

1. Open **Month** view at the start of each month to spot busy periods
2. Switch to **Week** view each Monday to plan your schedule
3. Click any deadline event to jump directly to that client's profile

---

## 7. BLH Bot & AI Intelligence

### BLH Bot (Chat)

Click the **purple button** 🟣 in the bottom-right corner of any page to open BLH Bot.

Ask questions like:
- "What's due this week for my clients?"
- "How do I log a home visit?"
- "What does eligibility code CLS mean?"
- "Which clients haven't I contacted in 7+ days?"

BLH Bot has access to your caseload data and can search for clients, show caseload stats, and answer policy questions.

### AI Intelligence (Client Detail Page)

On any client's detail page, the right sidebar has an **AI Intelligence** card:
- **Ask BLH Bot** — type a question about this specific client and get an instant answer
- **AI Summary** — generate a one-click AI summary of the client's current status, overdue items, and recent activity

---

## 8. Notes & Activity Log

### Notes

On the client detail page, the **Notes** section (left column) lets you add timestamped notes. Notes show:
- Author avatar (color-coded by person)
- Author name and timestamp
- Note content in a chat-bubble style

### Activity Log

The **Activity Log** (collapsed by default) shows a timeline of all changes:
- Who changed what field
- Old value → new value (color-coded red/green)
- Timestamp

---

## 9. Documents

In the client detail page sidebar, the **Documents** section lets you upload and access files. Supported files include PDFs, images, and documents. Files are stored securely in Supabase Storage.

---

## 10. Mobile App (PWA)

### Installing on Your Phone

**iPhone (Safari):**
1. Open blhcasesync.com in Safari
2. Tap **Share** → **"Add to Home Screen"** → **Add**

**Android (Chrome):**
1. Open blhcasesync.com in Chrome
2. Tap **⋮** → **"Install App"** → **Install**

### Mobile Features

- Bottom navigation bar with Dashboard, Workryn, Team, Calendar, and more
- Full swipe gestures on client cards (swipe right = log contact, left = pin)
- All features work on mobile — the layout is fully responsive

---

## 11. Quick Reference

### Keyboard Shortcuts (Desktop)

| Shortcut | Action |
|---|---|
| `/` | Focus search bar |
| `N` | Add new client |
| `C` | Go to Calendar |
| `?` | Show keyboard shortcuts |
| `Esc` | Close modal / cancel |

### Key Dates to Remember

| Date | What's Due |
|---|---|
| 15th of month | Monthly Monitoring (SPM) for all clients |
| Ongoing | Log contact within 24 hours of interaction |
| 30 days before | Service authorization renewal |

### Urgency Colors at a Glance

| Color | Badge | Meaning |
|---|---|---|
| 🟢 | On track | More than 7 days out |
| 🟡 | UPCOMING | Due within 7 days |
| 🟠 | DUE SOON | Due within 3 days |
| 🔴 | OVERDUE | 1–14 days past due |
| 🔴 (pulsing) | CRITICAL | 14+ days past due |

### Getting Help

1. **BLH Bot** — click the purple button on any page
2. **AI Intelligence** — on any client detail page
3. **Your Team Manager** — via Chat or in person
4. **Supervisor** — for escalated issues

---

*CaseSync is built for Beatrice Loving Heart (BLH) by VELOX Automated Operations.*
*Guide version: 2026 | Role: Supports Planner*
