import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { Profile, UserInvite } from '@/lib/types'
import { redirect } from 'next/navigation'
import AdminClient from '@/components/AdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createClient()
  const adminSupabase = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!(profile?.role === 'supervisor' || profile?.role === 'it')) redirect('/dashboard')

  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at, team_manager_id')
    .order('full_name')

  const { data: invites } = await supabase
    .from('user_invites_with_state')
    .select('*')
    .order('invite_sent_at', { ascending: false })

  const joinedAtByUserId = new Map<string, string>(
    (invites ?? [])
      .filter((invite) => Boolean(invite.accepted_at && (invite.accepted_user_id ?? invite.invited_user_id)))
      .map((invite) => [String(invite.accepted_user_id ?? invite.invited_user_id), String(invite.accepted_at)])
  )

  const authUserLookup = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const disabledIds = new Set<string>(
    (authUserLookup.data?.users ?? [])
      .filter((authUser) => Boolean(authUser.user_metadata?.disabled))
      .map((authUser) => authUser.id)
  )

  const normalizedUsers = (users ?? [])
    .filter((u) => !disabledIds.has(u.id))
    .map((u) => ({
      ...u,
      joined_at: joinedAtByUserId.get(u.id) ?? null,
    }))

  const teamManagers = normalizedUsers.filter((u) => u.role === 'team_manager') as Profile[]

  return (
    <AdminClient
      users={(normalizedUsers as Profile[]) ?? []}
      teamManagers={teamManagers}
      invites={(invites as UserInvite[]) ?? []}
      currentUserId={user.id}
    />
  )
}
