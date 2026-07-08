'use client'

/**
 * UserProfileClient — the defined staff profile (Verification Mock tab 3).
 * One identity across both planes: avatar (uploadable, Supabase `avatars`
 * bucket → profiles.avatar_url — same path OnboardingFlow uses), role/team
 * badges, live caseload stats from /api/clients, and a Workryn deep link
 * instead of a duplicate profile (1:1 account coupling respected).
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import LottieBlock from '@/components/ui/LottieBlock'
import { ANIM } from '@/lib/animations'

const ROLE_LABEL: Record<string, string> = {
  support_planner: 'SUPPORT PLANNER',
  team_manager: 'TEAM MANAGER',
  supervisor: 'SUPERVISOR',
  administrator: 'ADMINISTRATOR',
  it: 'IT',
}

export default function UserProfileClient({
  userId,
  email,
  fullName: initialName,
  jobTitle,
  role,
  avatarUrl: initialAvatar,
  isPlannerRole,
}: {
  userId: string
  email: string
  fullName: string | null
  jobTitle: string | null
  role: string | null
  avatarUrl: string | null
  isPlannerRole: boolean
}) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatar)
  const [uploading, setUploading] = useState(false)
  const [uploadedOk, setUploadedOk] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [stats, setStats] = useState<{ caseload?: number; overdue?: number; dueWeek?: number }>({})

  const initials = (initialName ?? email).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  useEffect(() => {
    const base = (filter: string) => {
      const p = new URLSearchParams({ filter, page: '0', limit: '1' })
      if (isPlannerRole) p.set('assignedTo', userId)
      return `/api/clients?${p.toString()}`
    }
    Promise.all(
      (['all', 'overdue', 'due_this_week'] as const).map(f =>
        fetch(base(f)).then(r => r.json()).then(d => (typeof d.total === 'number' ? d.total : 0)).catch(() => 0),
      ),
    ).then(([caseload, overdue, dueWeek]) => setStats({ caseload, overdue, dueWeek }))
  }, [userId, isPlannerRole])

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !supabase) return
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file.'); return }
    if (file.size > 4 * 1024 * 1024) { setErr('Image must be under 4MB.'); return }
    setErr(null)
    setUploading(true)
    setUploadedOk(false)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${userId}/avatar.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${urlData.publicUrl}?v=${Date.now()}` // bust CDN cache on replace
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
      if (dbErr) throw dbErr
      setAvatarUrl(url)
      setUploadedOk(true)
      setTimeout(() => setUploadedOk(false), 2500)
    } catch (e: any) {
      setErr(e?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const cell = (k: string, v: string | number | undefined, danger?: boolean) => (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>{k}</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 3, color: danger ? '#DC2626' : 'var(--text)' }}>{v ?? '—'}</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '26px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <LottieBlock src={ANIM.heroProfile} size={40} trigger="mount" />
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>My Profile</h1>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', padding: 22, borderBottom: '1px solid var(--border)' }}>
          {/* Avatar with upload */}
          <div style={{ position: 'relative', width: 84, height: 84, flex: 'none' }}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Profile photo" style={{ width: 84, height: 84, borderRadius: 22, objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ width: 84, height: 84, borderRadius: 22, background: 'linear-gradient(135deg,#1E7CFF,#1A6FEB)', color: '#fff', fontSize: 26, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials}</div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Upload profile picture"
              style={{ position: 'absolute', right: -6, bottom: -6, width: 30, height: 30, borderRadius: '50%', border: '2px solid var(--surface)', background: 'var(--accent)', color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {uploading ? '…' : '📷'}
            </button>
            {uploadedOk && (
              <div style={{ position: 'absolute', left: -8, top: -8 }}>
                <LottieBlock src={ANIM.success} size={30} trigger="mount" />
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{initialName ?? email}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 7 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', padding: '2.5px 9px', borderRadius: 6, border: '1px solid #DDD6FE', color: '#7C3AED', background: '#F5F3FF' }}>
                {ROLE_LABEL[role ?? ''] ?? (role ?? 'STAFF').toUpperCase()}
              </span>
              {jobTitle && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{jobTitle}</span>}
              <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{email}</span>
            </div>
            {err && <div style={{ marginTop: 8, fontSize: 12.5, color: '#DC2626' }}>{err}</div>}
          </div>

          <Link href="/w/profile" style={{ textDecoration: 'none', fontSize: 12.5, fontWeight: 650, color: 'var(--accent)', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: 10, whiteSpace: 'nowrap' }}>
            Workryn profile →
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, padding: '18px 22px' }}>
          {cell(isPlannerRole ? 'My Caseload' : 'Clients In Scope', stats.caseload)}
          {cell('Overdue', stats.overdue, (stats.overdue ?? 0) > 0)}
          {cell('Due This Week', stats.dueWeek)}
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 14 }}>
        Your photo appears in the header, on the team pages, and next to your name across CaseSync and Workryn.
      </p>
    </div>
  )
}
