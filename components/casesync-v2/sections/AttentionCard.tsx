'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { evaluateReadiness, SIGNATURE_CATEGORIES } from '@/lib/readiness'
import type { Client } from '@/lib/types'

// ---------------------------------------------------------------------------
// AttentionCard — Phase A Batch 3.4 (Direction B, approved 2026-07-04)
//
// One consolidated, collapsible "N items need attention" card directly below
// the StatusRow. Every item is DETERMINISTIC — sourced from the client row's
// date fields and from lib/readiness.ts gates. Nothing here is LLM-guessed.
//
//   red   = overdue deadline, or no contact for >= 14 days
//   amber = deadline within 7 days, contact 8-14 days, failed readiness gate
//
// Readiness gates need hasSignatureDoc, so the card renders date items
// immediately and hydrates gate items once /api/sharepoint/files resolves.
// Gates whose subject already appears as a date item are deduped (medicaid
// <-> eligibility_end_date, loc <-> loc_date, poc <-> poc_date).
//
// Collapse state persists per client per day (localStorage) so the card never
// nags: collapse it once and it stays collapsed until tomorrow. Zero items =
// no surface rendered at all.
// ---------------------------------------------------------------------------

const RED = '#E24B4A'
const AMBER = '#BA7517'
const DAY_MS = 86_400_000

type Severity = 'red' | 'amber'

interface AttnItem {
  key: string
  severity: Severity
  text: string
  actionLabel?: string
  actionKind?: 'edit' | 'scroll'
  actionTarget?: string
}

// Deadline fields scanned for overdue / due-soon items. last_contact_date is
// handled separately; loc_date/poc_date stay here and dedupe their gates.
const ATTN_DEADLINE_FIELDS: Array<{ field: keyof Client; label: string }> = [
  { field: 'eligibility_end_date',    label: 'Eligibility'      },
  { field: 'three_month_visit_due',   label: '3-month visit'    },
  { field: 'quarterly_waiver_date',   label: 'Quarterly waiver' },
  { field: 'med_tech_redet_date',     label: 'Med-tech redet.'  },
  { field: 'pos_deadline',            label: 'POS deadline'     },
  { field: 'assessment_due',          label: 'Assessment'       },
  { field: 'doc_mdh_date',            label: 'Doc to MDH'       },
  { field: 'spm_next_due',            label: 'SPM'              },
  { field: 'thirty_day_letter_date',  label: '30-day letter'    },
  { field: 'co_financial_redet_date', label: 'CO fin. redet.'   },
]

const GATE_DEDUP: Record<string, keyof Client> = {
  medicaid: 'eligibility_end_date',
  loc: 'loc_date',
  poc: 'poc_date',
}

const GATE_SCROLL: Record<string, string> = {
  pos_status: 'cs-sec-plans',
  poc: 'cs-sec-plans',
  loc: 'cs-sec-plans',
  medicaid: 'cs-sec-deadlines',
  signatures: 'cs-sec-forms',
}

function daysFromToday(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!m) return null
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((target - today) / DAY_MS)
}

