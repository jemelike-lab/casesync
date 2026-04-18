import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { redirect } from 'next/navigation'
import SettingsClient from '@/components/workryn/SettingsClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const session = await getWorkrynSession()
  if (!session) redirect('/login')

  const [profile, departments] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        jobTitle: true,
        phone: true,
        bio: true,
        avatarColor: true,
        role: true,
        departmentId: true,
        department: { select: { id: true, name: true, color: true } },
        mfaEnabled: true,
        createdAt: true,
        lastLogin: true,
      },
    }),
    db.department.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true },
    }),
  ])

  if (!profile) redirect('/login')

  return (
    <SettingsClient
      profile={JSON.parse(JSON.stringify(profile))}
      departments={departments}
    />
  )
}
