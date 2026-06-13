'use client'

// =====================================================================
// ClientDetailV2Wrapper — Phase A revision
//
// The wrapper now owns the full client-detail page above the legacy
// ClientEditForm. Layout matches the approved CaseFox-style mockup:
//
//   - Slate canvas (--v2-canvas flipped from lavender to slate)
//   - Breadcrumb
//   - Refined IdentityStrip: 52px square avatar, sentence-case name,
//     CFC pill, ID/eligibility/assignment subtitle. No Edit/Reassign
//     buttons yet — those will be wired in a later commit when the
//     legacy form's editing state can be lifted up cleanly.
//   - StatusRow: 4 restrained white cards with a 3px left-edge accent
//     stripe encoding state (red = overdue, amber = soon, blue = info,
//     emerald = on-track). Replaces the saturated KPI tile gradients.
//   - Deadlines section: extracted from the legacy form, rendered in
//     a SectionPaper. The legacy form receives hideDeadlines={true}.
//
// Subsequent Phase A commits will extract Notes, Activity Log,
// Documents, Reassignment the same way until ClientEditForm is empty.
// =====================================================================

import { Box, Container, Group, Paper, Stack, Text } from '@mantine/core'
import { ArrowLeft } from 'lucide-react'

import CaseSyncV2MantineProvider from '@/components/casesync-v2/CaseSyncV2MantineProvider'
import Deadlines from '@/components/casesync-v2/sections/Deadlines'
import ContactDetails from '@/components/casesync-v2/sections/ContactDetails'
import PlansAssessments from '@/components/casesync-v2/sections/PlansAssessments'
import CoDetails from '@/components/casesync-v2/sections/CoDetails'
import MedTech from '@/components/casesync-v2/sections/MedTech'
import FormsSignatures from '@/components/casesync-v2/sections/FormsSignatures'
import Authorizations from '@/components/casesync-v2/sections/Authorizations'
import ReportingReviews from '@/components/casesync-v2/sections/ReportingReviews'
import Notes from '@/components/casesync-v2/sections/Notes'
import Activity from '@/components/casesync-v2/sections/Activity'
import ClientEditForm from '@/components/ClientEditForm'
import type { Client, Profile } from '@/lib/types'
import { getEligibilityDescription } from '@/lib/eligibility-codes'

interface ClientDetailV2WrapperProps {
  client: Client
  currentUserId: string
  currentProfile: Profile
  planners?: Profile[]
}

// ---------------------------------------------------------------------
// Accent stripes — restrained (not saturated brand grads)
// ---------------------------------------------------------------------
const STATUS = {
  critical: '#E24B4A',
  warning:  '#BA7517',
  info:     '#1E7CFF',
  success:  '#1D9E75',
}

const DEADLINE_FIELDS: Array<{ field: keyof Client; label: string }> = [
  { field: 'eligibility_end_date',    label: 'Eligibility'        },
  { field: 'three_month_visit_due',   label: '3-month visit'      },
  { field: 'quarterly_waiver_date',   label: 'Quarterly waiver'   },
  { field: 'med_tech_redet_date',     label: 'Med-tech redet.'    },
  { field: 'pos_deadline',            label: 'POS deadline'       },
  { field: 'assessment_due',          label: 'Assessment due'     },
  { field: 'doc_mdh_date',            label: 'Doc to MDH'         },
  { field: 'spm_next_due',            label: 'SPM next due'       },
  { field: 'thirty_day_letter_date',  label: '30-day letter'      },
  { field: 'last_contact_date',       label: 'Last contact'       },
  { field: 'co_financial_redet_date', label: 'CO fin. redet.'     },
  { field: 'co_app_date',             label: 'CO app.'            },
  { field: 'mfp_consent_date',        label: 'MFP consent'        },
  { field: 'two57_date',              label: '257 form'           },
  { field: 'poc_date',                label: 'POC'                },
  { field: 'loc_date',                label: 'LOC'                },
  { field: 'drop_in_visit_date',      label: 'Drop-in visit'      },
]

function daysFromNow(dateStr: string): number {
  const t = new Date(dateStr).getTime()
  if (isNaN(t)) return 0
  return Math.round((t - Date.now()) / 86_400_000)
}

