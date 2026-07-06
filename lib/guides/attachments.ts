// Maps a CaseSync role to the correct onboarding guide PDF (base64) to attach
// to invite / reminder emails.
//
// Data modules are STATICALLY imported so they are always traced into the
// serverless bundle on Vercel. (A prior dynamic-import version silently
// resolved to null in production, so invites went out with no attachment.)
// Resolution still never throws — on any unexpected error we return null so
// the invite itself is never blocked.

import * as SP from './data/support-planner'
import * as TM from './data/team-manager'
import * as SUP from './data/supervisor'

export type GuideAttachment = { filename: string; content: string }

function guideModuleForRole(role?: string | null) {
  switch ((role ?? '').toLowerCase()) {
    case 'supervisor':
    case 'admin':
      return SUP
    case 'team_manager':
    case 'it':
    case 'admin_assistant':
      return TM
    case 'support_planner':
    case 'supports_planner':
      return SP
    default:
      // Unknown roles get the general Support Planner "getting started" guide.
      return SP
  }
}

export function getGuideAttachmentForRole(
  role?: string | null
): GuideAttachment | null {
  try {
    const mod = guideModuleForRole(role)
    if (!mod?.B64 || !mod?.FILENAME) {
      console.error('[guides] guide module missing data for role:', role)
      return null
    }
    return { filename: mod.FILENAME, content: mod.B64 }
  } catch (err) {
    console.error('[guides] attachment resolution failed:', err)
    return null
  }
}
