import { NextResponse } from 'next/server'

// RETIRED 2026-07-12 (files pipeline consolidation): this legacy endpoint
// stored client-document bytes in the Supabase 'client-documents' bucket and
// metadata in the Supabase client_documents table, authorizing via
// user_can_access_client() -- which reads the Supabase clients table, empty
// since the 2026-06-28 Entra cutover, so every request was denied. The live
// pipeline is SharePoint bytes + Azure client_documents metadata
// (/api/sharepoint/*), which Casey, the client Files tab, the ZIP bulk
// download (../zip), and /documents all use. Retired rather than migrated to
// keep a single authoritative PHI file path.
const gone = () =>
  NextResponse.json({ error: 'This endpoint has been retired.' }, { status: 410 })

export const DELETE = gone
