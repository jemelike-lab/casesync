import { redirect } from 'next/navigation'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'supports_planner') {
    redirect('/dashboard')
  }

  const filePath = path.join(process.cwd(), 'public', 'planner-clients-import-template.csv')
  const content = await readFile(filePath, 'utf8')

  return new Response(content, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="planner-clients-import-template.csv"',
      'cache-control': 'private, no-store',
    },
  })
}
