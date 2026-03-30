import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Client } from '@/lib/types'
import ClientEditForm from '@/components/ClientEditForm'

export const dynamic = 'force-dynamic'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: client, error } = await supabase
    .from('clients')
    .select('*, profiles!clients_assigned_to_fkey(id, full_name, role)')
    .eq('id', id)
    .single()

  if (error || !client) notFound()

  return <ClientEditForm client={client as Client} />
}
