import { getInviteByToken } from '@/app/actions/invite'
import AcceptInviteForm from '@/components/AcceptInviteForm'

export const dynamic = 'force-dynamic'

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token = '' } = await searchParams
  const result = await getInviteByToken(token)

  if ('error' in result) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#0f0f11', color: '#f5f5f7' }}>
        <div style={{ width: '100%', maxWidth: 460, background: '#151518', border: '1px solid #26262b', borderRadius: 16, padding: 28 }}>
          <p style={{ margin: '0 0 8px', color: '#ff9f0a', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Invite Link</p>
          <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>This invite won’t work</h1>
          <p style={{ margin: 0, color: '#b7b7c2', lineHeight: 1.7 }}>{result.error}</p>
        </div>
      </div>
    )
  }

  const { invite } = result

  return <AcceptInviteForm invite={invite} token={token} />
}
