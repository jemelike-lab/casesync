// Maps a CaseSync role to the correct onboarding guide PDF (base64) to attach
// to invite / reminder emails. Resolution never throws — a missing or unknown
// guide simply yields no attachment so the invite itself is never blocked.

export type GuideAttachment = { filename: string; content: string }

function guideKeyForRole(role?: string | null): 'sp' | 'tm' | 'sup' {
  switch ((role ?? '').toLowerCase()) {
    case 'supervisor':
    case 'admin':
      return 'sup'
    case 'team_manager':
    case 'it':
    case 'admin_assistant':
      return 'tm'
    case 'support_planner':
    case 'supports_planner':
      return 'sp'
    default:
      // Unknown roles get the general Support Planner "getting started" guide.
      return 'sp'
  }
}

export async function getGuideAttachmentForRole(
  role?: string | null
): Promise<GuideAttachment | null> {
  try {
    const key = guideKeyForRole(role)
    const mod =
      key === 'sup'
        ? await import('./data/supervisor')
        : key === 'tm'
          ? await import('./data/team-manager')
          : await import('./data/support-planner')
    return { filename: mod.FILENAME, content: mod.B64 }
  } catch (err) {
    console.error('[guides] attachment resolution failed:', err)
    return null
  }
}
