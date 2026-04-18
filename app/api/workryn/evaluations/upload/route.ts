import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const ALLOWED_EXTS = new Set([
  // Documents
  'pdf', 'doc', 'docx',
  'xls', 'xlsx',
  'odt', 'ods',
  'rtf', 'txt',
  // Scanned form images
  'png', 'jpg', 'jpeg', 'webp', 'tiff', 'tif',
])
const DOCS_DIR = path.join(process.cwd(), 'public', 'evaluation-docs')
const MAX_SIZE = 25 * 1024 * 1024 // 25 MB

function sanitizeFilename(name: string): string {
  const basename = name.replace(/[\\/]+/g, '').replace(/[\x00-\x1f]/g, '').trim()
  return basename.slice(0, 200) || 'document'
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

    const safeName = sanitizeFilename(file.name || 'document')
    const ext = (safeName.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed: ${Array.from(ALLOWED_EXTS).join(', ')}` },
        { status: 400 }
      )
    }

    await mkdir(DOCS_DIR, { recursive: true })

    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const fullPath = path.resolve(DOCS_DIR, uniqueName)
    if (!fullPath.startsWith(path.resolve(DOCS_DIR) + path.sep)) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    await writeFile(fullPath, Buffer.from(bytes))

    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'EVALUATION_DOC_UPLOADED',
        resourceType: 'EVALUATION_DOC',
        resourceId: uniqueName,
        details: `Uploaded evaluation document: ${safeName} (${file.size} bytes)`,
      },
    })

    return NextResponse.json({
      url: `/evaluation-docs/${uniqueName}`,
      fileName: safeName,
      size: file.size,
    })
  } catch (err) {
    console.error('Evaluation document upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
