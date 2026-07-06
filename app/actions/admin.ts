'use server'

import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { sendEmail } from '@/lib/email'
import { brandedInviteEmail, inviteReminderEmail } from '@/lib/email-templates'
import { buildAcceptInviteUrl, generateInviteToken, getInviteExpiryIso } from '@/lib/invites'
import { getGuideAttachmentForRole } from '@/lib/guides/attachments'
import { isSupervisorLike } from '@/lib/roles'

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

/**
 * Resolve the calling user and require that they may manage users
 * (supervisor / it / administrator). Returns { id, role } when authorized,
 * else null. Server actions are directly invocable, so this server-side gate
 * is required — UI gating (hidden buttons) is not a security boundary.
 */
async function getElevatedCaller(): Promise<{ id: string; role: string } | null> {
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
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !isSupervisorLike(profile.role)) return null
  return { id: user.id, role: profile.role as string }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Optimistic UI rows carry a client-generated `temp-<ts>` id until refresh.
// If the id isn't a real uuid, resolve the pending invite by email instead of
// letting Postgres reject the cast ("invalid input syntax for type uuid").
async function resolvePendingInviteId(supabase: any, inviteId: string, email?: string): Promise<string | null> {
  if (UUID_RE.test(inviteId)) return inviteId
  const normalizedEmail = email?.trim().toLowerCase()
  if (!normalizedEmail) return null
  const { data } = await supabase
    .from('user_invites')
    .select('id')
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .maybeSingle()
  return data?.id ?? null
}

export async function inviteUser(email: string, role: string, fullName: string) {
  const caller = await getElevatedCaller()
  if (!caller) return { error: 'Not authorized' }
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
    ? supabase.from('user_invites').update(inviteRecord).eq('id', existingPendingInvite.id).select('id').single()
    : supabase.from('user_invites').insert(inviteRecord).select('id').single()

  const { data: trackedInvite, error: trackingError } = await trackingQuery

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
    // Attach the role-specific onboarding guide. Never let a guide problem
    // block the invite itself — resolution returns null on any failure.
    const guide = getGuideAttachmentForRole(role)
    console.log('[inviteUser] guide attachment:', guide ? `${guide.filename} (${guide.content.length} b64 chars)` : `none (role=${role})`)
    await sendEmail({
      to: normalizedEmail,
      subject,
      html,
      attachments: guide ? [guide] : undefined,
    })
  } catch (emailErr) {
    console.error('[inviteUser] branded email error:', emailErr)
    return { error: emailErr instanceof Error ? emailErr.message : 'Failed to send invite email' }
  }

  revalidatePath('/admin')
  return { success: true, inviteId: trackedInvite?.id ?? null }
}

export async function resendInviteReminder(inviteId: string, email?: string) {
  const caller = await getElevatedCaller()
  if (!caller) return { error: 'Not authorized' }
  const supabase = createAdminClient()

  const resolvedInviteId = await resolvePendingInviteId(supabase, inviteId, email)
  if (!resolvedInviteId) return { error: 'Invite not found \u2014 refresh the page and try again.' }

  const { data: invite, error } = await supabase
    .from('user_invites_with_state')
    .select('*')
    .eq('id', resolvedInviteId)
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
    const guide = getGuideAttachmentForRole(invite.role)
    await sendEmail({
      to: invite.email,
      subject,
      html,
      attachments: guide ? [guide] : undefined,
    })
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
    .eq('id', resolvedInviteId)

  if (updateError) return { error: updateError.message }

  revalidatePath('/admin')
  return { success: true }
}

export async function removePendingInvite(inviteId: string, email?: string) {
  const caller = await getElevatedCaller()
  if (!caller) return { error: 'Not authorized' }
  const supabase = createAdminClient()

  const resolvedInviteId = await resolvePendingInviteId(supabase, inviteId, email)
  if (!resolvedInviteId) return { error: 'Invite not found \u2014 refresh the page and try again.' }

  const { data: invite, error } = await supabase
    .from('user_invites')
    .select('id,email,invited_user_id,accepted_at')
    .eq('id', resolvedInviteId)
    .single()

  if (error || !invite) return { error: error?.message ?? 'Invite not found' }
  if (invite.accepted_at) return { error: 'Cannot remove an accepted invite.' }

  const userId = invite.invited_user_id

  const { error: inviteDeleteError } = await supabase
    .from('user_invites')
    .delete()
    .eq('id', resolvedInviteId)

  if (inviteDeleteError) return { error: inviteDeleteError.message }

  if (userId) {
    // Revoke all active sessions before deleting
    try { await supabase.rpc('revoke_user_sessions', { target_user_id: userId }) } catch (_e) { /* non-fatal */ }

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
  const caller = await getElevatedCaller()
  if (!caller) return { error: 'Not authorized' }
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
  const caller = await getElevatedCaller()
  if (!caller) return { error: 'Not authorized' }
  const supabase = createAdminClient()
  const { error } = await supabase.from('profiles').update({ team_manager_id: teamManagerId }).eq('id', userId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function deactivateUser(userId: string) {
  const caller = await getElevatedCaller()
  if (!caller) return { error: 'Not authorized' }
  const supabase = createAdminClient()

  // Ban the user permanently — this prevents any new sign-ins and
  // blocks refresh-token exchanges. Existing JWTs stay valid until
  // their exp claim, but the 60-second SessionGuard freshness check
  // will catch the disabled metadata and sign them out.
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { disabled: true },
    ban_duration: '876000h', // ~100 years = effectively permanent
  })
  if (error) return { error: error.message }

  // Revoke all refresh tokens so existing sessions can't be extended
  const { error: revokeError } = await supabase.rpc('revoke_user_sessions', { target_user_id: userId })
  if (revokeError) {
    // Non-fatal: the ban + SessionGuard will still catch them
    console.error('[deactivateUser] session revocation error:', revokeError)
  }

  return { success: true }
}

export async function removeUser(userId: string) {
  const caller = await getElevatedCaller()
  if (!caller) return { error: 'Not authorized' }
  const supabase = createAdminClient()

  const historyChecks = await Promise.all([
    supabase.from('activity_log').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('client_notes').select('id', { count: 'exact', head: true }).eq('author_id', userId),
  ])

  let historyCount = historyChecks.reduce((sum, result) => sum + (result.count ?? 0), 0)
  // Phase 3 data plane: activity_log + client_notes live in Azure when
  // configured — count there too (legacy Supabase rows still counted above).
  // Fail closed: if the Azure count cannot run, block the removal.
  if (isAzureConfigured()) {
    try {
      historyCount += await withRlsContext(caller.id, async (sql) => {
        const a = await sql`SELECT count(*)::int AS n FROM activity_log WHERE user_id = ${userId}`
        const n = await sql`SELECT count(*)::int AS n FROM client_notes WHERE author_id = ${userId}`
        return Number((a[0] as { n: number }).n) + Number((n[0] as { n: number }).n)
      })
    } catch {
      return { error: 'Could not verify user history. Try again.' }
    }
  }
  if (historyCount > 0) {
    return { error: 'Cannot remove a user with activity history. Deactivate them instead.' }
  }

  // Revoke all active sessions before deleting
  try { await supabase.rpc('revoke_user_sessions', { target_user_id: userId }) } catch (_err) {
    console.error('[removeUser] session revocation error:', _err)
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
