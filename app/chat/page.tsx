import { createClient } from '@/lib/supabase/server'
import { Profile } from '@/lib/types'
import { redirect } from 'next/navigation'
import ChatPageClient from './ChatPageClient'

export const dynamic = 'force-dynamic'

export default async function ChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Get all users for @mention
  const { data: allUsers } = await supabase
    .from('profiles')
    .select('id, full_name')
    .order('full_name')

  // Get or create General and Team channels
  let { data: channels } = await supabase
    .from('chat_channels')
    .select('id, name, kind, client_id')
    .order('created_at', { ascending: true })

  if (!channels || channels.length === 0) {
    // Create default channels
    const { data: created } = await supabase
      .from('chat_channels')
      .insert([
        { name: 'General', kind: 'team', created_by: user.id },
        { name: 'Team', kind: 'team', created_by: user.id },
      ])
      .select()

    // Re-fetch
    const { data: refetched } = await supabase
      .from('chat_channels')
      .select('id, name, kind, client_id')
      .order('created_at', { ascending: true })
    channels = refetched
  }

  // Ensure General and Team exist
  const hasGeneral = channels?.some(c => c.name === 'General' && c.kind === 'team')
  const hasTeam = channels?.some(c => c.name === 'Team' && c.kind === 'team')

  const toCreate: any[] = []
  if (!hasGeneral) toCreate.push({ name: 'General', kind: 'team', created_by: user.id })
  if (!hasTeam) toCreate.push({ name: 'Team', kind: 'team', created_by: user.id })

  if (toCreate.length > 0) {
    await supabase.from('chat_channels').insert(toCreate)
    const { data: refetched } = await supabase
      .from('chat_channels')
      .select('id, name, kind, client_id')
      .order('created_at', { ascending: true })
    channels = refetched
  }

  return (
    <ChatPageClient
      userId={user.id}
      profile={profile as Profile}
      channels={(channels ?? []) as any[]}
      allUsers={(allUsers ?? []) as { id: string; full_name: string | null }[]}
    />
  )
}
