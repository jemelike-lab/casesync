'use client'

// Audit documents — Option A build (Megan 07-31 spec, mock approved).
// A distinct, always-visible home for the documents auditors ask for first:
// SP waivers, SNFs, and signed forms. Pulls the same SharePoint-backed list
// as ClientFiles, filters to the audit categories, and links each row down
// to the full file manager for viewing/downloading. Renders even when empty
// so the missing-document state is visible before an audit, not during one.

import { useEffect, useState } from 'react'
import { Box, Text } from '@mantine/core'
import { FileText, FolderOpen } from 'lucide-react'
import SectionPaper from '../SectionPaper'
import { CATEGORY_LABELS } from '@/lib/document-folders'

const AUDIT_CATEGORIES = new Set(['waiver', 'snf', 'forms_signatures', 'consent_form'])

interface AuditFile {
  id: string
  file_name: string
  category: string
  created_at?: string | null
}

function scrollToFiles() {
  document.getElementById('cs-sec-files')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function AuditDocuments({ clientId }: { clientId: string }) {
  const [files, setFiles] = useState<AuditFile[] | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/sharepoint/files/${clientId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`files ${res.status}`)
        const j = (await res.json()) as { files?: AuditFile[] }
        if (!cancelled) {
          setFiles((j.files ?? []).filter(f => AUDIT_CATEGORIES.has(f.category)))
        }
      } catch {
        if (!cancelled) setFiles([])
      }
    })()
    return () => { cancelled = true }
  }, [clientId])

  const count = files?.length ?? 0

  return (
    <SectionPaper
      title="Audit documents"
      subtitle={files === null ? 'Loading\u2026' : `${count} on file`}
      action={
        <button
          onClick={scrollToFiles}
          style={{
            background: 'transparent', border: '1px solid var(--v2-border-soft)', borderRadius: 8,
            color: 'var(--v2-text-muted)', padding: '5px 10px', fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          <FolderOpen size={13} /> Upload waiver / SNF
        </button>
      }
    >
      <Box style={{ borderTop: '0.5px solid var(--v2-border-soft)' }}>
        {files !== null && count === 0 && (
          <Text fz={13} c="var(--v2-text-muted)" style={{ padding: '12px 0 2px' }}>
            No waivers, SNFs, or signed forms on file yet.
          </Text>
        )}
        {(files ?? []).map((f, i) => (
          <Box
            key={f.id}
            style={{
              display: 'grid', gridTemplateColumns: '20px 1fr auto auto', gap: 12,
              alignItems: 'center', padding: '10px 0',
              borderBottom: i === count - 1 ? 'none' : '0.5px solid var(--v2-border-soft)',
            }}
          >
            <FileText size={16} style={{ color: '#534AB7' }} />
            <Text fz={13} fw={600} c="var(--v2-text)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.file_name}
            </Text>
            <Text
              fz={11} fw={600}
              style={{ background: '#EEEDFE', color: '#3C3489', borderRadius: 6, padding: '2px 8px' }}
            >
              {CATEGORY_LABELS[f.category] ?? f.category}
            </Text>
            <button
              onClick={scrollToFiles}
              style={{
                background: 'transparent', border: 'none', color: '#1E7CFF',
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0,
              }}
            >
              View
            </button>
          </Box>
        ))}
      </Box>
    </SectionPaper>
  )
}
