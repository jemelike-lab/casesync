'use client'

// Plans & assessments — Phase A extracted section
import { Box, Text } from '@mantine/core'
import { FileText, ClipboardList, ClipboardCheck, TrendingUp, Scale } from 'lucide-react'
import SectionPaper from '../SectionPaper'
import { TextRow, DateRow, BooleanRow, PercentRow } from '../Row'
import type { Client } from '@/lib/types'
import { isAppealActive, APPEAL_STATUS_LABELS, formatDate } from '@/lib/types'

function scrollToFiles() {
  document.getElementById('cs-sec-files')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function PlansAssessments({ client }: { client: Client }) {
  const c = client as Client & {
    pos_status?: string | null
    spm_completed?: boolean | null
    goal_pct?: number | null
  }

  const hasPoc    = !!c.poc_date
  const hasLoc    = !!c.loc_date
  const hasStatus = !!c.pos_status
  const hasSpm    = c.spm_completed !== null && c.spm_completed !== undefined
  const hasGoal   = c.goal_pct !== null && c.goal_pct !== undefined

  // POS appeal block (Megan 08-05): renders when any appeal field is set or
  // an appeal is active via the legacy pos_status "Appealing" value.
  const appealActive = isAppealActive(client)
  const appealStatus = (client.appeal_status ?? '').trim().toLowerCase()
  const hasAppeal = appealActive || (!!appealStatus && appealStatus !== 'none')
    || !!client.appeal_received_date || !!client.appeal_hearing_date || !!client.appeal_decision_date
    || client.services_continuing_during_appeal !== null && client.services_continuing_during_appeal !== undefined

  const count = [hasPoc, hasLoc, hasStatus, hasSpm, hasGoal].filter(Boolean).length + (hasAppeal ? 1 : 0)

  if (count === 0) return null

  const last =
    hasGoal   ? 'goal'   :
    hasSpm    ? 'spm'    :
    hasStatus ? 'status' :
    hasLoc    ? 'loc'    : 'poc'

  return (
    <SectionPaper
      title="Plans & assessments"
      subtitle={`${count} ${count === 1 ? 'entry' : 'entries'}`}
      action={appealActive ? (
        <Text
          fz={12} fw={600}
          style={{ background: '#FAEEDA', color: '#633806', borderRadius: 999, padding: '3px 12px', whiteSpace: 'nowrap' }}
        >
          Paused {'\u2014'} appeal active
        </Text>
      ) : undefined}
    >
      <Box style={{ borderTop: '0.5px solid var(--v2-border-soft)' }}>
        {hasPoc && (
          <DateRow
            Icon={FileText} color="#9333EA"
            label="POC date" value={c.poc_date}
            isLast={last === 'poc'}
          />
        )}
        {hasLoc && (
          <DateRow
            Icon={FileText} color="#0E7490"
            label="LOC date" value={c.loc_date}
            isLast={last === 'loc'}
          />
        )}
        {hasStatus && (
          <TextRow
            Icon={ClipboardList} color="#D97706"
            label="POS status" value={c.pos_status}
            isLast={last === 'status'}
          />
        )}
        {hasSpm && (
          <BooleanRow
            Icon={ClipboardCheck} color="#059669"
            label="SPM completed" value={c.spm_completed}
            isLast={last === 'spm'}
          />
        )}
        {hasGoal && (
          <PercentRow
            Icon={TrendingUp} color="#DB2777"
            label="Goal progress" value={c.goal_pct}
            isLast={last === 'goal'}
          />
        )}
      </Box>
      {hasAppeal && (
        <Box
          style={{
            marginTop: 12, border: '0.5px solid var(--v2-border-soft)', borderRadius: 10,
            padding: '12px 14px', background: 'var(--v2-surface-2, transparent)',
          }}
        >
          <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Scale size={16} style={{ color: '#7C3AED' }} strokeWidth={2.25} />
              <Text fz={14} fw={600} c="var(--v2-text)">Appeal</Text>
            </Box>
            <Text
              fz={12} fw={600}
              style={{
                background: appealActive ? '#E6F1FB' : '#F1EFE8',
                color: appealActive ? '#0C447C' : '#444441',
                borderRadius: 999, padding: '2px 10px',
              }}
            >
              {APPEAL_STATUS_LABELS[appealStatus] ?? (appealActive ? 'Appealing' : 'None')}
            </Text>
          </Box>
          <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 8 }}>
            <Box>
              <Text fz={11.5} c="var(--v2-text-muted)">Appeal received (LTSS)</Text>
              <Text fz={13} fw={600} c="var(--v2-text)">{client.appeal_received_date ? formatDate(client.appeal_received_date) : '\u2014'}</Text>
            </Box>
            <Box>
              <Text fz={11.5} c="var(--v2-text-muted)">Hearing date</Text>
              <Text fz={13} fw={600} c="var(--v2-text)">{client.appeal_hearing_date ? formatDate(client.appeal_hearing_date) : '\u2014'}</Text>
            </Box>
            <Box>
              <Text fz={11.5} c="var(--v2-text-muted)">Decision date</Text>
              <Text fz={13} fw={600} c="var(--v2-text)">{client.appeal_decision_date ? formatDate(client.appeal_decision_date) : '\u2014'}</Text>
            </Box>
          </Box>
          {client.services_continuing_during_appeal !== null && client.services_continuing_during_appeal !== undefined && (
            <Text fz={13} c="var(--v2-text)" style={{ borderTop: '0.5px solid var(--v2-border-soft)', paddingTop: 8, marginBottom: 8 }}>
              {client.services_continuing_during_appeal ? '\u2713 Services continuing during appeal' : '\u2717 Services NOT continuing during appeal'}
              {client.services_continuing_source ? <Text component="span" fz={12} c="var(--v2-text-muted)"> {'\u00b7'} source: {client.services_continuing_source}</Text> : null}
            </Text>
          )}
          <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '0.5px solid var(--v2-border-soft)', paddingTop: 8 }}>
            <Text fz={12.5} c="var(--v2-text-muted)">Appeal letter uploads file under Plans</Text>
            <button
              onClick={scrollToFiles}
              style={{
                background: 'transparent', border: '1px solid var(--v2-border-soft)', borderRadius: 8,
                color: 'var(--v2-text-muted)', padding: '4px 10px', fontSize: 12, cursor: 'pointer',
              }}
            >
              Upload appeal letter
            </button>
          </Box>
          {appealActive && (
            <Text fz={12} c="var(--v2-text-muted)" style={{ marginTop: 8 }}>
              POS items are paused while the appeal is active {'\u2014'} next required action resumes after the decision.
            </Text>
          )}
        </Box>
      )}
    </SectionPaper>
  )
}
