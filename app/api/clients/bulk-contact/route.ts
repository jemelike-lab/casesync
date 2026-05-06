import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateUUID } from '@/lib/validation'
import { isSupervisorLike } from '@/lib/roles'

export const dynamic = 'force-dynamic'

/**
 * POST /api/clients/bulk-contact
 *
 * Body: {
 *   clientIds: string[]       — UUIDs of clients to update
 *   date: string              — contact date (YYYY-MM-DD)
 *   type: string              — contact type (Phone, Home Visit, Email, Office Visit)
 *   note?: string             — optional note
 * }
 *
 * - Validates all UUIDs
 * - Enforces RLS scoping: planners can only log for their assigned clients
 * - Supervisors/TMs can log for any client
 * - Creates activity_log entries for each client
 * - Returns { updated: number }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: authData, error: authErr } = await supabase.auth.getUser()
    if (authErr || !authData?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = authData.user.id

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single()

    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 403 })
    }

    const body = await req.json()
    const { clientIds, date, type, note } = body as {
      clientIds: string[]
      date: string
      type: string
      note?: string
    }

    // Validate inputs
    if (!Array.isArray(clientIds) || clientIds.length === 0) {
      return Response.json({ error: 'clientIds must be a non-empty array' }, { status: 400 })
    }
    if (clientIds.length > 100) {
      return Response.json({ error: 'Maximum 100 clients per batch' }, { status: 400 })
    }
    if (!clientIds.every(validateUUID)) {
      return Response.json({ error: 'Invalid client ID format' }, { status: 400 })
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ error: 'Invalid date format (expected YYYY-MM-DD)' }, { status: 400 })
    }

    const VALID_TYPES = ['Phone', 'Home Visit', 'Email', 'Office Visit', 'Video']
    if (!type || !VALID_TYPES.includes(type)) {
      return Response.json({ error: `Invalid contact type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
    }

    const trimmedNote = note ? String(note).slice(0, 1000).trim() : ''

    // RLS scoping: planners can only update their assigned clients
    const canSeeAll = isSupervisorLike(profile.role) || profile.role === 'team_manager'

    let scopedIds = clientIds
    if (!canSeeAll) {
      // Fetch assigned clients for this planner to verify ownership
      const { data: owned } = await supabase
        .from('clients')
        .select('id')
        .in('id', clientIds)
        .eq('assigned_to', userId)
        .eq('is_active', true)

      scopedIds = (owned ?? []).map((c: { id: string }) => c.id)
      if (scopedIds.length === 0) {
        return Response.json({ error: 'No matching assigned clients found' }, { status: 403 })
      }
    }

    // Bulk update last_contact_date and last_contact_type
    const { error: updateErr } = await supabase
      .from('clients')
      .update({
        last_contact_date: date,
        last_contact_type: type,
      })
      .in('id', scopedIds)
      .eq('is_active', true)

    if (updateErr) {
      console.error('Bulk contact update error:', updateErr)
      return Response.json({ error: 'Failed to update clients' }, { status: 500 })
    }

    // Create activity_log entries for each updated client
    const logEntries = scopedIds.map(clientId => ({
      client_id: clientId,
      user_id: userId,
      action: `Logged contact: ${type}${trimmedNote ? ' — ' + trimmedNote : ''} (bulk)`,
      field_name: 'last_contact_date',
      old_value: null,
      new_value: date,
    }))

    await supabase.from('activity_log').insert(logEntries)

    return Response.json({ updated: scopedIds.length })
  } catch (err) {
    console.error('Bulk contact error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
