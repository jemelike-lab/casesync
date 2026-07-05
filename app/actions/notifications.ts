'use server'

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { deadlineAlertEmail, clientAssignedEmail } from '@/lib/email-templates'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { daysFromBusinessToday } from '@/lib/business-date'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function sendAssignmentEmail(clientId: string, newAssigneeId: string) {
  try {
    const supabase = getAdminClient()

    // Get assignee profile (check notification prefs)
    const { data: assignee } = await supabase
      .from('profiles')
      .select('id, full_name, email, notification_preferences')
      .eq('id', newAssigneeId)
      .single()

    if (!assignee?.email) return { error: 'No email for assignee' }

    // Check notification preference
    const prefs = (assignee.notification_preferences as any) ?? {}
    if (prefs.client_assigned === false) return { skipped: 'preference disabled' }

    // Get client details. Phase 3 data plane: the client row lives in Azure
    // when configured — read it under the RECIPIENT's RLS scope (the new
    // assignee owns the row by the time this fires post-reassign).
    type AssignClientRow = { id: string; client_id: string; first_name: string | null; last_name: string | null; category: string; assigned_to: string | null; profiles?: { full_name: string | null } | null }
    let client: AssignClientRow | null = null
    if (isAzureConfigured()) {
      const rows = await withRlsContext(newAssigneeId, (sql) => sql`
        SELECT c.id, c.client_id, c.first_name, c.last_name, c.category, c.assigned_to, p.full_name AS assigned_full_name
        FROM clients c
        LEFT JOIN profiles p ON p.id = c.assigned_to
        WHERE c.id = ${clientId}
        LIMIT 1
      `)
      const row = rows[0] as (Record<string, unknown> & { assigned_full_name?: string | null }) | undefined
      if (row) {
        const { assigned_full_name, ...rest } = row
        client = { ...(rest as unknown as AssignClientRow), profiles: { full_name: assigned_full_name ?? null } }
      }
    } else {
      const { data } = await supabase
        .from('clients')
        .select('id, client_id, first_name, last_name, category, assigned_to, profiles!clients_assigned_to_fkey(full_name)')
        .eq('id', clientId)
        .single()
      client = (data as unknown as AssignClientRow) ?? null
    }

    if (!client) return { error: 'Client not found' }

    const clientName = `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`
    const assignedByName = (client.profiles as any)?.full_name ?? 'A supervisor'

    const { subject, html } = clientAssignedEmail({
      clientName,
      clientDisplayId: client.client_id,
      category: client.category,
      assignedBy: assignedByName,
      clientId: client.id,
    })

    const result = await sendEmail({ to: assignee.email, subject, html })
    return { success: true, emailId: (result as any)?.data?.id }
  } catch (err: any) {
    console.error('[sendAssignmentEmail] error:', err)
    return { error: err?.message ?? 'Unknown error' }
  }
}

export async function sendDeadlineEmail(
  clientId: string,
  fieldName: string,
  dueDate: string,
  userId: string
) {
  try {
    const supabase = getAdminClient()

    // Get user profile
    const { data: user } = await supabase
      .from('profiles')
      .select('id, full_name, email, notification_preferences')
      .eq('id', userId)
      .single()

    if (!user?.email) return { error: 'No email for user' }

    const prefs = (user.notification_preferences as any) ?? {}
    if (prefs.deadline_7day === false) return { skipped: 'preference disabled' }

    // Get client details. Phase 3 data plane: read from Azure under the
    // RECIPIENT's RLS scope (the assigned planner sees their own client).
    let client: { id: string; first_name: string | null; last_name: string | null } | null = null
    if (isAzureConfigured()) {
      const rows = await withRlsContext(userId, (sql) => sql`SELECT id, first_name, last_name FROM clients WHERE id = ${clientId} LIMIT 1`)
      client = (rows[0] as { id: string; first_name: string | null; last_name: string | null } | undefined) ?? null
    } else {
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name')
        .eq('id', clientId)
        .single()
      client = data ?? null
    }

    if (!client) return { error: 'Client not found' }

    const clientName = `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`
    // Business-date alignment (2026-07-05): server runs UTC, so the old
    // setHours(0,0,0,0) normalization flipped "today" at 8pm ET.
    const daysUntil = daysFromBusinessToday(dueDate) ?? 0

    const { subject, html } = deadlineAlertEmail({
      clientName,
      fieldLabel: fieldName,
      dueDate,
      daysUntil,
      clientId: client.id,
    })

    const result = await sendEmail({ to: user.email, subject, html })
    return { success: true, emailId: (result as any)?.data?.id }
  } catch (err: any) {
    console.error('[sendDeadlineEmail] error:', err)
    return { error: err?.message ?? 'Unknown error' }
  }
}
