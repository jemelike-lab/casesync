import { redirect } from 'next/navigation';
import { getCurrentUserAndProfile } from '@/lib/queries';
import SupervisorDashboardV2Client from '@/components/casesync-v2/SupervisorDashboardV2Client';
import {
  teams,
  orgKpis,
  trendData,
  attentionItems,
  viewerProfile,
} from '@/lib/casesync-v2/mock-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// CaseSync v2 — Supervisor dashboard north-star page.
//
// Role gate mirrors app/supervisor/page.tsx: only `supervisor` and `it` roles
// can reach this. team_managers and support_planners get redirected to the
// existing /dashboard. This is intentional — Gabriela's program-supervisor
// view is the first thing we're locking; team-manager and SP variants come
// in later passes once the visual language is approved.
//
// Data is still mocked at this stage (see lib/casesync-v2/mock-data.ts).
// Real Supabase queries land in a follow-up commit once the layout is locked.

export default async function DashboardV2Page() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect('/login');
  if (!(profile?.role === 'supervisor' || profile?.role === 'administrator')) {
    redirect('/dashboard');
  }

  return (
    <SupervisorDashboardV2Client
      viewer={viewerProfile}
      orgKpis={orgKpis}
      teams={teams}
      trendData={trendData}
      attentionItems={attentionItems}
    />
  );
}
