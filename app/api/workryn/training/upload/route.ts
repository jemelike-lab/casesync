import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// Accept any common video container; the <video> tag's playback support is
// browser-dependent but we let the browser decide on playback. Anything that
// is not in this list (or has no extension) is rejected for safety.
const ALLOWED_EXTS = new Set([
  'mp4', 'm4v', 'mov', 'qt',
  'webm',
  'mkv',
  'avi',
  'wmv',
  'flv',
  'mpg', 'mpeg', 'mpe', 'mp2', 'm2v',
  'ts', 'mts', 'm2ts',
  '3gp', '3g2',
  'ogv', 'ogg',
  'asf',
  'rm', 'rmvb',
  'vob',
  'f4v',
  'mxf',
  'divx',
])
const VIDEOS_DIR = path.join(process.cwd(), 'public', 'training-videos')
const MAX_SIZE = 1024 * 1024 * 1024 // 1 GB — large enough for HD/long-form training videos

function sanitizeFilename(name: string): string {
  // Strip path separators and any control characters; keep basename only.
  const basename = name.replace(/[\\/]+/g, '').replace(/[\x00-\x1f]/g, '').trim()
  return basename.slice(0, 200) || 'video'
}

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large. Max size is ${Math.floor(MAX_SIZE / (1024 * 1024))} MB` },
        { status: 413 }
      )
    }

    const safeName = sanitizeFilename(file.name || 'video')
    const ext = (safeName.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed: ${Array.from(ALLOWED_EXTS).join(', ')}` },
        { status: 400 }
      )
    }

    await mkdir(VIDEOS_DIR, { recursive: true })

    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    // Use resolve + check to defend against path traversal as a second layer
    const fullPath = path.resolve(VIDEOS_DIR, uniqueName)
    if (!fullPath.startsWith(path.resolve(VIDEOS_DIR) + path.sep)) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    await writeFile(fullPath, Buffer.from(bytes))

    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'TRAINING_VIDEO_UPLOADED',
        resourceType: 'TRAINING_VIDEO',
        resourceId: uniqueName,
        details: `Uploaded training video: ${safeName} (${file.size} bytes)`,
      },
    })

    return NextResponse.json({
      url: `/training-videos/${uniqueName}`,
      fileName: safeName,
      size: file.size,
    })
  } catch (err) {
    console.error('Training video upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
