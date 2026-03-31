import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') ?? '0', 10)
    const limit = parseInt(searchParams.get('limit') ?? '20', 10)
    const filter = searchParams.get('filter') ?? 'all'
    const search = searchParams.get('search') ?? ''
    const userId = searchParams.get('userId') ?? ''
    const role = searchParams.get('role') ?? ''

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const from = page * limit
    const to = from + limit - 1

    let query = supabase
      .from('clients')
      .select('*, profiles!clients_assigned_to_fkey(id, full_name, role)', { count: 'exact' })
      .order('last_name')

    // Role-based scoping
    if (role === 'supports_planner') {
      query = query.eq('assigned_to', userId)
    }

    // Filter
    const now = new Date().toISOString().split('T')[0]
    const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    if (filter === 'overdue') {
      query = query.or(
        `eligibility_end_date.lt.${now},pos_deadline.lt.${now},assessment_due.lt.${now},` +
        `three_month_visit_due.lt.${now},thirty_day_letter_date.lt.${now}`
      )
    } else if (filter === 'due_this_week') {
      query = query.or(
        `eligibility_end_date.gte.${now},pos_deadline.gte.${now},assessment_due.gte.${now}`
      ).or(
        `eligibility_end_date.lte.${weekLater},pos_deadline.lte.${weekLater},assessment_due.lte.${weekLater}`
      )
    } else if (filter === 'co') {
      query = query.eq('category', 'co')
    } else if (filter === 'cfc') {
      query = query.eq('category', 'cfc')
    } else if (filter === 'cpas') {
      query = query.eq('category', 'cpas')
    }

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      query = query.or(
        `last_name.ilike.%${q}%,first_name.ilike.%${q}%,client_id.ilike.%${q}%,eligibility_code.ilike.%${q}%`
      )
    }

    // Paginate
    query = query.range(from, to)

    const { data: clients, error, count } = await query

    if (error) {
      console.error('Error fetching paginated clients:', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    const total = count ?? 0
    const hasMore = from + limit < total

    return new Response(JSON.stringify({ clients: clients ?? [], total, hasMore }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
