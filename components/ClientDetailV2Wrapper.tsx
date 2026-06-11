'use client'

// =====================================================================
// ClientDetailV2Wrapper
//
// Phase A scaffold (commit 1 of N): frames the existing 892-line
// ClientEditForm with the v2 design system (lavender canvas, identity
// strip, KPI tiles). The legacy form renders unchanged below — future
// commits will extract sections (Deadlines, Notes, Activity Log,
// Documents, Reassignment) out into proper SectionPapers above the
// legacy fallback, shrinking it until it can be removed entirely.
//
// Pattern (canvas, KpiTile, palette) copied verbatim from
// SupportPlannerControlPanelClient.tsx so the new client detail page
// matches the role dashboards.
// =====================================================================

import { Box, Container, Group, Paper, Stack, Text } from '@mantine/core'
import { Phone, CalendarDays, Target, Clock } from 'lucide-react'
import type { ReactNode } from 'react'

import CaseSyncV2MantineProvider from '@/components/casesync-v2/CaseSyncV2MantineProvider'
import ClientEditForm from '@/components/ClientEditForm'
import type { Client, Profile } from '@/lib/types'

interface ClientDetailV2WrapperProps {
  client: Client
  currentUserId: string
  currentProfile: Profile
  planners?: Profile[]
}

// ---------------------------------------------------------------------
// Palette (locked — do not drift)
// ---------------------------------------------------------------------
const COBALT  = { gradient: 'linear-gradient(135deg, #1E7CFF 0%, #2D8BFF 50%, #1A6FEB 100%)', shadow: 'rgba(30,124,255,0.32)' }
const CORAL   = { gradient: 'linear-gradient(135deg, #FF3B5C 0%, #FF5573 50%, #E63350 100%)', shadow: 'rgba(255,59,92,0.32)' }
const AMBER   = { gradient: 'linear-gradient(135deg, #FFA940 0%, #FFB860 50%, #F59E0B 100%)', shadow: 'rgba(255,169,64,0.32)' }
const EMERALD = { gradient: 'linear-gradient(135deg, #10B981 0%, #1AC78A 50%, #059669 100%)', shadow: 'rgba(16,185,129,0.32)' }

// ---------------------------------------------------------------------
// KpiTile (pattern from SupportPlannerControlPanelClient.tsx)
// ---------------------------------------------------------------------
interface KpiTileProps {
  label: string
  value: string | number
  icon: ReactNode
  gradient: string
  shadowColor: string
  subtitle?: string
}

