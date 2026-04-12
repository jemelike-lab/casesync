'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { Profile } from '@/lib/types'

interface ImportIssue {
  rowNumber: number
  column?: string
  message: string
}

interface ValidationRow {
  rowNumber: number
  client_id: string
  first_name: string | null
  last_name: string
  category: string
  assigned_to_name: string | null
  assigned_to: string | null
}

interface ValidationResponse {
  ok: boolean
  summary: {
    totalRows: number
    validRows?: number
    importedRows?: number
    errorCount?: number
    warningCount: number
  }
  errors?: ImportIssue[]
  warnings?: ImportIssue[]
  rows?: ValidationRow[]
  inserted?: Array<{ id: string; client_id: string }>
  error?: string
}

export default function ClientBatchImportClient({ planners }: { planners: Profile[] }) {
  const [csvText, setCsvText] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ValidationResponse | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [importDone, setImportDone] = useState(false)

  const plannerNames = useMemo(
    () => planners.map(planner => planner.full_name).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))),
    [planners],
  )

  async function readFile(file: File) {
    setSelectedFile(file)
    setFileName(file.name)
    if (file.name.toLowerCase().endsWith('.csv')) {
      const text = await file.text()
      setCsvText(text)
    } else {
      setCsvText('')
    }
    setResult(null)
    setServerError(null)
    setImportDone(false)
  }

  async function submit(mode: 'validate' | 'import') {
    if (!selectedFile && !csvText.trim()) {
      setServerError('Choose an import file first.')
      return
    }

    setBusy(true)
    setServerError(null)
    try {
      const formData = new FormData()
      formData.set('mode', mode)
      if (selectedFile) formData.set('file', selectedFile)
      if (csvText.trim()) formData.set('csvText', csvText)

      const response = await fetch('/api/clients/import', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      setResult(data)
      setImportDone(mode === 'import' && response.ok && data.ok)
      if (!response.ok && data?.error) {
        setServerError(data.error)
      }
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Unexpected import error')
    } finally {
      setBusy(false)
    }
  }

  const canImport = Boolean(result?.ok && (result.summary.validRows ?? 0) > 0 && !importDone)

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', paddingBottom: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/dashboard" style={{ color: '#98989d', textDecoration: 'none', fontSize: 13 }}>
          ← Dashboard
        </Link>
        <span style={{ color: '#3a3a3c' }}>/</span>
        <span style={{ fontSize: 13, color: '#98989d' }}>Client Import</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 6px' }}>Batch import clients</h1>
          <p style={{ color: '#98989d', fontSize: 14, margin: 0, maxWidth: 700 }}>
            Excel-first importer for the CaseSync client template. It validates the upload, resolves planner names to planner ids,
            shows row-level issues, and only inserts after a successful dry run.
          </p>
        </div>
        <a
          href="/clients-import-template.csv"
          download
          style={{
            textDecoration: 'none',
            background: '#2c2c2e',
            border: '1px solid #3a3a3c',
            borderRadius: 10,
            color: '#f5f5f7',
            fontSize: 13,
            fontWeight: 600,
            padding: '10px 14px',
          }}
        >
          Download template
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(300px, 0.8fr)', gap: 18 }}>
        <div style={{ background: '#1c1c1e', borderRadius: 14, border: '1px solid #2c2c2e', padding: 20 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Upload Excel or CSV</h2>
          <input
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (file) await readFile(file)
            }}
            style={{ marginBottom: 14 }}
          />
          {fileName && (
            <div style={{ fontSize: 13, color: '#98989d', marginBottom: 12 }}>
              Loaded: <span style={{ color: '#f5f5f7' }}>{fileName}</span>
            </div>
          )}
          <textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            placeholder="Paste CSV here if needed"
            rows={14}
            style={{
              width: '100%',
              background: '#111113',
              color: '#f5f5f7',
              border: '1px solid #333336',
              borderRadius: 10,
              padding: 12,
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              boxSizing: 'border-box',
              marginBottom: 14,
            }}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={() => submit('validate')} disabled={busy}>
              {busy ? 'Working…' : 'Validate only'}
            </button>
            <button className="btn-primary" onClick={() => submit('import')} disabled={busy || !canImport}>
              {busy ? 'Importing…' : 'Import valid rows'}
            </button>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: '#98989d', lineHeight: 1.6 }}>
            Import stays non-destructive: it inserts new clients only, rejects duplicate client IDs, and never updates existing clients.
          </div>
          {serverError && (
            <div style={{ marginTop: 14, fontSize: 13, color: '#ff453a' }}>{serverError}</div>
          )}
        </div>

        <div style={{ background: '#1c1c1e', borderRadius: 14, border: '1px solid #2c2c2e', padding: 20 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Planner resolution seam</h2>
          <p style={{ color: '#98989d', fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>
            Spreadsheet rows use <code>assigned_to_name</code>. The importer resolves that name against current supports planners.
            Exact full-name match works today; use <code>Unassigned</code> to leave assignment blank.
          </p>
          <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #2c2c2e', borderRadius: 10, padding: 10, background: '#111113' }}>
            {plannerNames.length === 0 ? (
              <div style={{ fontSize: 13, color: '#98989d' }}>No planners available.</div>
            ) : plannerNames.map(name => (
              <div key={name} style={{ fontSize: 13, color: '#f5f5f7', padding: '4px 0', borderBottom: '1px solid #1d1d1f' }}>{name}</div>
            ))}
          </div>
        </div>
      </div>

      {result && (
        <div style={{ marginTop: 18, background: '#1c1c1e', borderRadius: 14, border: '1px solid #2c2c2e', padding: 20 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Validation results</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <SummaryPill label="Rows" value={result.summary.totalRows} />
            {'validRows' in result.summary && <SummaryPill label="Valid" value={result.summary.validRows ?? 0} />}
            {'importedRows' in result.summary && <SummaryPill label="Imported" value={result.summary.importedRows ?? 0} />}
            <SummaryPill label="Errors" value={result.summary.errorCount ?? 0} tone="danger" />
            <SummaryPill label="Warnings" value={result.summary.warningCount} tone="warn" />
          </div>

          {importDone && (
            <div style={{ fontSize: 13, color: '#30d158', marginBottom: 14 }}>
              Import complete. Inserted {result.summary.importedRows ?? 0} new clients.
            </div>
          )}

          {!!result.errors?.length && (
            <IssueTable title="Errors" issues={result.errors} tone="#ff453a" />
          )}
          {!!result.warnings?.length && (
            <IssueTable title="Warnings" issues={result.warnings} tone="#ff9f0a" />
          )}

          {!!result.rows?.length && (
            <div style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>Ready to import</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: '#98989d', textAlign: 'left' }}>
                      <th style={thStyle}>Row</th>
                      <th style={thStyle}>Client ID</th>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Category</th>
                      <th style={thStyle}>Planner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td style={tdStyle}>{row.rowNumber}</td>
                        <td style={tdStyle}>{row.client_id}</td>
                        <td style={tdStyle}>{[row.first_name, row.last_name].filter(Boolean).join(' ')}</td>
                        <td style={tdStyle}>{String(row.category).toUpperCase()}</td>
                        <td style={tdStyle}>{row.assigned_to_name ?? 'Unassigned'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone?: 'danger' | 'warn' }) {
  const color = tone === 'danger' ? '#ff453a' : tone === 'warn' ? '#ff9f0a' : '#64d2ff'
  return (
    <div style={{ background: '#111113', border: '1px solid #2c2c2e', borderRadius: 999, padding: '8px 12px', fontSize: 12 }}>
      <span style={{ color: '#98989d', marginRight: 6 }}>{label}</span>
      <span style={{ color, fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function IssueTable({ title, issues, tone }: { title: string; issues: ImportIssue[]; tone: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>{title}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: '#98989d', textAlign: 'left' }}>
              <th style={thStyle}>Row</th>
              <th style={thStyle}>Column</th>
              <th style={thStyle}>Message</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, index) => (
              <tr key={`${issue.rowNumber}-${issue.column ?? 'general'}-${index}`}>
                <td style={tdStyle}>{issue.rowNumber}</td>
                <td style={{ ...tdStyle, color: '#f5f5f7' }}>{issue.column ?? '—'}</td>
                <td style={{ ...tdStyle, color: tone }}>{issue.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #2c2c2e',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #1d1d1f',
  color: '#d2d2d7',
}
