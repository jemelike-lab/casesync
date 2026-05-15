import { getWorkrynSession } from '@/lib/workryn/auth'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Metadata } from 'next'

const CountyPreferenceClient = dynamic(
  () => import('@/components/workryn/CountyPreferenceClient'),
  { loading: () => <div style={{ padding: 32, color: '#94a3b8', fontSize: 14 }}>Loading county preference form...</div> }
)

export const metadata: Metadata = { title: 'County Preference — Onboarding' }

export default async function CountyPreferencePage() {
  const session = await getWorkrynSession()
  if (!session) redirect('/login')

  return (
    <CountyPreferenceClient
      currentUser={{
        id: session.user.id,
        name: session.user.name ?? '',
        email: session.user.email ?? '',
        role: session.user.role,
        avatarColor: session.user.avatarColor,
      }}
    />
  )
}
