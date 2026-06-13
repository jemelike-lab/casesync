'use client'

// Authorizations — Phase A Batch 1 extracted section.
// Three fields: atp (select), snfs, lease (text).
import { Box } from '@mantine/core'
import { ShieldCheck, Building2, Home } from 'lucide-react'
import SectionPaper from '../SectionPaper'
import { TextRow } from '../Row'
import type { Client } from '@/lib/types'

export default function Authorizations({ client }: { client: Client }) {
  const hasAtp   = !!client.atp
  const hasSnfs  = !!client.snfs
  const hasLease = !!client.lease
  const count = [hasAtp, hasSnfs, hasLease].filter(Boolean).length

  if (count === 0) return null

  const last =
    hasLease ? 'lease' :
    hasSnfs  ? 'snfs'  : 'atp'

  return (
    <SectionPaper
      title="Authorizations"
      subtitle={`${count} ${count === 1 ? 'entry' : 'entries'}`}
    >
      <Box style={{ borderTop: '0.5px solid var(--v2-border-soft)' }}>
        {hasAtp && (
          <TextRow
            Icon={ShieldCheck} color="#7C3AED"
            label="ATP" value={client.atp}
            isLast={last === 'atp'}
          />
        )}
        {hasSnfs && (
          <TextRow
            Icon={Building2} color="#0E7490"
            label="SNFs" value={client.snfs}
            isLast={last === 'snfs'}
          />
        )}
        {hasLease && (
          <TextRow
            Icon={Home} color="#9333EA"
            label="Lease" value={client.lease}
            isLast={last === 'lease'}
          />
        )}
      </Box>
    </SectionPaper>
  )
}
