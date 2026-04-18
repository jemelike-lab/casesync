/**
 * POST   /api/profile/avatar — upload a new profile picture (multipart form-data, field "file")
 * DELETE /api/profile/avatar — clear the current profile picture
 *
 * Available to any authenticated user. Only operates on the current user's
 * own image. Saves to /public/profile-pictures/ and stores the URL on
 * User.image.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { mkdir, writeFile, unlink } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'profile-pictures')
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

function sanitizeExt(name: string): string {
  const dotIdx = name.lastIndexOf('.')
  if (dotIdx === -1) return 'png'
  const ext = name.slice(dotIdx + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)
  return ALLOWED_EXT.has(ext) ? ext : 'png'
}

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (file.size === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 413 })
  }

  const ext = sanitizeExt(file.name)
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: 'Unsupported image type. Use PNG, JPG, WEBP, or GIF.' }, { status: 400 })
  }

  // Defense-in-depth: also check the MIME type if available
  const mime = file.type?.toLowerCase() ?? ''
  if (mime && !mime.startsWith('image/')) {
    return NextResponse.json({ error: 'File is not an image' }, { status: 400 })
  }

  await mkdir(UPLOAD_DIR, { recursive: true })

  const fileName = `${session.user.id}-${Date.now()}.${ext}`
  const filePath = path.join(UPLOAD_DIR, fileName)

  // Final path traversal guard
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  const publicUrl = `/profile-pictures/${fileName}`

  // Get the old image so we can delete it after the DB update succeeds
  const existing = await db.user.findUnique({
    where: { id: session.user.id },
    select: { image: true },
  })

  const updated = await db.user.update({
    where: { id: session.user.id },
    data: { image: publicUrl },
    select: { id: true, image: true },
  })

  // Best-effort delete old file if it lived in our upload dir
  if (existing?.image && existing.image.startsWith('/profile-pictures/')) {
    const oldPath = path.join(process.cwd(), 'public', existing.image)
    const oldResolved = path.resolve(oldPath)
    if (oldResolved.startsWith(path.resolve(UPLOAD_DIR))) {
      await unlink(oldResolved).catch(() => {})
    }
  }

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'PROFILE_AVATAR_UPDATED',
      resourceType: 'USER',
      resourceId: session.user.id,
      details: `Uploaded new profile picture (${(file.size / 1024).toFixed(1)} KB)`,
    },
  })

  return NextResponse.json({ image: updated.image })
}

export async function DELETE() {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await db.user.findUnique({
    where: { id: session.user.id },
    select: { image: true },
  })

  await db.user.update({
    where: { id: session.user.id },
    data: { image: null },
  })

  if (existing?.image && existing.image.startsWith('/profile-pictures/')) {
    const oldPath = path.join(process.cwd(), 'public', existing.image)
    const oldResolved = path.resolve(oldPath)
    if (oldResolved.startsWith(path.resolve(UPLOAD_DIR))) {
      await unlink(oldResolved).catch(() => {})
    }
  }

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'PROFILE_AVATAR_REMOVED',
      resourceType: 'USER',
      resourceId: session.user.id,
      details: 'Removed profile picture',
    },
  })

  return NextResponse.json({ image: null })
}
