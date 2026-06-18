import { createClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { targetUserId } = await request.json()
    if (!targetUserId) return NextResponse.json({ error: 'targetUserId required' }, { status: 400 })

    if (isAzureConfigured()) {
      return await withRlsContext(user.id, async (sql) => {
        const mine = await sql`SELECT channel_id FROM chat_members WHERE user_id = ${user.id}`
        const myChannelIds = mine.map((m) => m.channel_id as string)
        if (myChannelIds.length > 0) {
          const shared = await sql`SELECT channel_id FROM chat_members WHERE user_id = ${targetUserId} AND channel_id = ANY(${myChannelIds}::uuid[])`
          const sharedIds = shared.map((m) => m.channel_id as string)
          if (sharedIds.length > 0) {
            const direct = await sql`SELECT id FROM chat_channels WHERE kind = 'direct' AND id = ANY(${sharedIds}::uuid[]) LIMIT 1`
            if (direct.length > 0) {
              return NextResponse.json({ channelId: direct[0].id })
            }
          }
        }
        const created = await sql`INSERT INTO chat_channels (name, kind, created_by) VALUES (${null}, 'direct', ${user.id}) RETURNING id`
        const channelId = created[0]?.id as string | undefined
        if (!channelId) {
          return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 })
        }
        await sql`INSERT INTO chat_members (channel_id, user_id) VALUES (${channelId}, ${user.id}), (${channelId}, ${targetUserId})`
        return NextResponse.json({ channelId })
      })
    }

    // Find channels where current user is a member
    const { data: myMemberships } = await supabase
      .from('chat_members')
      .select('channel_id')
      .eq('user_id', user.id)

    const myChannelIds = (myMemberships ?? []).map((m: any) => m.channel_id)

    if (myChannelIds.length > 0) {
      // Find channels where target user is also a member
      const { data: sharedMemberships } = await supabase
        .from('chat_members')
        .select('channel_id')
        .eq('user_id', targetUserId)
        .in('channel_id', myChannelIds)

      const sharedIds = (sharedMemberships ?? []).map((m: any) => m.channel_id)

      if (sharedIds.length > 0) {
        // Find one that is kind='direct'
        const { data: directChannels } = await supabase
          .from('chat_channels')
          .select('id')
          .eq('kind', 'direct')
          .in('id', sharedIds)
          .limit(1)

        if (directChannels && directChannels.length > 0) {
          return NextResponse.json({ channelId: directChannels[0].id })
        }
      }
    }

    // Create new DM channel
    const { data: channel, error } = await supabase
      .from('chat_channels')
      .insert({ name: null, kind: 'direct', created_by: user.id })
      .select()
      .single()

    if (error || !channel) {
      return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 })
    }

    // Add both members
    await supabase.from('chat_members').insert([
      { channel_id: channel.id, user_id: user.id },
      { channel_id: channel.id, user_id: targetUserId },
    ])

    return NextResponse.json({ channelId: channel.id })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
