import { NextResponse } from 'next/server'

// RETIRED 2026-06-30 (security): shared-key service-role RLS bypass, not called by
// the application. See app/api/bot/clients/[id]/files/route.ts for rationale.
export const POST = () =>
  NextResponse.json({ error: 'This endpoint has been retired.' }, { status: 410 })
