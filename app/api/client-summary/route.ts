import { NextRequest, NextResponse } from 'next/server'
import { checkAiRateLimit } from '@/lib/ai-rate-limit'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { clientId } = await req.json()
    if (!clientId) {
      return NextResponse.json({ error: 'clientId required' }, { status: 400 })
    }

    const server = await createServerClient()
    const { data: authData, error: authErr } = await server.auth.getUser()

    if (authErr || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const aiRateLimit = await checkAiRateLimit(req, '/api/client-summary')
    if (aiRateLimit) return aiRateLimit

    const supabase = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: client, error } = await supabase
      .from('clients')
      .select('*, profiles!clients_assigned_to_fkey(full_name)')
      .eq('id', clientId)
      .single()

    if (error || !client) {
      console.error('client-summary lookup error:', error)
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Check if ANTHROPIC_API_KEY is available
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      // Generate mock summary
      const name = `${client.first_name ?? ''} ${client.last_name}`.trim()
      const plannerProfile = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles
      const planner = plannerProfile?.full_name ?? 'an unassigned planner'
      const category = (client.category ?? 'unknown').toUpperCase()
      return NextResponse.json({
        summary: `AI summary unavailable — add ANTHROPIC_API_KEY to Vercel environment variables to enable. (${name} is a ${category} client assigned to ${planner}.)`,
        mock: true,
      })
    }

    // Build prompt
    const name = `${client.first_name ?? ''} ${client.last_name}`.trim()
    const plannerProfile = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles
    const planner = plannerProfile?.full_name ?? 'Unassigned'
    const category = (client.category ?? '').toUpperCase()

    const now = new Date()
    function getStatus(dateStr: string | null): string {
      if (!dateStr) return 'not set'
      const d = new Date(dateStr)
      const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (diff < 0) return `overdue by ${Math.abs(diff)} days`
      if (diff === 0) return 'due today'
      if (diff <= 7) return `due in ${diff} days`
      if (diff <= 30) return `due in ${diff} days`
      return `due ${dateStr}`
    }

    function daysSince(dateStr: string | null): string {
      if (!dateStr) return 'never'
      const d = new Date(dateStr)
      const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
      return `${diff} days ago`
    }

    const fields = [
      `Eligibility End: ${getStatus(client.eligibility_end_date)}`,
      `POS Deadline: ${getStatus(client.pos_deadline)} (Status: ${client.pos_status ?? 'unknown'})`,
      `Assessment Due: ${getStatus(client.assessment_due)}`,
      `3-Month Visit Due: ${getStatus(client.three_month_visit_due)}`,
      `30-Day Letter: ${getStatus(client.thirty_day_letter_date)}`,
      `CO Redet: ${getStatus(client.co_financial_redet_date)}`,
      `SPM Next Due: ${getStatus(client.spm_next_due)}`,
      `Last Contact: ${daysSince(client.last_contact_date)} via ${client.last_contact_type ?? 'unknown'}`,
      `Goal Progress: ${client.goal_pct ?? 0}%`,
    ].join('\n')

    const prompt = `You are a case management assistant. Generate a concise 2-3 sentence summary of this client's current status. Focus on what needs immediate attention and overall health.

Client: ${name}
Category: ${category}
Assigned to: ${planner}

Status:
${fields}

Write a professional, factual summary. Format: "[Name] is a [category] client assigned to [planner]. [Key status items]. [Immediate action needed or positive note]." Keep it under 60 words.`

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic error:', err)
      return NextResponse.json({ error: 'AI service error' }, { status: 500 })
    }

    const result = await response.json()
    const summary = result.content?.[0]?.text ?? 'Unable to generate summary.'

    return NextResponse.json({ summary })
  } catch (err: any) {
    console.error('client-summary error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
