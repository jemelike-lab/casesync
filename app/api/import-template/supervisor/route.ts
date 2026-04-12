import { redirect } from 'next/navigation'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@/lib/supabase/server'
import { canManageTeam } from '@/lib/roles'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!canManageTeam(profile?.role)) {
    redirect('/dashboard')
  }

  const filePath = path.join(process.cwd(), 'public', 'clients-import-template.csv')
  const content = await readFile(filePath, 'utf8')

  return new Response(content, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="clients-import-template.csv"',
      'cache-control': 'private, no-store',
    },
  })
}
