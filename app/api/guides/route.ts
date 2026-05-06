import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

const GUIDE_FILES: Record<string, string> = {
  'supports-planner': 'guide-supports-planner.md',
  'team-manager': 'guide-team-manager.md',
  'supervisor': 'guide-supervisor.md',
  'video-script': 'video-script.md',
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/^(\d+)\./, '$1')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
}

function buildTocFromHeadings(md: string): string {
  const lines = md.split('\n')
  const toc: string[] = []

  for (const line of lines) {
    if (!line.startsWith('## ')) continue
    const heading = line.slice(3).trim()
    if (/^table of contents$/i.test(heading)) continue

    const m = heading.match(/^(\d+)\.\s+(.*)$/)
    if (!m) continue

    const num = m[1]
    const title = m[2]
    const slug = slugifyHeading(heading)
    toc.push(`${num}. [${title}](#${slug})`)
  }

  return toc.join('\n')
}

function ensureFreshTableOfContents(md: string): string {
  const toc = buildTocFromHeadings(md)
  if (!toc) return md

  const re = /## Table of Contents\n[\s\S]*?\n---\n\n/m
  if (!re.test(md)) return md

  return md.replace(re, `## Table of Contents\n${toc}\n\n---\n\n`)
}

export async function GET(req: NextRequest) {
  const guide = req.nextUrl.searchParams.get('guide')
  if (!guide || !GUIDE_FILES[guide]) {
    return NextResponse.json({ error: 'Guide not found' }, { status: 404 })
  }

  try {
    const filePath = join(process.cwd(), 'docs', GUIDE_FILES[guide])
    const raw = readFileSync(filePath, 'utf-8')
    const md = ensureFreshTableOfContents(raw)
    return new NextResponse(md, {
      headers: { 'Content-Type': 'text/plain' }
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read guide' }, { status: 500 })
  }
}
