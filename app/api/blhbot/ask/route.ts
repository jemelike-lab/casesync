import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { id?: string; question?: string }
  const id = body.id
  const question = (body.question ?? '').trim()

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 })

  // Fetch the client with RLS enforcement
  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !client) {
    return NextResponse.json({ error: 'Client not found (or access denied)' }, { status: 404 })
  }

  // Delegate to existing AI endpoint which already implements:
  // - client context injection via clientId
  // - role-aware scope + knowledge blocks
  // - Anthropic streaming
  // We'll send a single user message.
  const res = await fetch(new URL('/api/case-ai', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: user.id,
      clientId: id,
      messages: [{ role: 'user', content: question }],
    }),
  }).catch(() => null)

  if (!res) {
    return NextResponse.json({ error: 'Failed to reach AI service' }, { status: 502 })
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({} as any))
    return NextResponse.json({ error: data.error || 'AI request failed' }, { status: res.status })
  }

  // /api/case-ai streams text/plain chunks.
  const answer = await res.text()
  return NextResponse.json({ ok: true, answer })
}
