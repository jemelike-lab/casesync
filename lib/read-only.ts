/**
 * CaseSync Read-Only Mode Guard
 *
 * When CASESYNC_READ_ONLY=true is set in Vercel environment variables,
 * all mutating API requests (POST, PUT, PATCH, DELETE) are blocked.
 *
 * Used during disaster recovery to prevent writes while data is being
 * restored or verified.
 *
 * Toggle on:  Vercel dashboard > Settings > Env Vars > add CASESYNC_READ_ONLY=true > redeploy
 * Toggle off: Remove the env var (or set to false) > redeploy
 */

import { NextResponse } from 'next/server'

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isReadOnly(): boolean {
  const flag = process.env.CASESYNC_READ_ONLY ?? ''
  return flag.toLowerCase() === 'true' || flag === '1'
}

export function checkReadOnly(req: Request): NextResponse | null {
  if (isReadOnly() && WRITE_METHODS.has(req.method)) {
    return NextResponse.json(
      {
        error: 'CaseSync is currently in read-only mode for maintenance. Please try again later.',
        readOnly: true,
      },
      { status: 503 }
    )
  }
  return null
}
