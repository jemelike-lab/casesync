// CaseSync v2 — Mock data for the Supervisor dashboard (Gabriela's view).
//
// This is intentionally hand-authored, NOT pulled from Supabase. The point of
// the north-star page is to lock the visual language against a realistic but
// fixed dataset before wiring real queries. Real data integration is a later
// pass (replace these exports with server-side fetches in dashboard-v2/page.tsx).
//
// Scope: CFC program only. DDA program (Indigo Gladiators etc.) excluded until
// the program toggle ships in a later pass.

export type TeamLeadRole = 'supervisor' | 'team_manager';

export interface TeamSummary {
  id: string;
  teamName: string;
  leadName: string;
  leadRole: TeamLeadRole;
  leadInitials: string;
  accentColor: string; // hex; used for the team color dot / left-bar
  spCount: number; // number of Support Planners on this team
  clientCount: number;
  overdueCount: number;
  dueThisWeekCount: number;
  noContact7Count: number;
  completionRatePct: number; // 0-100, audits/plans completed on time over last 30d
  weekOverWeekDelta: number; // % change in overdue count vs last week (negative = improving)
}

export interface AttentionItem {
  id: string;
  clientName: string;
  clientId: string;
  assignedSp: string;
  team: string;
  issue:
    | 'audit_overdue'
    | 'plan_overdue'
    | 'no_contact_14'
    | 'no_contact_30'
    | 'audit_due_tomorrow'
    | 'plan_due_tomorrow';
  daysOverdue: number; // negative = days until due
  severity: 'critical' | 'warning' | 'info';
}

export interface TrendPoint {
  weekLabel: string; // e.g. "Mar 17"
  overdue: number;
  onTrack: number;
  completed: number;
}

export interface OrgKpis {
  activeClients: number;
  activeClientsDeltaPct: number; // vs last week
  overdueDeadlines: number;
  overdueDeadlinesDeltaPct: number;
  dueThisWeek: number;
  dueThisWeekDeltaPct: number;
  noContact7: number;
  noContact7DeltaPct: number;
}

// ============================================================================
// Teams — 4 Supervisors + 2 Team Managers reporting to Gabriela (Program Sup).
// Team names for the Supervisors are placeholders until the real org chart
// lands; only Blue Giants and Gold Giants are confirmed from memory.
// ============================================================================

export const teams: TeamSummary[] = [
  {
    id: 'tm-tahteona',
    teamName: "TahTeona's Team",
    leadName: 'TahTeona',
    leadRole: 'supervisor',
    leadInitials: 'TT',
    accentColor: '#1E7CFF', // cobalt
    spCount: 7,
    clientCount: 842,
    overdueCount: 19,
    dueThisWeekCount: 73,
    noContact7Count: 14,
    completionRatePct: 94,
    weekOverWeekDelta: -8, // improving
  },
  {
    id: 'tm-sarah',
    teamName: "Sarah's Team",
    leadName: 'Sarah Abbott',
    leadRole: 'supervisor',
    leadInitials: 'SA',
    accentColor: '#10B981', // emerald
    spCount: 6,
    clientCount: 731,
    overdueCount: 12,
    dueThisWeekCount: 61,
    noContact7Count: 9,
    completionRatePct: 97,
    weekOverWeekDelta: -3,
  },
  {
    id: 'tm-mercedes',
    teamName: "Mercedes' Team",
    leadName: 'Mercedes Jones',
    leadRole: 'supervisor',
    leadInitials: 'MJ',
    accentColor: '#FFA940', // amber
    spCount: 8,
    clientCount: 967,
    overdueCount: 28,
    dueThisWeekCount: 88,
    noContact7Count: 17,
    completionRatePct: 91,
    weekOverWeekDelta: 6, // worsening
  },
  {
    id: 'tm-kelly',
    teamName: "Kelly's Team",
    leadName: 'Kelly Sanchez',
    leadRole: 'supervisor',
    leadInitials: 'KS',
    accentColor: '#B968FF', // soft purple (not in primary palette but useful for differentiation)
    spCount: 7,
    clientCount: 824,
    overdueCount: 22,
    dueThisWeekCount: 78,
    noContact7Count: 13,
    completionRatePct: 93,
    weekOverWeekDelta: -2,
  },
  {
    id: 'tm-blue-giants',
    teamName: 'Blue Giants',
    leadName: 'Rosabel Corion-Brown',
    leadRole: 'team_manager',
    leadInitials: 'RC',
    accentColor: '#3D8FFF', // lighter cobalt to differentiate from TahTeona
    spCount: 6,
    clientCount: 718,
    overdueCount: 24,
    dueThisWeekCount: 67,
    noContact7Count: 16,
    completionRatePct: 89,
    weekOverWeekDelta: 11,
  },
  {
    id: 'tm-gold-giants',
    teamName: 'Gold Giants',
    leadName: 'Mariama Jalloh',
    leadRole: 'team_manager',
    leadInitials: 'MJ',
    accentColor: '#F59E0B', // deeper amber to differentiate from Mercedes
    spCount: 6,
    clientCount: 765,
    overdueCount: 22,
    dueThisWeekCount: 65,
    noContact7Count: 20,
    completionRatePct: 90,
    weekOverWeekDelta: 4,
  },
];

