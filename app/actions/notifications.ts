'use server'

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { deadlineAlertEmail, clientAssignedEmail } from '@/lib/email-templates'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
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

    // Get client details
    const { data: client } = await supabase
      .from('clients')
      .select('id, client_id, first_name, last_name, category, assigned_to, profiles!clients_assigned_to_fkey(full_name)')
      .eq('id', clientId)
      .single()

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

    // Get client details
    const { data: client } = await supabase
      .from('clients')
      .select('id, first_name, last_name')
      .eq('id', clientId)
      .single()

    if (!client) return { error: 'Client not found' }

    const clientName = `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(dueDate)
    due.setHours(0, 0, 0, 0)
    const daysUntil = Math.round((due.getTime() - today.getTime()) / 86400000)

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
