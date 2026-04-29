import { createClient } from '@/lib/supabase/server'
import { Profile } from '@/lib/types'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import SecurityPageClient from './SecurityPageClient'

export const dynamic = 'force-dynamic'

export default async function SecurityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Get MFA factors
  const { data: mfaData } = await supabase.auth.mfa.listFactors()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const factors = (mfaData?.all ?? []) as any[]

  return (
    <Suspense fallback={null}>
      <SecurityPageClient
        user={user}
        profile={profile as Profile}
        factors={factors}
      />
    </Suspense>
  )
}
