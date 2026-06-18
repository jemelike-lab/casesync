import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { isAzureAuditConfigured, withAuditWriter } from '@/lib/db/audit-writer'

export type AuditAction =
  | 'client.view' | 'client.create' | 'client.update' | 'client.delete'
  | 'client.export' | 'client.bulk_access'
  | 'user.role_change' | 'user.invite' | 'user.deactivate' | 'user.reactivate'
  | 'auth.login' | 'auth.logout' | 'auth.session_timeout' | 'auth.failed'
  | 'report.generate' | 'report.export'

export interface AuditPayload {
  userId?: string
  userEmail?: string
  userRole?: string
  action: AuditAction | string
  resourceType?: string
  resourceId?: string
  details?: Record<string, unknown>
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getIp(req: Request | NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function auditLog(
  req: Request | NextRequest,
  payload: AuditPayload
): Promise<void> {
  try {
    const row = {
      user_id:       payload.userId ?? null,
      user_email:    payload.userEmail ?? null,
      user_role:     payload.userRole ?? null,
      action:        payload.action,
      resource_type: payload.resourceType ?? null,
      resource_id:   payload.resourceId ?? null,
      details:       payload.details ?? null,
      ip_address:    getIp(req),
      user_agent:    req.headers.get('user-agent') ?? null,
    }
    if (isAzureAuditConfigured()) {
      await withAuditWriter((sql) => sql`INSERT INTO audit_logs (user_id, user_email, user_role, action, resource_type, resource_id, details, ip_address, user_agent) VALUES (${row.user_id}, ${row.user_email}, ${row.user_role}, ${row.action}, ${row.resource_type}, ${row.resource_id}, ${row.details ? sql.json(row.details as unknown as Parameters<typeof sql.json>[0]) : null}, ${row.ip_address}, ${row.user_agent})`)
    } else {
      const admin = getAdminClient()
      await admin.from('audit_logs').insert(row)
    }
  } catch {
    console.error('[audit] Failed to write audit log for action:', payload.action)
  }
}

const BULK_THRESHOLD = 100

export async function auditBulkAccess(
  req: Request | NextRequest,
  payload: AuditPayload & { count: number }
): Promise<void> {
  if (payload.count >= BULK_THRESHOLD) {
    await auditLog(req, {
      ...payload,
      action: 'client.bulk_access',
      details: { ...payload.details, count: payload.count },
    })
  }
}
