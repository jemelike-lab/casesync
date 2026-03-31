# CaseSync - Case Management Portal

A production-ready case management portal built with Next.js 14, Supabase, and Tailwind CSS.

## Setup

### 1. Database Migration

Run the SQL migration in your [Supabase SQL Editor](https://supabase.com/dashboard/project/iiqttbpaufzlinbufsdx/sql/new):

```
See: supabase/migrations/001_initial_schema.sql
```

Copy and paste the contents of that file into the SQL editor and click **Run**.

### 2. Environment Variables

Create `.env.local` (copy from `.env.example`):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://iiqttbpaufzlinbufsdx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_Dlv1IjCM62wdF65t4HVHFg_UaOhzsoW
SUPABASE_SECRET_KEY=sb_secret_YOUR_KEY_HERE
```

### 3. Run Locally

```bash
npm install
npm run dev
```

### 4. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/jemelike-lab/casesync)

## Features

- 🔐 **Auth** — Email/password via Supabase Auth
- 📋 **Dashboard** — Client grid with status color coding
- 🔍 **Search** — By client ID, name, eligibility code
- 🔽 **Filters** — Overdue, due this week, no contact 7+, eligibility ending, by category
- 📌 **Pin clients** — localStorage-persisted, max 5
- ⏱️ **Idle timeout** — Auto-logout after 15 minutes
- 🌙 **Dark theme** — Custom dark UI

## Color Coding

| Color | Meaning |
|-------|---------|
| 🟢 Green | On track / completed |
| 🟡 Yellow | Due within 30 days |
| 🟠 Orange | Due within 7 days |
| 🔴 Red | Overdue |

## Roles

- **Case Manager** — Sees only assigned clients
- **Supervisor** — Sees all clients + overview analytics tab

## Stack

- Next.js 14 (App Router)
- @supabase/ssr (server-side auth)
- Tailwind CSS v4
- TypeScript

<!-- Email notifications: Resend integration deployed -->

Live at https://blhcasesync.com

<!-- deploy trigger -->
<!-- sentry configured -->
<!-- enable ai summary -->
