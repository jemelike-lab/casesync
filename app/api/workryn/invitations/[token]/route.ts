import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/workryn/db'
import { hash } from 'bcryptjs'
import { isRole } from '@/lib/workryn/permissions'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const invitation = await db.invitation.findUnique({
    where: { token },
    include: {
      invitedBy: { select: { name: true } },
    },
  })

  if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  if (invitation.status !== 'PENDING') return NextResponse.json({ error: 'Invitation is no longer valid', status: invitation.status }, { status: 400 })
  if (new Date() > invitation.expiresAt) {
    await db.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } })
    return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 })
  }

  return NextResponse.json({
    email: invitation.email,
    role: invitation.role,
    message: invitation.message,
    invitedBy: invitation.invitedBy.name,
    expiresAt: invitation.expiresAt,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { name, password } = await req.json()

  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  if (!password || password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })

  const invitation = await db.invitation.findUnique({ where: { token } })
  if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  if (invitation.status !== 'PENDING') return NextResponse.json({ error: 'Invitation is no longer valid' }, { status: 400 })
  if (new Date() > invitation.expiresAt) {
    await db.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } })
    return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 })
  }

  // Check if user with this email already exists
  const existingUser = await db.user.findUnique({ where: { email: invitation.email } })
  if (existingUser) return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 })

  // Defensive: the stored role should always be a valid Role, but reject outright if it isn't.
  const finalRole = isRole(invitation.role) ? invitation.role : 'STAFF'

  const hashedPassword = await hash(password, 12)

  // Avatar color palette
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6', '#06b6d4', '#f59e0b', '#10b981']
  const avatarColor = colors[Math.floor(Math.random() * colors.length)]

  const { user } = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: name.trim(),
        email: invitation.email,
        password: hashedPassword,
        role: finalRole,
        departmentId: invitation.departmentId,
        avatarColor,
      },
    })

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedById: created.id },
    })

    return { user: created }
  })

  // Add to general channel (best-effort, outside the transaction)
  const generalChannel = await db.chatChannel.findFirst({ where: { isGeneral: true } })
  if (generalChannel) {
    await db.channelMember.create({
      data: { channelId: generalChannel.id, userId: user.id, role: 'MEMBER' },
    }).catch(() => {}) // Ignore if already exists
  }

  // Audit log
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'USER_CREATED',
      resourceType: 'USER',
      resourceId: user.id,
      details: `Account created via invitation from ${invitation.invitedById}`,
    },
  })

  return NextResponse.json({ success: true, email: user.email })
}