function todayKey(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function buildDateItems(client: Client): { items: AttnItem[]; dateItemFields: Set<string> } {
  const items: AttnItem[] = []
  const dateItemFields = new Set<string>()

  // Contact recency
  const contactDays = client.last_contact_date ? -1 * (daysFromToday(client.last_contact_date) ?? 0) : null
  if (contactDays === null) {
    items.push({ key: 'contact', severity: 'amber', text: 'No contact logged yet', actionLabel: 'Log contact', actionKind: 'edit' })
  } else if (contactDays >= 15) {
    items.push({ key: 'contact', severity: 'red', text: `Contact overdue — last logged ${contactDays} days ago`, actionLabel: 'Log contact', actionKind: 'edit' })
  } else if (contactDays >= 8) {
    items.push({ key: 'contact', severity: 'amber', text: `No contact in ${contactDays} days`, actionLabel: 'Log contact', actionKind: 'edit' })
  }

  // Deadlines: overdue or due within 7 days
  for (const { field, label } of ATTN_DEADLINE_FIELDS) {
    const d = daysFromToday(client[field] as string | null | undefined)
    if (d === null) continue
    if (d < 0) {
      items.push({ key: `dl-${String(field)}`, severity: 'red', text: `${label} overdue — ${Math.abs(d)} ${Math.abs(d) === 1 ? 'day' : 'days'}`, actionLabel: 'View deadlines', actionKind: 'scroll', actionTarget: 'cs-sec-deadlines' })
      dateItemFields.add(String(field))
    } else if (d === 0) {
      items.push({ key: `dl-${String(field)}`, severity: 'amber', text: `${label} due today`, actionLabel: 'View deadlines', actionKind: 'scroll', actionTarget: 'cs-sec-deadlines' })
      dateItemFields.add(String(field))
    } else if (d <= 7) {
      items.push({ key: `dl-${String(field)}`, severity: 'amber', text: `${label} due in ${d} ${d === 1 ? 'day' : 'days'}`, actionLabel: 'View deadlines', actionKind: 'scroll', actionTarget: 'cs-sec-deadlines' })
      dateItemFields.add(String(field))
    }
  }

  return { items, dateItemFields }
}

export default function AttentionCard({ client }: { client: Client }) {
  const editHref = `?edit=1`
  const [collapsed, setCollapsed] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [gateItems, setGateItems] = useState<AttnItem[]>([])

  const { items: dateItems, dateItemFields } = useMemo(() => buildDateItems(client), [client])

  const storageKey = `cs-attn-collapsed:${client.id}:${todayKey()}`

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === '1') setCollapsed(true)
    } catch { /* storage unavailable — default expanded */ }
  }, [storageKey])

  const toggleCollapsed = () => {
    setCollapsed(c => {
      const next = !c
      try {
        if (next) localStorage.setItem(storageKey, '1')
        else localStorage.removeItem(storageKey)
      } catch { /* non-fatal */ }
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/sharepoint/files/${client.id}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const files: Array<{ category?: string }> = data.files ?? []
        const hasSig = files.some(f => (SIGNATURE_CATEGORIES as readonly string[]).includes(f.category ?? ''))
        const result = evaluateReadiness(
          {
            eligibility_end_date: client.eligibility_end_date ?? null,
            loc_date: (client as { loc_date?: string | null }).loc_date ?? null,
            pos_status: (client as { pos_status?: string | null }).pos_status ?? null,
            poc_date: (client as { poc_date?: string | null }).poc_date ?? null,
          },
          hasSig
        )
        if (cancelled) return
        const items: AttnItem[] = []
        for (const g of result.gates) {
          if (g.status !== 'fail') continue
          const dedupField = GATE_DEDUP[g.key]
          if (dedupField && dateItemFields.has(dedupField)) continue
          items.push({
            key: `gate-${g.key}`,
            severity: 'amber',
            text: g.detail.replace(/\.$/, ''),
            actionLabel: 'Review',
            actionKind: 'scroll',
            actionTarget: GATE_SCROLL[g.key] ?? 'cs-sec-plans',
          })
        }
        setGateItems(items)
      } catch { /* gates are additive — date items already shown */ }
    })()
    return () => { cancelled = true }
  }, [client, dateItemFields])

  const all = useMemo(() => {
    const merged = [...dateItems, ...gateItems]
    merged.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'red' ? -1 : 1))
    return merged
  }, [dateItems, gateItems])

  if (all.length === 0) return null

  const worst = all[0].severity === 'red' ? RED : AMBER
  const shown = showAll || all.length <= 6 ? all : all.slice(0, 5)
  const hidden = all.length - shown.length

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div
      className="cs-attention-card"
      style={{
        background: 'var(--v2-surface)',
        border: '0.5px solid var(--v2-border-soft)',
        borderLeft: `3px solid ${worst}`,
        borderRadius: 8,
        padding: '12px 14px',
        marginBottom: 14,
      }}
    >
      <button
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          color: 'var(--v2-text)', textAlign: 'left',
        }}
      >
        <AlertTriangle size={15} style={{ color: worst, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {all.length} {all.length === 1 ? 'item needs' : 'items need'} attention
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--v2-text-muted)', display: 'flex' }}>
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </span>
      </button>

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
          {shown.map(item => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--v2-text)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.severity === 'red' ? RED : AMBER, flexShrink: 0 }} />
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text}</span>
              {item.actionLabel && (
                item.actionKind === 'edit' ? (
                  <a href={editHref} style={{ marginLeft: 'auto', fontSize: 12, color: '#1E7CFF', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {item.actionLabel}
                  </a>
                ) : (
                  <button
                    onClick={() => item.actionTarget && scrollTo(item.actionTarget)}
                    style={{ marginLeft: 'auto', fontSize: 12, color: '#1E7CFF', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    {item.actionLabel}
                  </button>
                )
              )}
            </div>
          ))}
          {hidden > 0 && (
            <button
              onClick={() => setShowAll(true)}
              style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--v2-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              +{hidden} more
            </button>
          )}
        </div>
      )}
    </div>
  )
}
