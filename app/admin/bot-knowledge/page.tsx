// app/admin/bot-knowledge/page.tsx
// Batch D: admin editor for the BLH Bot knowledge base. Gated identically to
// /admin (supervisor / it / administrator). Content lives in Supabase
// `bot_knowledge` (non-PHI organizational guidance); the bot injects active
// entries into its system prompt with a 60s server-side cache.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BotKnowledgeClient from '@/components/BotKnowledgeClient'

export const dynamic = 'force-dynamic'

export default async function BotKnowledgePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', user.id)
    .single()

  if (!(profile?.role === 'supervisor' || profile?.role === 'it' || profile?.role === 'administrator')) {
    redirect('/dashboard')
  }

  const { data: entries } = await supabase
    .from('bot_knowledge')
    .select('id, title, content, category, is_active, sort_order, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  return <BotKnowledgeClient initialEntries={entries ?? []} />
}
