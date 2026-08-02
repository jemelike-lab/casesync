import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { Client, Profile } from '@/lib/types'
import ClientDetailV2Wrapper from '@/components/ClientDetailV2Wrapper'
import { notFound } from 'next/navigation'
import { getPlanners } from '@/lib/queries'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

export const dynamic = 'force-dynamic'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Malformed ids would 500 the Azure query (invalid uuid input) — treat as 404.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(id)) notFound()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at, team_manager_id')
    .eq('id', user.id)
    .single()

  // Phase 3 data plane: the client record lives in Azure when configured.
  // Read it under the CALLER's RLS scope; Supabase session client otherwise.
  // The assigned-planner join is reshaped into the `profiles` nested object
  // the wrapper expects (id, full_name, role — PostgREST-join parity).
  let client: Client | null = null
  if (isAzureConfigured()) {
    const rows = await withRlsContext(user.id, (sql) => sql`
      SELECT c.*, p.id AS assigned_profile_id, p.full_name AS assigned_profile_name, p.role AS assigned_profile_role
      FROM clients c
      LEFT JOIN profiles p ON p.id = c.assigned_to
      WHERE c.id = ${id}
      LIMIT 1
    `)
    const row = rows[0] as Record<string, unknown> | undefined
    if (row) {
      const { assigned_profile_id, assigned_profile_name, assigned_profile_role, ...rest } = row
      client = ({
        ...rest,
        profiles: assigned_profile_id
          ? {
              id: assigned_profile_id as string,
              full_name: (assigned_profile_name as string | null) ?? null,
              role: (assigned_profile_role as string | null) ?? null,
            }
          : null,
      } as unknown) as Client
    }
  } else {
    const { data } = await supabase
      .from('clients')
      .select('*, profiles!clients_assigned_to_fkey(id, full_name, role)')
      .eq('id', id)
      .single()
    client = ((data ?? null) as unknown) as Client | null
  }

  if (!client) {
    notFound()
  }

  // Defense-in-depth: explicit application-layer scope check that mirrors
  // the RLS policy on public.clients. Even though RLS already restricts
  // these rows, an explicit check here makes the access rule visible
  // alongside the page logic and guards against future policy regressions.
  const callerRole = profile?.role
  if (callerRole === 'supports_planner') {
    if (client.assigned_to !== user.id) notFound()
  } else if (callerRole === 'team_manager') {
    const { data: teamPlanners } = await supabase
      .from('profiles')
      .select('id')
      .eq('team_manager_id', user.id)
      .eq('role', 'supports_planner')
    const teamPlannerIds = new Set((teamPlanners ?? []).map((p) => p.id))
    // A TM's own caseload is in scope too — otherwise reminder-email deep
    // links to their own clients 404.
    teamPlannerIds.add(user.id)
    if (!client.assigned_to || !teamPlannerIds.has(client.assigned_to)) notFound()
  } else if (callerRole !== 'supervisor' && callerRole !== 'administrator') {
    notFound()
  }

  // Fetch all supports planners for reassignment (team_manager and supervisor only)
  let planners: Profile[] = []
  if (isSupervisorLike(profile?.role) || profile?.role === 'team_manager') {
    planners = await getPlanners(supabase)
  }

  return (
    <ClientDetailV2Wrapper
      client={client as Client}
      currentUserId={user.id}
      currentProfile={profile as Profile}
      planners={planners}
    />
  )
}
