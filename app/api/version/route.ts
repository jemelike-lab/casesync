import { NextResponse } from 'next/server'

/**
 * GET /api/version
 *
 * Returns the current build version (commit SHA) and deployment timestamp.
 * Used by the "Check for Updates" feature in Settings to compare the
 * running client version against the latest server version.
 */
export async function GET() {
  return NextResponse.json({
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
    shortVersion: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    deployedAt: process.env.VERCEL_GIT_COMMIT_DATE ?? new Date().toISOString(),
    environment: process.env.VERCEL_ENV ?? 'development',
  })
}
