import { NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

export async function GET() {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ count: 0 })

  // OWNER, ADMIN, and MANAGER can all see pending invitations
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ count: 0 })
  }

  const count = await db.invitation.count({
    where: { status: 'PENDING' },
  })

  return NextResponse.json({ count })
}