// ============================================================================
// Org-wide KPIs — aggregated from teams above.
// (Hand-rolled rather than reduce()'d so the numbers are stable across renders
// and a reviewer can sanity-check them visually.)
// ============================================================================

export const orgKpis: OrgKpis = {
  activeClients: 4847,
  activeClientsDeltaPct: 1.2,
  overdueDeadlines: 127,
  overdueDeadlinesDeltaPct: 4.8, // worsening — bad
  dueThisWeek: 432,
  dueThisWeekDeltaPct: -2.1, // declining — good
  noContact7: 89,
  noContact7DeltaPct: 6.5,
};

// ============================================================================
// 12-week caseload trend (most recent week last).
// "onTrack" = deadlines completed on or before due date, "overdue" = missed.
// ============================================================================

export const trendData: TrendPoint[] = [
  { weekLabel: 'Mar 17', overdue: 152, onTrack: 391, completed: 543 },
  { weekLabel: 'Mar 24', overdue: 148, onTrack: 410, completed: 558 },
  { weekLabel: 'Mar 31', overdue: 161, onTrack: 402, completed: 563 },
  { weekLabel: 'Apr 7',  overdue: 139, onTrack: 421, completed: 560 },
  { weekLabel: 'Apr 14', overdue: 144, onTrack: 438, completed: 582 },
  { weekLabel: 'Apr 21', overdue: 133, onTrack: 447, completed: 580 },
  { weekLabel: 'Apr 28', overdue: 128, onTrack: 459, completed: 587 },
  { weekLabel: 'May 5',  overdue: 141, onTrack: 451, completed: 592 },
  { weekLabel: 'May 12', overdue: 125, onTrack: 478, completed: 603 },
  { weekLabel: 'May 19', overdue: 118, onTrack: 484, completed: 602 },
  { weekLabel: 'May 26', overdue: 121, onTrack: 491, completed: 612 },
  { weekLabel: 'Jun 2',  overdue: 127, onTrack: 503, completed: 630 },
];

// ============================================================================
// Attention feed — the "needs your eyes today" panel. Ordered by severity then
// daysOverdue desc. Mix of teams + issue types so the panel looks varied.
// ============================================================================

