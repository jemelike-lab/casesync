/**
 * GET  /api/profile/me — return current user's profile
 * PUT  /api/profile/me — self-update profile
 *
 * Permissions:
 *   Anyone can edit: name, phone, bio, avatarColor, image
 *   ADMIN/OWNER only: jobTitle, departmentId
 *   Never editable here: email, role, password (use /admin or /api/auth flows)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isAdminOrAbove } from '@/lib/workryn/permissions'

const SAFE_PROFILE_SELECT = {
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
  isActive: true,
  lastLogin: true,
  mfaEnabled: true,
  createdAt: true,
} as const

export async function GET() {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: SAFE_PROFILE_SELECT,
  })

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  return NextResponse.json(user)
}

export async function PUT(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  // Build update object with only allowed fields
  const updateData: Record<string, unknown> = {}

  // Always-editable fields
  if (typeof body.name === 'string') {
    const trimmed = body.name.trim()
    if (!trimmed) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    if (trimmed.length > 100) return NextResponse.json({ error: 'Name too long' }, { status: 400 })
    updateData.name = trimmed
  }
  if (typeof body.phone === 'string') {
    updateData.phone = body.phone.trim() || null
  }
  if (typeof body.bio === 'string') {
    if (body.bio.length > 500) return NextResponse.json({ error: 'Bio too long (max 500 chars)' }, { status: 400 })
    updateData.bio = body.bio.trim() || null
  }
  if (typeof body.avatarColor === 'string') {
    if (!/^#[0-9a-fA-F]{6}$/.test(body.avatarColor)) {
      return NextResponse.json({ error: 'Invalid avatar color' }, { status: 400 })
    }
    updateData.avatarColor = body.avatarColor
  }
  if (body.image === null || typeof body.image === 'string') {
    // Allow clearing the image (null) or setting to a path string
    updateData.image = body.image
  }

  // ADMIN/OWNER only fields
  const isAdmin = isAdminOrAbove(session.user.role)
  if (body.jobTitle !== undefined) {
    if (!isAdmin) {
      return NextResponse.json({ error: 'Only admins can change job title' }, { status: 403 })
    }
    updateData.jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.trim() || null : null
  }
  if (body.departmentId !== undefined) {
    if (!isAdmin) {
      return NextResponse.json({ error: 'Only admins can change department' }, { status: 403 })
    }
    if (body.departmentId !== null && typeof body.departmentId !== 'string') {
      return NextResponse.json({ error: 'Invalid department ID' }, { status: 400 })
    }
    if (body.departmentId) {
      const dept = await db.department.findUnique({ where: { id: body.departmentId } })
      if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })
    }
    updateData.departmentId = body.departmentId || null
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const updated = await db.user.update({
    where: { id: session.user.id },
    data: updateData,
    select: SAFE_PROFILE_SELECT,
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'PROFILE_UPDATED',
      resourceType: 'USER',
      resourceId: session.user.id,
      details: `Updated fields: ${Object.keys(updateData).join(', ')}`,
    },
  })

  return NextResponse.json(updated)
}
