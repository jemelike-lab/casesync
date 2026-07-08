/**
 * Animation manifest — single source of truth for every Lottie surface.
 *
 * Files are licensed LottieFiles Premium assets, downloaded through the BLH
 * account and self-hosted at /public/animations/*.lottie (dotLottie format).
 * No runtime requests ever leave the app's own origin for these.
 *
 * Slot IDs match the Verification Mock ledger (2026-07-07) so design review,
 * code, and QA all speak the same language. Swapping an animation is a
 * one-line change here — components reference slots, never file paths.
 */

export const ANIM = {
  // ── State moments ────────────────────────────────────────────────
  loader: '/animations/01a-loader.lottie',
  loaderSync: '/animations/01b-sync.lottie',
  loaderAlt: '/animations/01c-loading.lottie',
  success: '/animations/10-success.lottie',
  loginHero: '/animations/11-login-hero.lottie',
  caseyBot: '/animations/12-casey-bot.lottie',
  offline: '/animations/13-offline.lottie',
  notFound: '/animations/14-404.lottie',

  // ── Empty states (Empty States "Not Found" family) ───────────────
  emptyTasks: '/animations/02-empty-tasks.lottie',
  emptyTickets: '/animations/03-empty-tickets.lottie',
  emptyCalendar: '/animations/04-empty-calendar.lottie',
  emptyNotifications: '/animations/05-empty-notifications.lottie',
  emptyFiles: '/animations/06-empty-files.lottie',
  emptyMessages: '/animations/07-empty-messages.lottie',
  emptySearch: '/animations/08-empty-search.lottie',
  emptyCaseload: '/animations/09-empty-caseload.lottie',

  // ── CaseSync page heroes ─────────────────────────────────────────
  heroDashboard: '/animations/16-dash-hero.lottie',
  heroTeam: '/animations/17-team.lottie',
  heroSupervisor: '/animations/18-supervisor.lottie',
  heroCalendar: '/animations/19-calendar.lottie',
  heroAdmin: '/animations/20-admin.lottie',
  heroAudit: '/animations/21-audit.lottie',
  heroClients: '/animations/22-clients-index.lottie',
  heroImport: '/animations/23-import.lottie',
  heroHelp: '/animations/24-help.lottie',
  heroSettings: '/animations/25-settings.lottie',

  // ── Workryn page heroes ──────────────────────────────────────────
  heroWorkryn: '/animations/26-workryn-hero.lottie',
  heroTasks: '/animations/27-tasks-hero.lottie',
  heroTickets: '/animations/28-tickets-hero.lottie',
  heroSchedule: '/animations/04-empty-calendar.lottie', // shared with slot 4
  heroPto: '/animations/30-pto.lottie',
  heroTraining: '/animations/31-training.lottie',
  heroTimeClock: '/animations/32-timeclock.lottie',
  heroBenefits: '/animations/33-benefits.lottie',
  heroEvaluations: '/animations/34-evaluations.lottie',
  heroDepartments: '/animations/35-departments.lottie',
  heroProfile: '/animations/36-profile.lottie',

  // ── Dashboard stat-card icons ────────────────────────────────────
  statOverdue: '/animations/s1-overdue.lottie',
  statDueWeek: '/animations/s2-dueweek.lottie',
  statNoContact: '/animations/s3-nocontact.lottie',
  statActive: '/animations/s4-active.lottie',
} as const

export type AnimKey = keyof typeof ANIM