function daysSinceContact(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const t = new Date(dateStr).getTime()
  if (isNaN(t)) return null
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000))
}

function findNextDeadline(client: Client): { label: string; days: number } | null {
  let best: { label: string; days: number } | null = null
  for (const { field, label } of DEADLINE_FIELDS) {
    const v = client[field] as string | null | undefined
    if (!v) continue
    const days = daysFromNow(v)
    if (best === null || days < best.days) best = { label, days }
  }
  return best
}

// ---------------------------------------------------------------------
// StatusCard — restrained KPI replacement
// ---------------------------------------------------------------------
function StatusCard({ label, value, subtitle, stripe }: {
  label: string; value: string; subtitle: string; stripe: string
}) {
  return (
    <Paper
      radius={8}
      style={{
        background: 'var(--v2-surface)',
        border: '0.5px solid var(--v2-border-soft)',
        padding: '12px 14px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 3, background: stripe,
      }} />
      <Text
        fz={10}
        c="var(--v2-text-muted)"
        style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}
      >
        {label}
      </Text>
      <Text fz={22} fw={500} c="var(--v2-text)" lh={1.2}>
        {value}
      </Text>
      <Text fz={11} c={stripe} mt={2}>
        {subtitle}
      </Text>
    </Paper>
  )
}

// ---------------------------------------------------------------------
// StatusRow — 4 restrained cards derived from client state
// ---------------------------------------------------------------------
function StatusRow({ client }: { client: Client }) {
  const dSince = daysSinceContact(client.last_contact_date)
  const contactStripe =
    dSince === null  ? STATUS.info :
    dSince >= 14     ? STATUS.critical :
    dSince >= 7      ? STATUS.warning :
                       STATUS.success
  const contactSubtitle =
    dSince === null  ? 'none logged' :
    dSince >= 14     ? 'overdue' :
    dSince >= 7      ? 'follow up soon' :
                       'recent'

  const next = findNextDeadline(client)
  const nextStripe =
    !next             ? STATUS.info :
    next.days < 0     ? STATUS.critical :
    next.days <= 7    ? STATUS.warning :
    next.days <= 30   ? STATUS.info :
                        STATUS.success
  const nextValue =
    !next             ? '\u2014' :
    next.days < 0     ? next.label :
                        `${next.days}d`
  const nextSubtitle =
    !next             ? 'no upcoming dates' :
    next.days < 0     ? `${Math.abs(next.days)} days overdue` :
    next.days === 0   ? 'due today' :
                        next.label

  const goalPct = (client as { goal_pct?: number }).goal_pct ?? 0
  const goalStripe =
    goalPct >= 80 ? STATUS.success :
    goalPct >= 50 ? STATUS.warning :
                    STATUS.critical
  const goalSubtitle =
    goalPct >= 80 ? 'on track' :
    goalPct >= 50 ? 'mid range' :
                    'needs attention'

  const eligDays = client.eligibility_end_date ? daysFromNow(client.eligibility_end_date) : null
  const eligStripe =
    eligDays === null ? STATUS.info :
    eligDays < 0      ? STATUS.critical :
    eligDays < 30     ? STATUS.warning :
                        STATUS.success
  const eligValue =
    eligDays === null ? '\u2014' :
    eligDays < 0      ? `${Math.abs(eligDays)}d` :
                        `${eligDays}d`
  const eligSubtitle =
    eligDays === null ? 'no end date' :
    eligDays < 0      ? 'expired' :
                        'until renewal'

  return (
    <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
      <StatusCard label="Last contact"  value={dSince === null ? '\u2014' : `${dSince}d`} subtitle={contactSubtitle} stripe={contactStripe} />
      <StatusCard label="Next deadline" value={nextValue}                                  subtitle={nextSubtitle}    stripe={nextStripe} />
      <StatusCard label="Goal progress" value={`${goalPct}%`}                              subtitle={goalSubtitle}    stripe={goalStripe} />
      <StatusCard label="Eligibility"   value={eligValue}                                  subtitle={eligSubtitle}    stripe={eligStripe} />
    </Box>
  )
}

