import { NextResponse } from 'next/server'

// RETIRED 2026-06-30 (security): this endpoint used a shared-key service-role
// client that bypassed RLS with no per-user scoping -- a cross-client PHI
// exposure. It is not called by the application. Disabled pending a properly
// user-scoped redesign (client-data access must go through withRlsContext with
// the requester's own identity, never a shared bot key).
const gone = () =>
  NextResponse.json({ error: 'This endpoint has been retired.' }, { status: 410 })

export const GET = gone
export const POST = gone
