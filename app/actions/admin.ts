'use server'

import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { sendEmail } from '@/lib/email'
import { brandedInviteEmail, inviteReminderEmail } from '@/lib/email-templates'
import { buildAcceptInviteUrl, generateInviteToken, getInviteExpiryIso } from '@/lib/invites'

// Admin Supabase client uses service role key for deterministic server-side writes
function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

async function getCurrentUserId() {
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

  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function inviteUser(email: string, role: string, fullName: string) {
  const supabase = createAdminClient()
  const normalizedEmail = email.trim().toLowerCase()
  const currentUserId = await getCurrentUserId()
  const expiresAt = getInviteExpiryIso()
  const inviteToken = generateInviteToken()
  const inviteLink = buildAcceptInviteUrl(inviteToken)

  const { data: existingPendingInvite } = await supabase
    .from('user_invites')
    .select('id, invited_user_id, accepted_user_id')
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .maybeSingle()

  const existingUserLookup = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existingAuthUser = existingUserLookup.data.users.find(user => user.email?.toLowerCase() === normalizedEmail) ?? null

  if (existingAuthUser?.user_metadata?.disabled) {
    const { error: reactivateError } = await supabase.auth.admin.updateUserById(existingAuthUser.id, {
      user_metadata: {
        ...existingAuthUser.user_metadata,
        disabled: false,
        role,
        full_name: fullName,
      },
      app_metadata: existingAuthUser.app_metadata,
    })

    if (reactivateError) {
      return { error: reactivateError.message }
    }

    await supabase.from('profiles').upsert({
      id: existingAuthUser.id,
      full_name: fullName,
      role,
      team_manager_id: null,
    })
  }

  const inviteRecord = {
    email: normalizedEmail,
    full_name: fullName,
    role,
    invited_user_id: existingAuthUser?.id ?? existingPendingInvite?.invited_user_id ?? null,
    invited_by: currentUserId,
    invite_sent_at: new Date().toISOString(),
    accepted_at: null,
    reminder_sent_at: null,
    reminder_count: 0,
    expires_at: expiresAt,
    invite_token: inviteToken,
    invite_token_expires_at: expiresAt,
    accepted_user_id: null,
    accepted_via: null,
    status: 'pending',
  }

  const trackingQuery = existingPendingInvite?.id
    ? supabase.from('user_invites').update(inviteRecord).eq('id', existingPendingInvite.id)
    : supabase.from('user_invites').insert(inviteRecord)

  const { error: trackingError } = await trackingQuery

  if (trackingError) {
    console.error('[inviteUser] tracking error:', trackingError)
    return { error: trackingError.message }
  }

  try {
    const { subject, html } = brandedInviteEmail({
      fullName,
      role,
      inviteUrl: inviteLink,
    })
    await sendEmail({ to: normalizedEmail, subject, html })
  } catch (emailErr) {
    console.error('[inviteUser] branded email error:', emailErr)
    return { error: emailErr instanceof Error ? emailErr.message : 'Failed to send invite email' }
  }

  revalidatePath('/admin')
  return { success: true }
}

export async function resendInviteReminder(inviteId: string) {
  const supabase = createAdminClient()

  const { data: invite, error } = await supabase
    .from('user_invites_with_state')
    .select('*')
    .eq('id', inviteId)
    .single()

  if (error || !invite) return { error: error?.message ?? 'Invite not found' }

  if (invite.computed_status !== 'pending') {
    return { error: `Invite is ${invite.computed_status}. No reminder sent.` }
  }

  const inviteToken = generateInviteToken()
  const inviteLink = buildAcceptInviteUrl(inviteToken)
  const expiresAt = getInviteExpiryIso()

  try {
    const { subject, html } = inviteReminderEmail({
      fullName: invite.full_name ?? invite.email,
      role: invite.role,
      inviteUrl: inviteLink,
    })
    await sendEmail({ to: invite.email, subject, html })
  } catch (emailErr: any) {
    console.error('[resendInviteReminder] email error:', emailErr)
    return { error: emailErr?.message ?? 'Failed to send reminder' }
  }

  const { error: updateError } = await supabase
    .from('user_invites')
    .update({
      reminder_sent_at: new Date().toISOString(),
      reminder_count: (invite.reminder_count ?? 0) + 1,
      expires_at: expiresAt,
      invite_token: inviteToken,
      invite_token_expires_at: expiresAt,
      status: 'pending',
    })
    .eq('id', inviteId)

  if (updateError) return { error: updateError.message }

  revalidatePath('/admin')
  return { success: true }
}

export async function removePendingInvite(inviteId: string) {
  const supabase = createAdminClient()

  const { data: invite, error } = await supabase
    .from('user_invites')
    .select('id,email,invited_user_id,accepted_at')
    .eq('id', inviteId)
    .single()

  if (error || !invite) return { error: error?.message ?? 'Invite not found' }
  if (invite.accepted_at) return { error: 'Cannot remove an accepted invite.' }

  const userId = invite.invited_user_id

  const { error: inviteDeleteError } = await supabase
    .from('user_invites')
    .delete()
    .eq('id', inviteId)

  if (inviteDeleteError) return { error: inviteDeleteError.message }

  if (userId) {
    const { error: profileDeleteError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileDeleteError) return { error: profileDeleteError.message }

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId)
    if (authDeleteError) return { error: authDeleteError.message }
  }

  revalidatePath('/admin')
  return { success: true }
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

export async function removeUser(userId: string) {
  const supabase = createAdminClient()

  const historyChecks = await Promise.all([
    supabase.from('activity_log').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('client_notes').select('id', { count: 'exact', head: true }).eq('author_id', userId),
  ])

  const historyCount = historyChecks.reduce((sum, result) => sum + (result.count ?? 0), 0)
  if (historyCount > 0) {
    return { error: 'Cannot remove a user with activity history. Deactivate them instead.' }
  }

  const { error: inviteError } = await supabase
    .from('user_invites')
    .delete()
    .eq('invited_user_id', userId)

  if (inviteError) return { error: inviteError.message }

  const { error: profileError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId)

  if (profileError) return { error: profileError.message }

  const { error: authError } = await supabase.auth.admin.deleteUser(userId)
  if (authError) return { error: authError.message }

  revalidatePath('/admin')
  return { success: true }
}
