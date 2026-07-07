'use server'
import { db } from '@/lib/workryn/db'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { getInviteExpiryIso } from '@/lib/invites'
import { upsertAzureIdentity } from '@/lib/db/identity-sync'

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

async function createBrowserSessionClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
}

export async function getInviteByToken(token: string) {
  if (!token) return { error: 'Missing invite token.' }

  const supabase = createAdminClient()
  const { data: invite, error } = await supabase
    .from('user_invites')
    .select('*')
    .eq('invite_token', token)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!invite) return { error: 'This invite link is invalid.' }
  if (invite.accepted_at) return { error: 'This invite has already been used.' }

  const expiresAt = invite.invite_token_expires_at || invite.expires_at
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return { error: 'This invite link has expired.' }
  }

  return { invite }
}


function mapCsRoleToWorkryn(csRole?: string | null): string {
  switch (csRole?.toLowerCase()) {
    case 'supervisor':       return 'SUPERVISOR'
    case 'it':
    case 'admin':            return 'ADMIN'
    case 'team_manager':     return 'TEAM_MANAGER'
    case 'admin_assistant':  return 'ADMIN_ASSISTANT'
    case 'support_planner':
    case 'supports_planner': return 'SUPPORT_PLANNER'
    default:                 return 'SUPPORT_PLANNER'
  }
}

export async function acceptInvite(_prevState: any, formData: FormData) {
  const token = String(formData.get('token') || '').trim()
  const password = String(formData.get('password') || '')
  const confirmPassword = String(formData.get('confirmPassword') || '')

  if (!token) return { error: 'Missing invite token.' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }
  if (password !== confirmPassword) return { error: 'Passwords do not match.' }

  const inviteResult = await getInviteByToken(token)
  if ('error' in inviteResult) return { error: inviteResult.error }

  const invite = inviteResult.invite
  const admin = createAdminClient()

  let userId = invite.accepted_user_id || invite.invited_user_id || null

  if (userId) {
    const { data: existingUserData } = await admin.auth.admin.getUserById(userId)
    const existingUser = existingUserData.user

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(existingUser?.user_metadata ?? {}),
        disabled: false,
        role: invite.role,
        full_name: invite.full_name,
      },
      app_metadata: existingUser?.app_metadata,
    })

    if (updateError) {
      return { error: updateError.message }
    }
  } else {
    const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: {
        role: invite.role,
        full_name: invite.full_name,
      },
    })

    if (createError) {
      return { error: createError.message }
    }

    userId = createdUser.user?.id ?? null
  }

  if (!userId) {
    return { error: 'Could not finish account setup.' }
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      full_name: invite.full_name,
      role: invite.role,
      onboarded: false,
    })
    .eq('id', userId)

  if (profileError) {
    return { error: profileError.message }
  }

  // Azure identity shim: without this row the new user resolves to role NULL
  // on the PHI data plane and sees zero clients (2026-07-06 launch finding).
  const { data: freshProfile } = await admin
    .from('profiles')
    .select('id, full_name, role, team_manager_id')
    .eq('id', userId)
    .single()
  if (!freshProfile) {
    // Audit U3: the profile UPDATE above matches 0 rows silently when the
    // auth trigger ever fails — previously the chain soft-failed all the way
    // to a "successful" acceptance with a user invisible on the data plane.
    // Hard-stop BEFORE the invite is consumed so the token stays retryable.
    return { error: 'Account provisioning is incomplete (profile record missing). Please try again or contact your administrator.' }
  }
  const identitySynced = await upsertAzureIdentity(freshProfile)
  if (!identitySynced) {
    // Audit U1: never silent. Acceptance still completes (the account is
    // real and the morning reconcile self-heals), but supervisors get told
    // immediately instead of discovering a blind user days later.
    try {
      const { data: elevated } = await admin
        .from('profiles')
        .select('id')
        .in('role', ['supervisor', 'administrator'])
      const alertRows = (elevated ?? []).map((profileRow) => ({
        user_id: profileRow.id,
        title: '⚠️ Identity sync failed for a new user',
        body: `${invite.full_name ?? invite.email} accepted their invite but could not be provisioned on the data plane. They will see zero clients until the morning reconcile runs (or run it manually).`,
        link: '/api/admin/identity-status',
        read: false,
      }))
      if (alertRows.length > 0) {
        await admin.from('notifications').insert(alertRows)
      }
    } catch (notifyErr) {
      console.error('[acceptInvite] failed to notify supervisors about identity-sync failure:', notifyErr)
    }
  }

  const { error: inviteUpdateError } = await admin
    .from('user_invites')
    .update({
      invited_user_id: userId,
      accepted_user_id: userId,
      accepted_at: new Date().toISOString(),
      accepted_via: 'custom_accept_invite',
      status: 'accepted',
      invite_token: null,
    })
    .eq('id', invite.id)

  if (inviteUpdateError) {
    return { error: inviteUpdateError.message }
  }

  const sessionClient = await createBrowserSessionClient()
  const { error: signInError } = await sessionClient.auth.signInWithPassword({
    email: invite.email,
    password,
  })

  if (signInError) {
    return { error: signInError.message }
  }


  // Auto-provision Workryn user record so they can access /w/* immediately
  try {
    await db.user.upsert({
      where: { supabaseId: userId },
      create: {
        supabaseId: userId,
        email: invite.email,
        name: invite.full_name ?? invite.email,
        role: mapCsRoleToWorkryn(invite.role),
        avatarColor: '#6366f1',
        isActive: true,
      },
      update: {
        name: invite.full_name ?? invite.email,
        role: mapCsRoleToWorkryn(invite.role),
        isActive: true,
      },
    })
  } catch (err) {
    console.error('[acceptInvite] Workryn user provision failed:', err)
    // Non-fatal — layout will auto-provision on first Workryn visit
  }

  redirect('/onboarding')
}

export async function signOutInviteSession() {
  const supabase = await createBrowserSessionClient()
  await supabase.auth.signOut()
}
