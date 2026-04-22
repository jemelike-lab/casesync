import { NextRequest, NextResponse } from 'next/server'
import { ensureClientFolder } from '@/lib/sharepoint'
import { createClient } from '@/lib/supabase/server'
import { validateUUID } from '@/lib/validation'

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
    }

  if (!validateUUID(clientId)) {
    return NextResponse.json({ error: 'Invalid clientId format' }, { status: 400 })
  }

    // Auth: only logged-in users can trigger folder creation.
    // NOTE: the /clients/new page already restricts to team_manager + supervisor.
    const supabase = await createClient()
    const { data: authData, error: authErr } = await supabase.auth.getUser()
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureClientFolder(clientId)

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create folder'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