// ---------------------------------------------------------------------
// IdentityStrip — refined for CaseFox aesthetic
// ---------------------------------------------------------------------
function IdentityStrip({ client }: { client: Client }) {
  const initials = ((client.first_name?.[0] ?? '') + (client.last_name?.[0] ?? '')).toUpperCase()
  const program = client.category ?? 'CFC'

  return (
    <Paper
      radius={12}
      style={{
        background: 'var(--v2-surface)',
        border: '0.5px solid var(--v2-border-soft)',
        padding: '18px 20px',
        marginBottom: 14,
      }}
    >
      <Group align="center" wrap="nowrap" gap={16}>
        <Box
          style={{
            width: 52, height: 52, borderRadius: 10,
            background: '#1E7CFF', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 500, letterSpacing: '0.02em', flexShrink: 0,
          }}
        >
          {initials || '\u2014'}
        </Box>
        <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
          <Group gap={10} wrap="nowrap" align="center">
            <Text fz={18} fw={500} c="var(--v2-text)" style={{ letterSpacing: '-0.01em' }}>
              {client.first_name} {client.last_name}
            </Text>
            <Box
              style={{
                background: '#E6F1FB', color: '#0C447C',
                fontSize: 10, fontWeight: 500,
                padding: '2px 8px', borderRadius: 4,
                letterSpacing: '0.04em',
              }}
            >
              {program}
            </Box>
          </Group>
          <Group gap={14} wrap="nowrap">
            {client.client_id && (
              <Text fz={12} c="var(--v2-text-muted)">{client.client_id}</Text>
            )}
            {client.eligibility_code && (
              <Text fz={12} c="var(--v2-text-muted)">{client.eligibility_code}</Text>
            )}
            <Text fz={12} c="var(--v2-text)">
              {(client as { assigned_planner_id?: string | null }).assigned_planner_id ? 'Assigned' : 'Unassigned'}
            </Text>
          </Group>
          {client.eligibility_code && getEligibilityDescription(client.eligibility_code) && (
            <Text fz={11} c="var(--v2-text-muted)" style={{ fontStyle: 'italic', letterSpacing: '-0.005em' }}>
              {getEligibilityDescription(client.eligibility_code)}
            </Text>
          )}
        </Stack>
      </Group>
    </Paper>
  )
}

// ---------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------
function Breadcrumb({ client }: { client: Client }) {
  return (
    <Group gap={6} mb={14} align="center" wrap="nowrap">
      <ArrowLeft size={14} style={{ color: 'var(--v2-text-muted)', flexShrink: 0 }} />
      <Text fz={12} c="var(--v2-text-muted)">Dashboard</Text>
      <Text fz={12} c="var(--v2-text-muted)">/</Text>
      <Text fz={12} c="var(--v2-text-muted)">Clients</Text>
      <Text fz={12} c="var(--v2-text-muted)">/</Text>
      <Text fz={12} c="var(--v2-text)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {client.first_name} {client.last_name}
      </Text>
    </Group>
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
          background: 'var(--v2-canvas)',
          margin: '-24px',
          padding: '24px',
          width: 'calc(100% + 48px)',
          minHeight: 'calc(100dvh - 100px)',
        }}
      >
        <Container size={1280} px={0} pb={80}>
          <Breadcrumb    client={props.client} />
          <IdentityStrip client={props.client} />
          <StatusRow     client={props.client} />
          <Deadlines         client={props.client} />
          <ContactDetails    client={props.client} />
          <PlansAssessments  client={props.client} />
          <CoDetails         client={props.client} />
          <MedTech           client={props.client} />
          <FormsSignatures   client={props.client} />
          <Authorizations    client={props.client} />
          <ReportingReviews  client={props.client} />
          <Notes             client={props.client} currentUserId={props.currentUserId} />
          <Activity          client={props.client} />

          {/*
            Legacy ClientEditForm preserved below with hide* props that
            suppress every section extracted so far. As Notes, Activity,
            Documents, Reassignment, etc. are extracted in subsequent
            batches, additional hide* props will be added here until the
            legacy form is empty and can be removed.
          */}
          <ClientEditForm
            {...props}
            hideDeadlines
            hideContactDetails
            hidePlansAssessments
            hideCoDetails
            hideMedTech
            hideFormsSignatures
            hideAuthorizations
            hideReportingReviews
            hideClientInfo
            hideClientDocuments
            hideNotes
            hideActivity
          />
        </Container>
      </Box>
    </CaseSyncV2MantineProvider>
  )
}
