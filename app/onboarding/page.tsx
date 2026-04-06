import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OnboardingFlow from '@/components/OnboardingFlow'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // If already onboarded, send to dashboard
  if (profile?.onboarded) {
    redirect('/dashboard')
  }

  return (
    <OnboardingFlow
      userId={user.id}
      userEmail={user.email ?? ''}
      role={profile?.role ?? 'supports_planner'}
      skipPasswordStep
    />
  )
}
