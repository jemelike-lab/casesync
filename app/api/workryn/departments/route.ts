import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isAdminOrAbove } from '@/lib/workryn/permissions'
import { slugify } from '@/lib/workryn/utils'

/**
 * GET /api/departments
 *   List all departments. Any authenticated user.
 *   Optional query param `search` filters by name/description (case-insensitive via SQLite LIKE).
 *
 * POST /api/departments
 *   Create a department. ADMIN/OWNER only.
 */
export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const search = req.nextUrl.searchParams.get('search')?.trim() || ''

  const where = search
    ? {
        OR: [
          { name: { contains: search } },
          { description: { contains: search } },
        ],
      }
    : undefined

  const departments = await db.department.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      head: {
        select: {
          id: true,
          name: true,
          avatarColor: true,
          jobTitle: true,
          role: true,
        },
      },
      _count: {
        select: {
          users: true,
          tasks: true,
          tickets: true,
        },
      },
    },
  })

  return NextResponse.json(departments)
}

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 })
  }

  const description =
    typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
  const color = typeof body.color === 'string' && body.color.trim() ? body.color.trim() : undefined
  const icon = typeof body.icon === 'string' && body.icon.trim() ? body.icon.trim() : undefined
  const headId = typeof body.headId === 'string' && body.headId.trim() ? body.headId.trim() : null

  // If a head was supplied, verify that user exists.
  if (headId) {
    const headUser = await db.user.findUnique({ where: { id: headId } })
    if (!headUser) {
      return NextResponse.json({ error: 'Head user not found' }, { status: 400 })
    }
  }

  // Generate a unique slug with collision suffix.
  const baseSlug = slugify(name) || 'department'
  let slug = baseSlug
  let attempt = 0
  while (await db.department.findUnique({ where: { slug } })) {
    attempt++
    slug = `${baseSlug}-${attempt}`
  }

  // Create the department, and if a head was provided, also add that user as a
  // member of the new department (so the head is consistent with the "head must
  // be a member" invariant enforced by PATCH).
  const dept = await db.$transaction(async (tx) => {
    const created = await tx.department.create({
      data: {
        name,
        slug,
        description,
        ...(color ? { color } : {}),
        ...(icon ? { icon } : {}),
        ...(headId ? { headId } : {}),
      },
    })
    if (headId) {
      await tx.user.update({
        where: { id: headId },
        data: { departmentId: created.id },
      })
    }
    return tx.department.findUnique({
      where: { id: created.id },
      include: {
        head: {
          select: {
            id: true,
            name: true,
            avatarColor: true,
            jobTitle: true,
            role: true,
          },
        },
        _count: {
          select: {
            users: true,
            tasks: true,
            tickets: true,
          },
        },
      },
    })
  })

  if (!dept) {
    return NextResponse.json({ error: 'Failed to create department' }, { status: 500 })
  }

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'DEPARTMENT_CREATED',
      resourceType: 'DEPARTMENT',
      resourceId: dept.id,
      details: `Created department: ${dept.name}`,
    },
  })

  return NextResponse.json(dept, { status: 201 })
}
