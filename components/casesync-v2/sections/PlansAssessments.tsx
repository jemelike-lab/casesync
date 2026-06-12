'use client'

// Plans & assessments — Phase A extracted section
import { Box } from '@mantine/core'
import { FileText, ClipboardList, ClipboardCheck, TrendingUp } from 'lucide-react'
import SectionPaper from '../SectionPaper'
import { TextRow, DateRow, BooleanRow, PercentRow } from '../Row'
import type { Client } from '@/lib/types'

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
  const count = [hasPoc, hasLoc, hasStatus, hasSpm, hasGoal].filter(Boolean).length

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
    </SectionPaper>
  )
}
