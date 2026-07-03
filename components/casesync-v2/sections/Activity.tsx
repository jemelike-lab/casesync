'use client'

// Activity — Phase A Batch 2 v2 rebuild.
// Data layer lifted from legacy ActivitySection inline function.
// Collapsed-by-default (Josh's pick); click chevron to expand timeline.
// Returns null when no activity logs exist (matches legacy behavior).

import { useState, useEffect } from 'react'
import { Box, Text } from '@mantine/core'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Client, ActivityLog } from '@/lib/types'
import SectionPaper from '../SectionPaper'

interface Props {
  client: Client
}

function formatActivityDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Activity({ client }: Props) {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/clients/${client.id}/activity?limit=20`)
      .then(r => r.json())
      .then(j => { if (j?.entries) setLogs(j.entries as ActivityLog[]) })
      .catch(() => {})
  }, [client.id])

  if (logs.length === 0) return null

  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <SectionPaper
      title="Activity"
      subtitle={`${logs.length} ${logs.length === 1 ? 'event' : 'events'}`}
      action={
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-label={open ? 'Collapse activity log' : 'Expand activity log'}
          aria-expanded={open}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--v2-text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 6,
            borderRadius: 6,
            transition: 'background 120ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--v2-surface-hover, #F1F5F9)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Chevron size={18} strokeWidth={2.25} />
        </button>
      }
    >
      {open && (
        <Box style={{ position: 'relative', paddingLeft: 20, paddingTop: 4 }}>
          {/* Timeline rail */}
          <Box
            style={{
              position: 'absolute',
              left: 5,
              top: 8,
              bottom: 6,
              width: 1,
              background: 'var(--v2-border-soft)',
            }}
          />
          {logs.map((log, idx) => {
            const isFieldChange = !!log.field_name
            const dotColor = isFieldChange ? '#378ADD' : '#94A3B8'
            const isLast = idx === logs.length - 1
            return (
              <Box
                key={log.id}
                style={{
                  position: 'relative',
                  paddingBottom: isLast ? 0 : 14,
                }}
              >
                {/* Timeline dot */}
                <Box
                  style={{
                    position: 'absolute',
                    left: -19,
                    top: 5,
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: dotColor,
                    border: '2px solid var(--v2-surface)',
                    boxSizing: 'border-box',
                  }}
                />
                <Text fz={12} style={{ lineHeight: 1.45 }}>
                  <span style={{ color: '#185FA5', fontWeight: 500 }}>
                    {log.profiles?.full_name ?? 'Someone'}
                  </span>
                  {isFieldChange ? (
                    <>
                      <span style={{ color: 'var(--v2-text-muted)' }}> changed </span>
                      <span style={{ color: 'var(--v2-text)', fontWeight: 500 }}>
                        {log.field_name!.replace(/_/g, ' ')}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--v2-text-muted)' }}> {log.action}</span>
                  )}
                </Text>
                {isFieldChange && (log.old_value || log.new_value) && (
                  <Box
                    style={{
                      marginTop: 5,
                      display: 'flex',
                      gap: 6,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    {log.old_value && (
                      <span
                        style={{
                          fontSize: 11,
                          background: '#FCEBEB',
                          color: '#791F1F',
                          padding: '2px 7px',
                          borderRadius: 3,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {log.old_value}
                      </span>
                    )}
                    {log.old_value && log.new_value && (
                      <span style={{ color: 'var(--v2-text-muted)', fontSize: 11 }}>→</span>
                    )}
                    {log.new_value && (
                      <span
                        style={{
                          fontSize: 11,
                          background: '#EAF3DE',
                          color: '#27500A',
                          padding: '2px 7px',
                          borderRadius: 3,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {log.new_value}
                      </span>
                    )}
                  </Box>
                )}
                <Text fz={11} c="var(--v2-text-muted)" mt={4} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatActivityDate(log.created_at)}
                </Text>
              </Box>
            )
          })}
        </Box>
      )}
    </SectionPaper>
  )
}
