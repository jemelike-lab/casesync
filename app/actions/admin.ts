'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Admin Supabase client uses service role key for auth.admin APIs
function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  )
}

export async function inviteUser(email: string, role: string, fullName: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { role, full_name: fullName }
  })
  if (error) return { error: error.message }
  return { data }
}

export async function updateUserRole(userId: string, role: string) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
      }
    }
  )
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function updateTeamManagerAssignment(userId: string, teamManagerId: string | null) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
      }
    }
  )
  const { error } = await supabase.from('profiles').update({ team_manager_id: teamManagerId }).eq('id', userId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function deactivateUser(userId: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { disabled: true }
  })
  if (error) return { error: error.message }
  return { success: true }
}
