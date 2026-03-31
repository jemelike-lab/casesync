import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getDateStatus(dateStr: string | null): 'red' | 'orange' | 'yellow' | 'green' | 'none' {
  if (!dateStr) return 'none'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'red'
  if (diffDays <= 7) return 'orange'
  if (diffDays <= 30) return 'yellow'
  return 'green'
}

function getOverdueCount(client: Record<string, unknown>): number {
  const fields = [
    'eligibility_end_date', 'three_month_visit_due', 'quarterly_waiver_date',
    'med_tech_redet_date', 'pos_deadline', 'assessment_due', 'thirty_day_letter_date',
    'co_financial_redet_date', 'co_app_date', 'mfp_consent_date', 'two57_date', 'doc_mdh_date',
  ]
  return fields.filter(f => getDateStatus(client[f] as string | null) === 'red').length
}

function getDaysSinceContact(dateStr: string | null): number | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

function formatClientSummary(client: Record<string, unknown>): string {
  const name = `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim()
  const now = new Date()

  function statusOf(dateStr: string | null): string {
    if (!dateStr) return 'not set'
    const d = new Date(dateStr)
    const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return `OVERDUE by ${Math.abs(diff)} days`
    if (diff === 0) return 'due TODAY'
    if (diff <= 7) return `due in ${diff} days`
    return `due ${dateStr}`
  }

  const daysSince = getDaysSinceContact(client.last_contact_date as string | null)
  const lastContact = daysSince !== null ? `${daysSince} days ago via ${client.last_contact_type ?? 'unknown'}` : 'never'

  return `Client: ${name} (ID: ${client.client_id})
Category: ${String(client.category ?? '').toUpperCase()}
POS Status: ${client.pos_status ?? 'unknown'}
Goal Progress: ${client.goal_pct ?? 0}%
Last Contact: ${lastContact}
Overdue items: ${getOverdueCount(client)}

Key Dates:
- Eligibility End: ${statusOf(client.eligibility_end_date as string | null)}
- POS Deadline: ${statusOf(client.pos_deadline as string | null)}
- Assessment Due: ${statusOf(client.assessment_due as string | null)}
- 3-Month Visit Due: ${statusOf(client.three_month_visit_due as string | null)}
- Quarterly Waiver: ${statusOf(client.quarterly_waiver_date as string | null)}
- Med Tech Redet: ${statusOf(client.med_tech_redet_date as string | null)}
- SPM Next Due: ${statusOf(client.spm_next_due as string | null)}
- 30-Day Letter: ${statusOf(client.thirty_day_letter_date as string | null)}
- CO Redet: ${statusOf(client.co_financial_redet_date as string | null)}
- CO App Date: ${statusOf(client.co_app_date as string | null)}
- MFP Consent: ${statusOf(client.mfp_consent_date as string | null)}
- 257 Date: ${statusOf(client.two57_date as string | null)}
- Doc MDH: ${statusOf(client.doc_mdh_date as string | null)}

Other:
- SPM Completed: ${client.spm_completed ? 'Yes' : 'No'}
- Med Tech Status: ${client.med_tech_status ?? 'none'}
- Provider Forms: ${client.provider_forms ?? 'none'}
- Signatures Needed: ${client.signatures_needed ?? 'none'}
- Reportable Events: ${client.reportable_events ?? 'none'}
- Appeals: ${client.appeals ?? 'none'}
- ATP: ${client.atp ?? 'none'}
- SNFs: ${client.snfs ?? 'none'}`
}

export async function POST(req: NextRequest) {
  try {
    const { messages, userId, clientId } = await req.json()

    if (!userId || !messages) {
      return new Response('Missing required fields', { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    // Fetch user's clients
    const { data: allClients } = await supabase
      .from('clients')
      .select('*')
      .eq('assigned_to', userId)
      .order('last_name')

    const clientCount = allClients?.length ?? 0
    const userName = profile?.full_name ?? 'User'
    const userRole = profile?.role ?? 'unknown'

    let clientContextStr = ''

    if (clientId) {
      // Fetch specific client's full data
      const { data: client } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single()

      if (client) {
        clientContextStr = `\n\n=== CURRENT CLIENT CONTEXT ===\n${formatClientSummary(client as Record<string, unknown>)}\n=== END CLIENT CONTEXT ===`
      }
    } else if (allClients && allClients.length > 0) {
      // Provide list of user's clients with key stats
      const clientList = allClients.map((c: Record<string, unknown>) => {
        const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
        const daysSince = getDaysSinceContact(c.last_contact_date as string | null)
        const overdueCount = getOverdueCount(c)
        return `- ${name} (ID: ${c.client_id}) | Overdue: ${overdueCount} | Last contact: ${daysSince !== null ? `${daysSince}d ago` : 'never'} | Goal: ${c.goal_pct ?? 0}%`
      }).join('\n')
      clientContextStr = `\n\n=== USER'S CLIENTS (${clientCount} total) ===\n${clientList}\n=== END CLIENTS ===`
    }

    const systemPrompt = `You are "Your Case AI", an intelligent assistant built into the CaseSync case management portal for Beatrice Loving Heart. You help supports planners, team managers, and supervisors manage their caseloads effectively.

You have access to the following information about the current user:
- Name: ${userName}
- Role: ${userRole.replace(/_/g, ' ')}
- Number of assigned clients: ${clientCount}${clientContextStr}

You can help with:
1. Case-specific questions ("What's overdue for James Doe?", "When was Maria last contacted?")
2. Navigation ("How do I upload a document?", "Where is the calendar?")
3. Priority guidance ("Which clients need attention most urgently?")
4. Field explanations ("What is SPM?", "What does POS Deadline mean?")
5. Workflow help ("How do I log a contact?", "How do I assign a client?")

Navigation reference:
- Dashboard: [/dashboard]
- All clients: [/clients]
- New client: [/clients/new]
- Calendar: [/calendar]
- Chat/messaging: [/chat]
- Team management: [/team]
- Supervisor view: [/supervisor]
- Settings: [/settings]
- Admin panel: [/admin]
- To log a contact: go to a client's page and use the contact log section
- To upload a document: open a client's profile and use the Documents tab [/clients/{clientId}]

Field explanations:
- SPM (Service Planning Meeting): Required meeting to review and plan client services
- POS (Plan of Service): Official service plan with a deadline for completion
- CO (Community Options): A program category for community-based services
- CFC (Community First Choice): Medicaid program for home/community-based services
- CPAS (Community Personal Assistance Services): Personal care assistance program
- Med Tech Redet: Medical technology redetermination - renewal of medical technology services
- MFP (Money Follows the Person): Transition program from institutional to community care
- 257 Date: Specific regulatory deadline for the 257 form
- Doc MDH (Documentation to MDH): Documentation submitted to Maryland Department of Health
- ATP (Assistive Technology Program): Technology aids for clients
- SNFs (Skilled Nursing Facilities): Nursing home or skilled care placements
- Quarterly Waiver: Quarterly review required for waiver programs
- 3-Month Visit: Required in-person visit every 3 months

For navigation questions, respond with the page path in brackets like [/calendar] or [/clients/new] so the UI can create clickable links.

Keep responses concise and actionable. Use bullet points for lists. Be warm but professional.
Always prioritize HIPAA compliance — never suggest sharing client info externally.
Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return new Response('AI service not configured', { status: 503 })
    }

    // Call Anthropic with streaming
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-20240307',
        max_tokens: 1024,
        stream: true,
        system: systemPrompt,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text()
      console.error('Anthropic error:', err)
      return new Response('AI service error', { status: 500 })
    }

    // Stream the response as plain text
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        const reader = anthropicRes.body!.getReader()
        const decoder = new TextDecoder()

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]' || !data) continue
                try {
                  const parsed = JSON.parse(data)
                  if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta?.text) {
                    controller.enqueue(encoder.encode(parsed.delta.text))
                  }
                } catch {
                  // Skip malformed JSON
                }
              }
            }
          }
        } catch (err) {
          console.error('Stream error:', err)
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    console.error('case-ai error:', msg)
    return new Response(msg, { status: 500 })
  }
}
