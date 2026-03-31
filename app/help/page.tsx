import { createClient } from '@/lib/supabase/server'
import HelpPageClient from '@/components/HelpPageClient'

export default async function HelpPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return <HelpPageClient profile={profile} />
}