export const attentionItems: AttentionItem[] = [
  {
    id: 'a-001',
    clientName: 'Devonte Williams',
    clientId: 'cli-8421',
    assignedSp: 'Imani Carter',
    team: 'Blue Giants',
    issue: 'audit_overdue',
    daysOverdue: 11,
    severity: 'critical',
  },
  {
    id: 'a-002',
    clientName: 'Latoya Bennett',
    clientId: 'cli-3917',
    assignedSp: 'Marcus Ofori',
    team: "Mercedes' Team",
    issue: 'plan_overdue',
    daysOverdue: 8,
    severity: 'critical',
  },
  {
    id: 'a-003',
    clientName: 'Anthony Reyes',
    clientId: 'cli-6204',
    assignedSp: 'Priya Shah',
    team: 'Gold Giants',
    issue: 'no_contact_30',
    daysOverdue: 32,
    severity: 'critical',
  },
  {
    id: 'a-004',
    clientName: 'Yolanda Foster',
    clientId: 'cli-1842',
    assignedSp: 'Daniel Park',
    team: "TahTeona's Team",
    issue: 'audit_overdue',
    daysOverdue: 5,
    severity: 'warning',
  },
  {
    id: 'a-005',
    clientName: 'Reginald Hayes',
    clientId: 'cli-7733',
    assignedSp: 'Asha Patel',
    team: "Kelly's Team",
    issue: 'no_contact_14',
    daysOverdue: 17,
    severity: 'warning',
  },
  {
    id: 'a-006',
    clientName: 'Tiana Brooks',
    clientId: 'cli-2256',
    assignedSp: 'Joseph Mensah',
    team: 'Blue Giants',
    issue: 'plan_overdue',
    daysOverdue: 3,
    severity: 'warning',
  },
  {
    id: 'a-007',
    clientName: 'Marcus Coleman',
    clientId: 'cli-9018',
    assignedSp: 'Nina Vasquez',
    team: "Sarah's Team",
    issue: 'audit_due_tomorrow',
    daysOverdue: -1,
    severity: 'info',
  },
  {
    id: 'a-008',
    clientName: 'Jasmine Wright',
    clientId: 'cli-4561',
    assignedSp: 'Kevin Liu',
    team: 'Gold Giants',
    issue: 'plan_due_tomorrow',
    daysOverdue: -1,
    severity: 'info',
  },
];

export const issueLabels: Record<AttentionItem['issue'], string> = {
  audit_overdue: 'Audit overdue',
  plan_overdue: 'Plan overdue',
  no_contact_14: 'No contact 14+ days',
  no_contact_30: 'No contact 30+ days',
  audit_due_tomorrow: 'Audit due tomorrow',
  plan_due_tomorrow: 'Plan due tomorrow',
};

// ============================================================================
// Team Tools — stacked action cards in the right sidebar of the supervisor
// dashboard. Mirrors the cards from the existing /supervisor page exactly
// (same titles, descriptions, emoji icons). hrefs left as placeholders; the
// existing routes can be wired in once layout is locked.
// ============================================================================

export interface TeamToolCard {
  id: string;
  icon: string; // emoji to match the existing site's visual language
  title: string;
  description: string;
  href?: string; // intentionally optional during the iteration phase
}

export const teamTools: TeamToolCard[] = [
  {
    id: 'client-transfer',
    icon: '🔀',
    title: 'Client Transfer Board',
    description: 'Drag clients between Support Planners and rebalance caseloads quickly.',
  },
  {
    id: 'team-manager-board',
    icon: '🧭',
    title: 'Team Manager Board',
    description: 'Drag Support Planners between Team Managers and update reporting assignments.',
  },
  {
    id: 'team-view',
    icon: '👥',
    title: 'Team View',
    description: 'Review Support Planner performance, current assignments, and team coverage in one place.',
  },
  {
    id: 'batch-import',
    icon: '⬆',
    title: 'Batch Import',
    description: 'Upload client batches and review recent import runs from one place.',
  },
  {
    id: 'rebalance-history',
    icon: '📈',
    title: 'Rebalance History',
    description: 'Review recent rebalance moves, outcomes, and planner impact without going into the audit log.',
  },
  {
    id: 'queue-command-center',
    icon: '🧭',
    title: 'Queue Command Center',
    description: 'Open overdue, today, week, next-14-day, and quiet-case queues from one manager-focused ops surface.',
  },
];

// ============================================================================
// Top nav links — the app-wide row of page tabs that sits above the cobalt
// topbar. Mirrors the existing site's nav order and labels.
// ============================================================================

export interface NavLink {
  label: string;
  href: string;
}

export const navLinks: NavLink[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Team', href: '/team' },
  { label: 'Supervisor', href: '/supervisor' },
  { label: 'Calendar', href: '/calendar' },
  { label: 'Admin', href: '/admin' },
  { label: 'Audit Log', href: '/admin/audit-log' }, // best-guess path; iterate once verified
  { label: 'Settings', href: '/settings' },
];

// ============================================================================
// Viewer profile — who's looking at the dashboard. Used for the topbar greeting
// and avatar. For mock, this is Gabriela.
// ============================================================================

export const viewerProfile = {
  fullName: 'Gabriela Jannuzzio',
  initials: 'GJ',
  role: 'Program Supervisor',
};
