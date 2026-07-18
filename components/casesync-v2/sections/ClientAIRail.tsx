'use client'

import { useState, type ReactNode } from 'react'
import { Brain, X, Calendar, User } from 'lucide-react'
import { AIAskClient, AISummary, PrevisitBrief } from '@/components/AIIntelligencePanel'
import type { Client, Profile } from '@/lib/types'

// ---------------------------------------------------------------------------
// ClientAIRail — Phase A
//
// Sticky right rail for the v2 client detail page. Top to bottom:
//   1. Snapshot         — at-a-glance identity facts (status, program, etc.)
//   2. Key dates        — the soonest tracked deadlines
//   3. AI Intelligence  — Ask + Summary (AIIntelligencePanel)
//
// >= 1024px: lives in the second grid column and sticks as the main column
//            scrolls; scrolls internally if it runs taller than the viewport.
// < 1024px:  collapses to a floating button that opens the AI panel.
//
// The grid + breakpoint CSS lives here (global <style>) so the wrapper edit
// stays minimal. Themed entirely with --v2 tokens so dark mode inherits it.
// ---------------------------------------------------------------------------

const BLUE = '#2563eb'
const TEAL = '#0d9488'
const PURPLE = '#bf5af2'

function fmtDate(d: string | null): string | null {
  if (!d) return null
  const parts = d.split('T')[0].split('-')
  if (parts.length !== 3) return null
  const [y, m, day] = parts
  return `${m}/${day}/${y}`
}

function daysFromToday(d: string | null): number | null {
  if (!d) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${d.split('T')[0]}T00:00:00`)
  if (isNaN(target.getTime())) return null
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

const KEY_DATE_FIELDS: { key: keyof Client; label: string }[] = [
  { key: 'eligibility_end_date', label: 'Eligibility ends' },
  { key: 'pos_deadline', label: 'POS deadline' },
  { key: 'assessment_due', label: 'Assessment due' },
  { key: 'three_month_visit_due', label: '3-month visit' },
  { key: 'thirty_day_letter_date', label: '30-day letter' },
  { key: 'med_tech_redet_date', label: 'Med tech redet.' },
  { key: 'spm_next_due', label: 'SPM next due' },
]

function Card({ accent, label, icon, children }: { accent: string; label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div style={{ background: 'var(--v2-surface)', border: `1px solid ${accent}2e`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ color: accent, display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      {children}
    </div>
  )
}

function SnapRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '5px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--v2-text-muted)' }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--v2-text)', textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </div>
  )
}

function RailBody({ client, planners }: { client: Client; planners: Profile[] }) {
  const assignedTo =
    client.profiles?.full_name ??
    planners.find(p => p.id === client.assigned_to)?.full_name ??
    'Unassigned'

  const active = client.is_active !== false
  const goal = typeof client.goal_pct === 'number' ? client.goal_pct : null

  const dates = KEY_DATE_FIELDS
    .map(f => {
      const raw = (client[f.key] as unknown as string | null) ?? null
      const days = daysFromToday(raw)
      const label = fmtDate(raw)
      return raw && days !== null && label ? { name: f.label, date: label, days } : null
    })
    .filter((x): x is { name: string; date: string; days: number } => x !== null)
    .sort((a, b) => a.days - b.days)
    .slice(0, 4)

  return (
    <>
      <Card accent={BLUE} label="Snapshot" icon={<User size={14} />}>
        <SnapRow label="Status">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? '#16a34a' : '#94a3b8' }} />
            {active ? 'Active' : 'Inactive'}
          </span>
        </SnapRow>
        <SnapRow label="Program">{String(client.category).toUpperCase()}</SnapRow>
        <SnapRow label="Assigned to">{assignedTo}</SnapRow>
        <SnapRow label="Eligibility">{client.eligibility_code ?? '\u2014'}</SnapRow>
        {goal !== null && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--v2-text-muted)' }}>Goal progress</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--v2-text)' }}>{goal}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(148,163,184,0.25)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, goal))}%`, background: BLUE, borderRadius: 999 }} />
            </div>
          </div>
        )}
      </Card>

      <Card accent={TEAL} label="Key dates" icon={<Calendar size={14} />}>
        {dates.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--v2-text-muted)' }}>No tracked dates yet.</div>
        ) : (
          dates.map(d => {
            const tone = d.days < 0 ? '#ef4444' : d.days <= 14 ? '#d97706' : 'var(--v2-text-muted)'
            const rel = d.days < 0 ? `${Math.abs(d.days)}d over` : d.days === 0 ? 'today' : `in ${d.days}d`
            return (
              <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <span style={{ fontSize: 12.5, color: 'var(--v2-text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--v2-text-muted)' }}>{d.date}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: tone }}>{rel}</span>
                </span>
              </div>
            )
          })
        )}
      </Card>

      <Card accent={PURPLE} label="AI Intelligence" icon={<Brain size={14} />}>
        <AIAskClient clientId={client.id} />
        <PrevisitBrief clientId={client.id} />
        <AISummary clientId={client.id} />
      </Card>
    </>
  )
}

export default function ClientAIRail({ client, planners = [] }: { client: Client; planners?: Profile[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="cs-ai-root">
      <div className="cs-ai-rail">
        <RailBody client={client} planners={planners} />
      </div>

      <div className="cs-ai-fabwrap">
        {open && (
          <div className="cs-ai-popover" style={{ background: 'var(--v2-surface)', border: `1px solid ${PURPLE}2e`, borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--v2-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Client AI</span>
              <button aria-label="Close" onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--v2-text-muted)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
            </div>
            <AIAskClient clientId={client.id} />
            <PrevisitBrief clientId={client.id} />
        <AISummary clientId={client.id} />
          </div>
        )}
        <button aria-label="AI intelligence for this client" onClick={() => setOpen(o => !o)} className="cs-ai-fab">
          <Brain size={22} color="#fff" />
        </button>
      </div>

      <style>{`
        .cs-detail-grid { display: grid; grid-template-columns: 1fr; gap: 0; }
        .cs-ai-root { display: block; }
        .cs-ai-rail { display: none; }
        .cs-ai-fabwrap { display: block; }
        .cs-ai-fab {
          position: fixed; right: 20px; bottom: 212px; z-index: 590;
          width: 48px; height: 48px; border-radius: 50%;
          background: #bf5af2; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 16px rgba(191,90,242,0.45);
        }
        .cs-ai-popover {
          position: fixed; right: 20px; bottom: 270px; z-index: 590;
          width: 340px; max-width: calc(100vw - 40px); max-height: 70vh; overflow: auto;
          box-shadow: 0 16px 48px rgba(0,0,0,0.28);
        }
        @media (max-width: 768px) {
          .cs-ai-fab { bottom: calc(294px + env(safe-area-inset-bottom)); }
          .cs-ai-popover { bottom: calc(352px + env(safe-area-inset-bottom)); }
        }
        @media (min-width: 1024px) {
          .cs-detail-grid { grid-template-columns: minmax(0, 1fr) 360px; gap: 18px; align-items: start; }
          .cs-ai-root { position: sticky; top: 16px; max-height: calc(100dvh - 32px); overflow-y: auto; scrollbar-width: thin; }
          .cs-ai-rail { display: flex; flex-direction: column; gap: 12px; }
          .cs-ai-fabwrap { display: none; }
        }
      `}</style>
    </div>
  )
}
