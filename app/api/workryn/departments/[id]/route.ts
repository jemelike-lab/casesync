import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isAdminOrAbove } from '@/lib/workryn/permissions'
import { slugify } from '@/lib/workryn/utils'

// Fields safe to expose to clients — deliberately excludes password, mfaSecret, emailVerified.
const SAFE_MEMBER_SELECT = {
  id: true,
  name: true,
  email: true,
  jobTitle: true,
  phone: true,
  role: true,
  avatarColor: true,
  isActive: true,
  lastLogin: true,
  createdAt: true,
  mfaEnabled: true,
} as const

const FULL_HEAD_SELECT = {
  id: true,
  name: true,
  email: true,
  jobTitle: true,
  phone: true,
  role: true,
  avatarColor: true,
  isActive: true,
  lastLogin: true,
  createdAt: true,
  mfaEnabled: true,
} as const

/**
 * GET /api/departments/[id]
 *   Get single department. Any authenticated user.
 *
 * PATCH /api/departments/[id]
 *   Update department. ADMIN/OWNER only.
 *
 * DELETE /api/departments/[id]
 *   Delete department. ADMIN/OWNER only. Rejects if department has members or
 *   any tasks/tickets tied to it.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const department = await db.department.findUnique({
    where: { id },
    include: {
      head: { select: FULL_HEAD_SELECT },
      users: {
        select: SAFE_MEMBER_SELECT,
        orderBy: { name: 'asc' },
      },
      _count: {
        select: {
          tasks: true,
          tickets: true,
          users: true,
        },
      },
    },
  })

  if (!department) {
    return NextResponse.json({ error: 'Department not found' }, { status: 404 })
  }

  return NextResponse.json(department)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  let body: {
    name?: unknown
    description?: unknown
    color?: unknown
    icon?: unknown
    headId?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const existing = await db.department.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Department not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  const changedFields: string[] = []

  // --- name + slug ---
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }
    const newName = body.name.trim()
    if (newName !== existing.name) {
      data.name = newName
      changedFields.push('name')

      // Regenerate slug with collision suffix only if the new slug would conflict.
      const baseSlug = slugify(newName) || 'department'
      let slug = baseSlug
      let attempt = 0
      // Allow the existing department to keep its own slug if it happens to match.
      while (true) {
        const clash = await db.department.findUnique({ where: { slug } })
        if (!clash || clash.id === id) break
        attempt++
        slug = `${baseSlug}-${attempt}`
      }
      if (slug !== existing.slug) {
        data.slug = slug
      }
    }
  }

  // --- description ---
  if (body.description !== undefined) {
    if (body.description === null) {
      data.description = null
    } else if (typeof body.description === 'string') {
      data.description = body.description.trim() || null
    } else {
      return NextResponse.json({ error: 'Invalid description' }, { status: 400 })
    }
    changedFields.push('description')
  }

  // --- color ---
  if (body.color !== undefined) {
    if (typeof body.color !== 'string' || !body.color.trim()) {
      return NextResponse.json({ error: 'Invalid color' }, { status: 400 })
    }
    data.color = body.color.trim()
    changedFields.push('color')
  }

  // --- icon ---
  if (body.icon !== undefined) {
    if (typeof body.icon !== 'string' || !body.icon.trim()) {
      return NextResponse.json({ error: 'Invalid icon' }, { status: 400 })
    }
    data.icon = body.icon.trim()
    changedFields.push('icon')
  }

  // --- headId ---
  if (body.headId !== undefined) {
    if (body.headId === null || body.headId === '') {
      data.headId = null
      changedFields.push('headId')
    } else if (typeof body.headId === 'string') {
      const newHeadId = body.headId.trim()
      if (newHeadId !== existing.headId) {
        const headUser = await db.user.findUnique({ where: { id: newHeadId } })
        if (!headUser) {
          return NextResponse.json({ error: 'Head user not found' }, { status: 400 })
        }
        if (headUser.departmentId !== id) {
          return NextResponse.json(
            { error: 'Head must be a member of this department' },
            { status: 400 }
          )
        }
        data.headId = newHeadId
        changedFields.push('headId')
      }
    } else {
      return NextResponse.json({ error: 'Invalid headId' }, { status: 400 })
    }
  }

  const department = await db.department.update({
    where: { id },
    data,
    include: {
      head: { select: FULL_HEAD_SELECT },
      users: {
        select: SAFE_MEMBER_SELECT,
        orderBy: { name: 'asc' },
      },
      _count: {
        select: {
          tasks: true,
          tickets: true,
          users: true,
        },
      },
    },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'DEPARTMENT_UPDATED',
      resourceType: 'DEPARTMENT',
      resourceId: department.id,
      details: `Updated department: ${department.name}${
        changedFields.length ? ` (fields: ${changedFields.join(', ')})` : ''
      }`,
    },
  })

  return NextResponse.json(department)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const existing = await db.department.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          users: true,
          tasks: true,
          tickets: true,
        },
      },
    },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Department not found' }, { status: 404 })
  }

  if (existing._count.users > 0) {
    return NextResponse.json(
      {
        error:
          'Cannot delete department with members. Reassign or remove members first.',
      },
      { status: 400 }
    )
  }

  if (existing._count.tasks > 0 || existing._count.tickets > 0) {
    return NextResponse.json(
      {
        error:
          'Cannot delete department with linked tasks or tickets. Reassign those resources first.',
      },
      { status: 400 }
    )
  }

  // Clear headId first in case it points at a stale user (defensive); then delete.
  await db.department.delete({ where: { id } })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'DEPARTMENT_DELETED',
      resourceType: 'DEPARTMENT',
      resourceId: id,
      details: `Deleted department: ${existing.name}`,
    },
  })

  return NextResponse.json({ ok: true })
}
