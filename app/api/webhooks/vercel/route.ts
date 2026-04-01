import { NextRequest, NextResponse } from 'next/server'

// Simple shared-secret auth:
// - Vercel supports sending a secret via query param (?secret=...) or custom header.
// - We'll accept either:
//   - ?secret=...
//   - x-vercel-webhook-secret: ...
function isAuthorized(req: NextRequest) {
  const expected = process.env.VERCEL_WEBHOOK_SECRET
  if (!expected) return false

  const providedQuery = req.nextUrl.searchParams.get('secret')
  const providedHeader = req.headers.get('x-vercel-webhook-secret')

  return providedQuery === expected || providedHeader === expected
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let payload: unknown = null
  try {
    payload = await req.json()
  } catch {
    // Some Vercel webhooks can be empty or non-JSON depending on configuration.
    payload = null
  }

  // Minimal ack for now. We can add actual actions (notify, trigger tasks, etc.) next.
  return NextResponse.json({ ok: true, received: payload }, { status: 200 })
}

export async function GET(req: NextRequest) {
  // Useful for quick testing in a browser.
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  return NextResponse.json(
    {
      ok: true,
      message: 'vercel webhook endpoint is up',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  )
}
