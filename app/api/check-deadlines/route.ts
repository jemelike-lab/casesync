import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const DEADLINE_FIELDS = [
  { key: 'eligibility_end_date', label: 'Eligibility End Date' },
  { key: 'three_month_visit_due', label: '3-Month Visit Due' },
  { key: 'pos_deadline', label: 'POS Deadline' },
  { key: 'assessment_due', label: 'Assessment Due' },
  { key: 'thirty_day_letter_date', label: '30-Day Letter Date' },
  { key: 'spm_next_due', label: 'SPM Next Due' },
  { key: 'co_financial_redet_date', label: 'CO Financial Redet Date' },
  { key: 'quarterly_waiver_date', label: 'Quarterly Waiver Date' },
  { key: 'med_tech_redet_date', label: 'Med Tech Redet Date' },
  { key: 'co_app_date', label: 'CO App Date' },
  { key: 'mfp_consent_date', label: 'MFP Consent Date' },
  { key: 'two57_date', label: '257 Date' },
]

const NOTIFY_DAYS = [1, 3, 7]

export async function GET(request: Request) {
  // Security: check for cron secret or internal call
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Fetch all clients with assigned planner
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, client_id, first_name, last_name, assigned_to, eligibility_end_date, three_month_visit_due, pos_deadline, assessment_due, thirty_day_letter_date, spm_next_due, co_financial_redet_date, quarterly_waiver_date, med_tech_redet_date, co_app_date, mfp_consent_date, two57_date')
    .not('assigned_to', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const notifications: any[] = []

  for (const client of clients ?? []) {
    for (const { key, label } of DEADLINE_FIELDS) {
      const dateStr = (client as any)[key] as string | null
      if (!dateStr) continue
      const date = new Date(dateStr)
      date.setHours(0, 0, 0, 0)
      const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000)

      if (NOTIFY_DAYS.includes(diffDays) && client.assigned_to) {
        const clientName = `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`
        const daysLabel = diffDays === 1 ? 'tomorrow' : `in ${diffDays} days`
        notifications.push({
          user_id: client.assigned_to,
          title: `📅 Deadline ${daysLabel}: ${clientName}`,
          body: `${label} is due ${daysLabel} (${dateStr})`,
          link: `/clients/${client.id}`,
          read: false,
        })
      }
    }
  }

  if (notifications.length > 0) {
    // Batch insert
    const { error: insertError } = await supabase.from('notifications').insert(notifications)
    if (insertError) {
      return NextResponse.json({ error: insertError.message, attempted: notifications.length }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    checked: clients?.length ?? 0,
    notificationsSent: notifications.length,
    timestamp: new Date().toISOString(),
  })
}
