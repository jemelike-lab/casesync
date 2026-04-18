import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { slugify } from '@/lib/workryn/utils'

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (session?.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, description, color } = await req.json()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const baseSlug = slugify(name)
  let slug = baseSlug
  let attempt = 0
  while (await db.department.findUnique({ where: { slug } })) {
    attempt++
    slug = `${baseSlug}-${attempt}`
  }

  const dept = await db.department.create({
    data: { name, slug, description: description || null, color: color || '#6366f1' },
    include: { _count: { select: { users: true, tasks: true } } },
  })

  return NextResponse.json(dept, { status: 201 })
}
