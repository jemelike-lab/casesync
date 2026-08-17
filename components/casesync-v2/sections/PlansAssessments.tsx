'use client'

// Plans & assessments — Phase A extracted section
import { Box, Text } from '@mantine/core'
import { FileText, ClipboardList, ClipboardCheck, TrendingUp, Scale, CalendarCheck } from 'lucide-react'
import SectionPaper, { SectionEmpty } from '../SectionPaper'
import { TextRow, DateRow, BooleanRow, PercentRow, EventRow } from '../Row'
import type { Client } from '@/lib/types'
import { isAppealActive, isAppealGatingActive, appealDecisionOverdueDays, APPEAL_STATUS_LABELS, formatDate } from '@/lib/types'

function scrollToFiles() {
  document.getElementById('cs-sec-files')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Scroll to Client Files AND open the upload picker with the category
 *  preselected (Josh 08-07: the appeal section had no upload affordance at
 *  all, so planners had no way to file a denial or appeal letter from here). */
function uploadWithCategory(category: string) {
  scrollToFiles()
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('cs:open-upload', { detail: { category } }))
  }, 350)
}

function UploadLetterButtons() {
  const btn: React.CSSProperties = {
    background: 'transparent', border: '1px solid var(--v2-border-soft)', borderRadius: 8,
    color: 'var(--v2-text-muted)', padding: '4px 10px', fontSize: 12, cursor: 'pointer',
  }
  return (
    <Box style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button style={btn} onClick={() => uploadWithCategory('denial')}>Upload denial letter</button>
      <button style={btn} onClick={() => uploadWithCategory('appeal')}>Upload appeal letter</button>
    </Box>
  )
}