function KpiTile({ label, value, icon, gradient, shadowColor, subtitle }: KpiTileProps) {
  return (
    <Paper
      radius={20}
      p="lg"
      style={{
        background: gradient,
        boxShadow: `0 14px 32px -8px ${shadowColor}`,
        color: '#fff',
        minHeight: 132,
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text fz={12} fw={600} c="rgba(255,255,255,0.92)" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {label}
          </Text>
          <Text fz={36} fw={800} lh={1.05} c="#fff" style={{ letterSpacing: '-0.02em' }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </Text>
          {subtitle && (
            <Text fz={12} fw={500} c="rgba(255,255,255,0.82)" mt={4}>
              {subtitle}
            </Text>
          )}
        </Stack>
        <Box
          style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(255,255,255,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          {icon}
        </Box>
      </Group>
    </Paper>
  )
}

// ---------------------------------------------------------------------
// Deadline field set — mirrors lib/types Client interface.
// Keep flexible (array, not switch) so DDA-specific deadlines can be
// appended later without restructuring this component.
// ---------------------------------------------------------------------
const DEADLINE_FIELDS: Array<{ field: keyof Client; label: string }> = [
  { field: 'eligibility_end_date',     label: 'Eligibility ends'   },
  { field: 'spm_next_due',             label: 'SPM due'            },
  { field: 'three_month_visit_due',    label: '3-month visit'      },
  { field: 'quarterly_waiver_date',    label: 'Quarterly waiver'   },
  { field: 'med_tech_redet_date',      label: 'Med-tech redet.'    },
  { field: 'poc_date',                 label: 'POC'                },
  { field: 'loc_date',                 label: 'LOC'                },
  { field: 'doc_mdh_date',             label: 'DOC → MDH'           },
  { field: 'pos_deadline',             label: 'POS deadline'       },
  { field: 'assessment_due',           label: 'Assessment'         },
  { field: 'thirty_day_letter_date',   label: '30-day letter'      },
  { field: 'drop_in_visit_date',       label: 'Drop-in visit'      },
  { field: 'co_financial_redet_date',  label: 'CO fin. redet.'     },
  { field: 'co_app_date',              label: 'CO app.'            },
  { field: 'mfp_consent_date',         label: 'MFP consent'        },
  { field: 'two57_date',               label: '2-57 form'          },
]

function findNextDeadline(client: Client): { label: string; daysAway: number } | null {
  const now = Date.now()
  let best: { label: string; daysAway: number } | null = null
  for (const { field, label } of DEADLINE_FIELDS) {
    const v = client[field] as string | null | undefined
    if (!v) continue
    const t = new Date(v).getTime()
    if (isNaN(t)) continue
    const daysAway = Math.round((t - now) / 86_400_000)
    if (best === null || daysAway < best.daysAway) best = { label, daysAway }
  }
  return best
}

function colorForDeadline(daysAway: number) {
  if (daysAway < 0)   return CORAL
  if (daysAway <= 7)  return AMBER
  if (daysAway <= 30) return COBALT
  return EMERALD
}

function colorForContact(daysSince: number | null) {
  if (daysSince === null) return COBALT
  if (daysSince >= 14) return CORAL
  if (daysSince >= 7)  return AMBER
  return EMERALD
}

function daysSinceContact(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const t = new Date(dateStr).getTime()
  if (isNaN(t)) return null
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000))
}

// ---------------------------------------------------------------------
// IdentityStrip
// ---------------------------------------------------------------------
function IdentityStrip({ client }: { client: Client }) {
  const initials = ((client.first_name?.[0] ?? '') + (client.last_name?.[0] ?? '')).toUpperCase()

  return (
    <Paper
      radius={20}
      p="lg"
      mb="lg"
      style={{ background: '#fff', boxShadow: '0 4px 20px -6px rgba(43,30,107,0.10)' }}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="md" align="center" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Box
            style={{
              width: 64, height: 64, borderRadius: 16,
              background: COBALT.gradient, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 700, letterSpacing: '0.02em', flexShrink: 0,
            }}
          >
            {initials || '—'}
          </Box>
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text fz={22} fw={700} c="#1a1140" style={{ letterSpacing: '-0.01em' }}>
              {client.first_name} {client.last_name}
            </Text>
            <Text fz={13} fw={500} c="#7969a5">
              {client.client_id ?? '—'}
              {client.eligibility_code ? ` • ${client.eligibility_code}` : ''}
              {client.category ? ` • ${client.category}` : ''}
            </Text>
          </Stack>
        </Group>
      </Group>
    </Paper>
  )
}

// ---------------------------------------------------------------------
// KpiStrip — 4 KPI tiles derived from client deadline / contact fields
// ---------------------------------------------------------------------
function KpiStrip({ client }: { client: Client }) {
  const dSince = daysSinceContact(client.last_contact_date)
  const contactColor = colorForContact(dSince)

  const next = findNextDeadline(client)
  const nextColor = next ? colorForDeadline(next.daysAway) : COBALT

  const goalPct = client.goal_pct ?? 0
  const goalColor = goalPct >= 80 ? EMERALD : goalPct >= 50 ? AMBER : CORAL

  const eligDays = client.eligibility_end_date
    ? Math.round((new Date(client.eligibility_end_date).getTime() - Date.now()) / 86_400_000)
    : null
  const eligColor =
    eligDays === null ? COBALT :
    eligDays < 0      ? CORAL  :
    eligDays < 30     ? AMBER  :
    eligDays < 90     ? COBALT : EMERALD

  const iconStyle = { width: 22, height: 22, color: '#fff' }

  return (
    <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
      <KpiTile
        label="Days since contact"
        value={dSince === null ? '—' : dSince}
        subtitle={dSince === null ? 'no contact logged' : dSince === 1 ? 'day' : 'days'}
        icon={<Phone style={iconStyle} />}
        gradient={contactColor.gradient}
        shadowColor={contactColor.shadow}
      />
      <KpiTile
        label="Next deadline"
        value={next ? (next.daysAway < 0 ? `${Math.abs(next.daysAway)}d late` : `${next.daysAway}d`) : '—'}
        subtitle={next ? next.label : 'no upcoming dates'}
        icon={<CalendarDays style={iconStyle} />}
        gradient={nextColor.gradient}
        shadowColor={nextColor.shadow}
      />
      <KpiTile
        label="Goal %"
        value={`${goalPct}%`}
        subtitle={goalPct >= 80 ? 'on track' : goalPct >= 50 ? 'mid-range' : 'needs attention'}
        icon={<Target style={iconStyle} />}
        gradient={goalColor.gradient}
        shadowColor={goalColor.shadow}
      />
      <KpiTile
        label="Eligibility"
        value={eligDays === null ? '—' : eligDays < 0 ? `${Math.abs(eligDays)}d past` : `${eligDays}d`}
        subtitle={eligDays === null ? 'no end date' : eligDays < 0 ? 'expired' : 'until renewal'}
        icon={<Clock style={iconStyle} />}
        gradient={eligColor.gradient}
        shadowColor={eligColor.shadow}
      />
    </Box>
  )
}

// ---------------------------------------------------------------------
// Main wrapper
// ---------------------------------------------------------------------
export default function ClientDetailV2Wrapper(props: ClientDetailV2WrapperProps) {
  return (
    <CaseSyncV2MantineProvider>
      <Box
        style={{
          background: 'linear-gradient(160deg, #EEF2FC 0%, #F4ECFB 60%, #EDE9FB 100%)',
          margin: '-24px',
          padding: '24px',
          width: 'calc(100% + 48px)',
          minHeight: 'calc(100dvh - 100px)',
        }}
      >
        <Container size={1280} px={0} pb={80}>
          <IdentityStrip client={props.client} />
          <KpiStrip      client={props.client} />

          {/*
            Legacy ClientEditForm preserved unchanged below. Subsequent
            Phase A commits will extract its sections (Deadlines, Notes,
            Activity Log, Documents, Reassignment) into SectionPaper
            components above this fallback, shrinking the legacy form
            until it can be removed.
          */}
          <ClientEditForm {...props} />
        </Container>
      </Box>
    </CaseSyncV2MantineProvider>
  )
}