export default function PlansAssessments({ client }: { client: Client }) {
  const c = client as Client & {
    pos_status?: string | null
    spm_completed?: boolean | null
    goal_pct?: number | null
  }

  const hasPoc    = !!c.poc_date
  const nfLoc     = (c.nf_loc_date ?? c.loc_date) ?? null
  const cpasLoc   = c.cpas_loc_date ?? null
  const hasLoc    = !!nfLoc || !!cpasLoc
  const hasStatus = !!c.pos_status
  const hasPosEff = !!client.pos_effective_date
  const hasSpm    = c.spm_completed !== null && c.spm_completed !== undefined
  const hasGoal   = c.goal_pct !== null && c.goal_pct !== undefined

  // POS appeal block (Megan 08-05): renders when any appeal field is set or
  // an appeal is active via the legacy pos_status "Appealing" value.
  const appealActive = isAppealActive(client)
  const appealGating = isAppealGatingActive(client)
  const appealDecisionOd = appealDecisionOverdueDays(client)
  const appealStatus = (client.appeal_status ?? '').trim().toLowerCase()
  const hasAppeal = appealActive || (!!appealStatus && appealStatus !== 'none')
  // Discoverability (Megan 08-06): a denied POS is exactly when a planner
  // needs the appeal tracker, so the section must be visible BEFORE any
  // appeal fields are entered - otherwise the feature is invisible.
  const posDenied = (client.pos_status ?? '').trim().toLowerCase() === 'denied'
  // Josh 08-06: the tracker surfaces on any client whose POS is in bad shape,
  // not only denials \u2014 a set-but-not-good status or an overdue POS deadline.
  const posStatusVal = (client.pos_status ?? '').trim().toLowerCase()
  const posOk = ['active', 'approved', 'completed'].includes(posStatusVal)
  const posDeadlineOverdue = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(client.pos_deadline ?? '')
    if (!m) return false
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    const now = new Date()
    return t < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  })()
  const posTroubled = (!!posStatusVal && !posOk) || posDeadlineOverdue
  const showAppealSection = hasAppeal || posDenied || posTroubled
    || !!client.appeal_received_date || !!client.appeal_hearing_date || !!client.appeal_decision_date
    || client.services_continuing_during_appeal !== null && client.services_continuing_during_appeal !== undefined

  const count = [hasPoc, hasLoc, hasStatus, hasPosEff, hasSpm, hasGoal].filter(Boolean).length
    + (showAppealSection ? 1 : 0)

  const isEmpty = count === 0

  const last =
    hasGoal   ? 'goal'   :
    hasSpm    ? 'spm'    :
    hasPosEff ? 'poseff' :
    hasStatus ? 'status' :
    hasLoc    ? 'loc'    : 'poc'

  return (
    <SectionPaper
      title="Plans & assessments"
      subtitle={isEmpty ? 'None on file' : `${count} ${count === 1 ? 'entry' : 'entries'}`}
      action={appealActive && !appealGating && !client.appeal_decision_date ? (
        <Text
          fz={12} fw={600}
          style={{ background: '#FBE6E5', color: '#7C1D1A', borderRadius: 999, padding: '3px 12px', whiteSpace: 'nowrap' }}
        >
          Tracking resumed {'\u2014'} confirm appeal outcome
        </Text>
      ) : appealGating && appealDecisionOd !== null ? (
        <Text
          fz={12} fw={600}
          style={{ background: '#FAEEDA', color: '#633806', borderRadius: 999, padding: '3px 12px', whiteSpace: 'nowrap' }}
        >
          Decision overdue {'\u2014'} {appealDecisionOd}d
        </Text>
      ) : appealGating ? (
        <Text
          fz={12} fw={600}
          style={{ background: '#FAEEDA', color: '#633806', borderRadius: 999, padding: '3px 12px', whiteSpace: 'nowrap' }}
        >
          Paused {'\u2014'} appeal active
        </Text>
      ) : undefined}
    >
      {isEmpty && <SectionEmpty text={'No plan or assessment details on file yet.'} />}
      <Box style={{ borderTop: isEmpty ? 'none' : '0.5px solid var(--v2-border-soft)' }}>
        {hasPoc && (appealActive ? (
          <EventRow
            Icon={FileText} color="#9333EA"
            label={'POC date (paused \u2014 appeal)'} value={c.poc_date}
            isLast={last === 'poc'}
          />
        ) : (
          <DateRow
            Icon={FileText} color="#9333EA"
            label="POC date" value={c.poc_date}
            isLast={last === 'poc'}
          />
        ))}
        {hasLoc && (
          <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '12px 0', borderBottom: last === 'loc' ? 'none' : '0.5px solid var(--v2-border-soft)' }}>
            <Box style={{ border: '0.5px solid var(--v2-border-soft)', borderRadius: 8, padding: '10px 12px' }}>
              <Text fz={11} c="var(--v2-text-muted)" mb={2}>NF LOC</Text>
              <Text fz={15} fw={500}>{nfLoc ?? '\u2014'}</Text>
              {c.loc_status && (
                <Text fz={11} mt={6} span style={{ display: 'inline-block', background: '#FAEEDA', color: '#633806', borderRadius: 6, padding: '2px 8px' }}>{c.loc_status}</Text>
              )}
            </Box>
            <Box style={{ border: '0.5px solid var(--v2-border-soft)', borderRadius: 8, padding: '10px 12px' }}>
              <Text fz={11} c="var(--v2-text-muted)" mb={2}>CPAS LOC</Text>
              <Text fz={15} fw={500}>{cpasLoc ?? '\u2014'}</Text>
            </Box>
          </Box>
        )}
        {hasStatus && (
          <TextRow
            Icon={ClipboardList} color="#D97706"
            label="POS status" value={c.pos_status}
            isLast={last === 'status'}
          />
        )}
        {hasPosEff && (
          <DateRow
            Icon={CalendarCheck} color="#D97706"
            label="POS effective date" value={client.pos_effective_date}
            isLast={last === 'poseff'}
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
      {showAppealSection && !hasAppeal && (
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
              style={{ background: '#F1EFE8', color: '#444441', borderRadius: 999, padding: '2px 10px' }}
            >
              None on file
            </Text>
          </Box>
          <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 8 }}>
            <Box>
              <Text fz={11.5} c="var(--v2-text-muted)">Appeal status</Text>
              <Text fz={13} fw={600} c="var(--v2-text)">{'\u2014'}</Text>
            </Box>
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
            <Box>
              <Text fz={11.5} c="var(--v2-text-muted)">Services continuing</Text>
              <Text fz={13} fw={600} c="var(--v2-text)">
                {client.services_continuing_during_appeal === true ? 'Yes'
                  : client.services_continuing_during_appeal === false ? 'No' : 'Not set'}
              </Text>
            </Box>
            <Box>
              <Text fz={11.5} c="var(--v2-text-muted)">Services-continuing source</Text>
              <Text fz={13} fw={600} c="var(--v2-text)">{client.services_continuing_source || '\u2014'}</Text>
            </Box>
          </Box>
          <Box style={{ borderTop: '0.5px solid var(--v2-border-soft)', paddingTop: 8 }}>
            <Text fz={12} c="var(--v2-text-muted)" mb={8}>
              {posDenied ? 'POS denied' : 'POS needs attention'} {'\u2014'} no appeal on file yet.
              Enter the appeal status and dates in Edit; a tracked appeal pauses POS, med-tech,
              and POC criticals until the decision.
            </Text>
            <UploadLetterButtons />
          </Box>
        </Box>
      )}
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
            <Box>
              <Text fz={11.5} c="var(--v2-text-muted)">Services continuing</Text>
              <Text fz={13} fw={600} c="var(--v2-text)">
                {client.services_continuing_during_appeal === true ? 'Yes'
                  : client.services_continuing_during_appeal === false ? 'No' : 'Not set'}
              </Text>
            </Box>
            <Box>
              <Text fz={11.5} c="var(--v2-text-muted)">Services-continuing source</Text>
              <Text fz={13} fw={600} c="var(--v2-text)">{client.services_continuing_source || '\u2014'}</Text>
            </Box>
          </Box>
          {client.services_continuing_during_appeal !== null && client.services_continuing_during_appeal !== undefined && (
            <Text fz={13} c="var(--v2-text)" style={{ borderTop: '0.5px solid var(--v2-border-soft)', paddingTop: 8, marginBottom: 8 }}>
              {client.services_continuing_during_appeal ? '\u2713 Services continuing during appeal' : '\u2717 Services NOT continuing during appeal'}
              {client.services_continuing_source ? <Text component="span" fz={12} c="var(--v2-text-muted)"> {'\u00b7'} source: {client.services_continuing_source}</Text> : null}
            </Text>
          )}
          <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', borderTop: '0.5px solid var(--v2-border-soft)', paddingTop: 8 }}>
            <Text fz={12.5} c="var(--v2-text-muted)">Denial and appeal letters file under Plans</Text>
            <UploadLetterButtons />
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
