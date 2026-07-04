'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Profile } from '@/lib/types'

// Shape returned by GET /api/clients/[id]/files
interface ClientFile {
  id: string
  client_id: string
  uploaded_by: string
  file_name: string
  file_path: string
  file_size: number | null
  mime_type: string | null
  category: string
  expires_at: string | null
  created_at: string
  storage_provider: string | null
  profiles?: { full_name: string | null } | null
}

interface Props {
  clientId: string
  currentUserId: string
  currentProfile: Profile
}

// Display labels for every category value that may appear on a row — legacy
// human values, the bot's `ltss`, and the new folder-aligned values. Existing
// rows keep their original granular label; only the upload picker is narrowed.
const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  intake: 'Intake',
  plan: 'Plan',
  assessment: 'Assessment',
  consent_form: 'Consent Form',
  letter: 'Letter',
  authorization: 'Authorization',
  correspondence: 'Correspondence',
  medical: 'Medical',
  financial: 'Financial',
  other: 'Other',
  ltss: 'LTSS',
  co: 'CO',
  forms_signatures: 'Forms & Signatures',
  reporting_review: 'Reporting & Reviews',
}

// Options the upload picker offers — 1:1 with the seven file folders.
const UPLOAD_CATEGORIES = [
  { value: 'intake',           label: 'Intake' },
  { value: 'co',               label: 'CO' },
  { value: 'plan',             label: 'Plans' },
  { value: 'forms_signatures', label: 'Forms & Signatures' },
  { value: 'authorization',    label: 'Authorizations' },
  { value: 'reporting_review', label: 'Reporting & Reviews' },
  { value: 'other',            label: 'Other' },
]

// File folders shown in the Client Files accordion, in display order. Every
// category value (legacy, bot-written, or folder-aligned) resolves to exactly
// one folder via folderOf(); anything unmapped falls through to Other.
const FILE_FOLDERS: { key: string; label: string }[] = [
  { key: 'intake',           label: 'Intake' },
  { key: 'co',               label: 'CO' },
  { key: 'plan',             label: 'Plans' },
  { key: 'forms_signatures', label: 'Forms & Signatures' },
  { key: 'authorization',    label: 'Authorizations' },
  { key: 'reporting_review', label: 'Reporting & Reviews' },
  { key: 'other',            label: 'Other' },
]

// category value -> folder key (mirrors the approved Batch 3 mapping)
const CATEGORY_TO_FOLDER: Record<string, string> = {
  intake: 'intake',
  co: 'co',
  plan: 'plan',
  assessment: 'plan',
  forms_signatures: 'forms_signatures',
  consent_form: 'forms_signatures',
  authorization: 'authorization',
  reporting_review: 'reporting_review',
  correspondence: 'reporting_review',
  letter: 'reporting_review',
  other: 'other',
  general: 'other',
  medical: 'other',
  financial: 'other',
  ltss: 'other',
}

function folderOf(category: string): string {
  return CATEGORY_TO_FOLDER[category] ?? 'other'
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('T')[0].split('-')
  return `${m}/${day}/${y}`
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null
  const diff = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
  if (diff < 0) {
    return <span style={{ background: 'rgba(255,69,58,0.2)', color: '#ff453a', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600 }}>Expired</span>
  }
  if (diff <= 7) {
    return <span style={{ background: 'rgba(255,69,58,0.15)', color: '#ff453a', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600 }}>Exp {formatDate(expiresAt)}</span>
  }
  if (diff <= 30) {
    return <span style={{ background: 'rgba(255,159,10,0.15)', color: '#ff9f0a', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600 }}>Exp {formatDate(expiresAt)}</span>
  }
  return <span style={{ background: 'rgba(48,209,88,0.1)', color: '#30d158', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>Exp {formatDate(expiresAt)}</span>
}

function getDocIcon(mime: string | null | undefined, name: string) {
  if (mime?.includes('pdf')) return '📄'
  if (mime?.startsWith('image/')) return '🖼️'
  if (mime?.includes('sheet') || /\.(xlsx?|csv)$/i.test(name)) return '📊'
  if (mime?.includes('word') || /\.docx?$/i.test(name)) return '📝'
  return '📎'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function canPreviewInline(mime: string | null | undefined, name?: string) {
  if (!mime) return false
  if (mime === 'application/pdf') return true
  if (mime.startsWith('image/')) return true
  // Word
  if (mime === 'application/msword') return true
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true
  if (name && /\.docx?$/i.test(name)) return true
  // Excel
  if (mime === 'application/vnd.ms-excel') return true
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return true
  if (name && /\.xlsx?$/i.test(name)) return true
  return false
}

function isDocx(mime: string | null | undefined, name: string) {
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true
  if (mime === 'application/msword') return true
  return /\.docx?$/i.test(name)
}

function isXlsx(mime: string | null | undefined, name: string) {
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return true
  if (mime === 'application/vnd.ms-excel') return true
  return /\.xlsx?$/i.test(name)
}

// ---------------------------------------------------------------------------
// In-portal viewer modal — renders PDFs and images inline. For other types
// (Word, Excel) the user is offered a download button instead, since we
// don't yet generate PDF previews on the server.
// ---------------------------------------------------------------------------
function FileViewer({
  file,
  url,
  onClose,
}: {
  file: ClientFile
  url: string
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const isPdf = file.mime_type === 'application/pdf'
  const isImage = (file.mime_type ?? '').startsWith('image/')
  const isWordDoc = isDocx(file.mime_type, file.file_name)
  const isExcel = isXlsx(file.mime_type, file.file_name)

  // Office formats render client-side from the signed URL. We lazy-load the
  // converters only when actually needed so the bundle stays small.
  const [officeHtml, setOfficeHtml] = useState<string | null>(null)
  const [officeError, setOfficeError] = useState<string | null>(null)
  const [officeLoading, setOfficeLoading] = useState(false)

  useEffect(() => {
    if (!isWordDoc && !isExcel) return
    let cancelled = false
    setOfficeLoading(true)
    setOfficeError(null)
    setOfficeHtml(null)

    ;(async () => {
      try {
        const res = await fetch(url) // url already carries ?mode=proxy
        if (!res.ok) throw new Error(`Could not fetch file (${res.status})`)
        const buf = await res.arrayBuffer()
        if (cancelled) return

        if (isWordDoc) {
          // Dynamic import — only pulled in when a Word doc is opened
          const mammoth = await import('mammoth')
          const result = await mammoth.convertToHtml({ arrayBuffer: buf })
          if (cancelled) return
          setOfficeHtml(result.value || '<p><em>Document is empty.</em></p>')
        } else if (isExcel) {
          const XLSX = await import('xlsx')
          const wb = XLSX.read(buf, { type: 'array' })
          // Render each sheet as a table
          const parts: string[] = []
          wb.SheetNames.forEach(name => {
            const sheet = wb.Sheets[name]
            const html = XLSX.utils.sheet_to_html(sheet, { id: `sheet-${name}` })
            parts.push(
              `<h3 style="margin:24px 0 8px;font-size:14px;color:#0a84ff;border-bottom:1px solid #eee;padding-bottom:4px;">${escapeHtml(name)}</h3>${html}`
            )
          })
          if (cancelled) return
          setOfficeHtml(parts.join('\n'))
        }
      } catch (err) {
        if (cancelled) return
        setOfficeError(err instanceof Error ? err.message : 'Could not render preview')
      } finally {
        if (!cancelled) setOfficeLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [url, isWordDoc, isExcel])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, rowGap: 8, flexWrap: 'wrap',
          padding: 'calc(10px + env(safe-area-inset-top, 0px)) 16px 10px',
          background: 'rgba(28,28,30,0.95)',
          borderBottom: '1px solid #333336',
          color: '#f5f5f7',
        }}
      >
        <span style={{ fontSize: 18 }}>{getDocIcon(file.mime_type, file.file_name)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.file_name}
          </div>
          <div style={{ fontSize: 11, color: '#a1a1a6', marginTop: 2 }}>
            {formatFileSize(file.file_size)} · {file.mime_type}
          </div>
        </div>
        <a
          href={url}
          download={file.file_name}
          target="_blank"
          rel="noopener"
          style={{
            background: '#1c1c1e', border: '1px solid #333336',
            borderRadius: 8, padding: '10px 14px', fontSize: 13, minHeight: 44,
            display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
            color: '#f5f5f7', textDecoration: 'none', boxSizing: 'border-box',
          }}
        >
          ↓ Download
        </a>
        <button
          onClick={onClose}
          className="cs-viewer-close"
          style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid #4a4a4e',
            borderRadius: 8, padding: '10px 14px', fontSize: 13, minHeight: 44,
            display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
            color: '#f5f5f7', cursor: 'pointer', boxSizing: 'border-box',
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* Body */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          flex: 1, overflow: 'auto', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          padding: '8px 8px calc(8px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {isPdf && (
          <iframe
            src={`${url}#view=FitH`}
            title={file.file_name}
            style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
          />
        )}
        {isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={file.file_name}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        )}
        {(isWordDoc || isExcel) && (
          <div style={{
            background: 'white', color: '#1d1d1f',
            width: '100%', maxWidth: 1100, height: '100%',
            overflow: 'auto', padding: '40px 56px',
            borderRadius: 8, fontFamily: 'system-ui, -apple-system, sans-serif',
            lineHeight: 1.6, fontSize: 14,
          }}>
            {officeLoading && (
              <div style={{ color: '#86868b', textAlign: 'center', padding: 40 }}>
                Rendering preview…
              </div>
            )}
            {officeError && (
              <div style={{ color: '#d32f2f', padding: 20, background: '#fff4f4', borderRadius: 6 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Couldn&apos;t render preview</div>
                <div style={{ fontSize: 13 }}>{officeError}</div>
                <a
                  href={url}
                  download={file.file_name}
                  style={{
                    display: 'inline-block', marginTop: 16,
                    background: '#0a84ff', color: 'white',
                    borderRadius: 6, padding: '8px 14px',
                    fontSize: 13, textDecoration: 'none',
                  }}
                >
                  ↓ Download to open locally
                </a>
              </div>
            )}
            {officeHtml && (
              <div
                className="office-preview"
                // Trusted: officeHtml is generated from the file content by
                // mammoth (Word) or SheetJS (Excel). The file itself comes
                // from our private signed URL and was uploaded by an
                // authorized user.
                dangerouslySetInnerHTML={{ __html: officeHtml }}
              />
            )}
          </div>
        )}
        {!isPdf && !isImage && !isWordDoc && !isExcel && (
          <div style={{ color: '#f5f5f7', textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>{getDocIcon(file.mime_type, file.file_name)}</div>
            <div style={{ fontSize: 16, marginBottom: 8 }}>Preview not available for this file type yet</div>
            <div style={{ fontSize: 13, color: '#a1a1a6', marginBottom: 20 }}>
              In-portal preview for Word and Excel files is coming next. For now, download to view.
            </div>
            <a
              href={url}
              download={file.file_name}
              style={{
                display: 'inline-block',
                background: '#0a84ff', color: 'white',
                borderRadius: 8, padding: '10px 20px',
                fontSize: 14, fontWeight: 500, textDecoration: 'none',
              }}
            >
              ↓ Download {file.file_name}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ClientFiles({ clientId, currentUserId, currentProfile }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<ClientFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [category, setCategory] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [error, setError] = useState('')

  // Folder accordion + toolbar state
  const [fileQuery, setFileQuery] = useState('')
  const [sortMode, setSortMode] = useState<'category' | 'newest'>('category')
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({})

  // Viewer state
  const [viewing, setViewing] = useState<{ file: ClientFile; url: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ClientFile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [loadingView, setLoadingView] = useState<string | null>(null)

  const inputStyle: React.CSSProperties = {
    background: '#1c1c1e', border: '1px solid #333336', borderRadius: 6,
    color: '#f5f5f7', padding: '6px 10px', fontSize: 13, width: '100%',
    colorScheme: 'dark',
  }
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sharepoint/files/${clientId}`, { cache: 'no-store' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Failed to load files (${res.status})`)
      }
      const data = await res.json()
      setFiles(data.files ?? [])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load files'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!category) {
      setError('Please choose a category before uploading.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('clientId', clientId)
      form.append('category', category)
      if (expiresAt) form.append('expiresAt', expiresAt)

      const res = await fetch('/api/sharepoint/upload', {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Upload failed (${res.status})`)
      }
      setShowUpload(false)
      setCategory('')
      setExpiresAt('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await fetchFiles()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setError(msg)
    } finally {
      setUploading(false)
    }
  }

  async function handleView(file: ClientFile) {
    setLoadingView(file.id)
    setError('')
    try {
      // SharePoint: stream via our download route (redirects to a signed URL).
      // PDFs/images render inline; full Office preview gets a same-origin proxy next.
      // Preview via the same-origin proxy stream: the plain route 302s to
      // SharePoint's download.aspx (attachment + frame-blocked), so a PDF/image
      // <iframe> pointed at it renders blank. ?mode=proxy streams the bytes
      // through our origin with the right Content-Type so the viewer renders
      // inline (and the header Download link's download attr is honored).
      setViewing({ file, url: `/api/sharepoint/download/${file.id}?mode=proxy` })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not open file'
      setError(msg)
    } finally {
      setLoadingView(null)
    }
  }

  async function performDelete(file: ClientFile) {
    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/sharepoint/delete/${file.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Delete failed (${res.status})`)
      }
      await fetchFiles()
      setConfirmDelete(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      setError(msg)
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const elevated =
    currentProfile.role === 'supervisor' || currentProfile.role === 'it'
  const canDelete = (f: ClientFile) =>
    elevated || f.uploaded_by === currentUserId

  const renderRow = (f: ClientFile) => {
    const previewable = canPreviewInline(f.mime_type, f.file_name)
    const isLoadingThis = loadingView === f.id
    return (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px',
                }}>
                  <span style={{ fontSize: 20 }}>{getDocIcon(f.mime_type, f.file_name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13, fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        cursor: previewable ? 'pointer' : 'default',
                      }}
                      onClick={previewable ? () => handleView(f) : undefined}
                      title={previewable ? 'Click to preview' : undefined}
                    >
                      {f.file_name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ background: 'var(--surface)', borderRadius: 4, padding: '1px 5px' }}>
                        {CATEGORY_LABELS[f.category] ?? f.category}
                      </span>
                      <span>{formatFileSize(f.file_size)}</span>
                      <span>by {f.profiles?.full_name ?? 'Unknown'}</span>
                      <span>{formatDate(f.created_at)}</span>
                      <ExpiryBadge expiresAt={f.expires_at} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleView(f)}
                      disabled={isLoadingThis}
                      style={{
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '5px 10px', fontSize: 12,
                        color: 'var(--text)', cursor: 'pointer',
                        opacity: isLoadingThis ? 0.5 : 1,
                      }}
                    >
                      {isLoadingThis ? '…' : previewable ? '👁 View' : '↓ Open'}
                    </button>
                    {canDelete(f) && (
                      <button
                        onClick={() => setConfirmDelete(f)}
                        style={{
                          background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)',
                          borderRadius: 6, padding: '5px 10px', fontSize: 12,
                          color: '#ff453a', cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
    )
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Client Files
            </h3>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, opacity: 0.7 }}>
              Files stored in CaseSync · PDFs and images open in-portal
            </div>
          </div>
          <button
            className="btn-primary"
            style={{ fontSize: 12, padding: '6px 14px', minHeight: 32 }}
            onClick={() => setShowUpload(v => !v)}
          >
            {showUpload ? 'Cancel' : '+ Upload'}
          </button>
        </div>

        {showUpload && (
          <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)} style={selectStyle}>
                  <option value="" disabled>Select a category…</option>
                  {UPLOAD_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Expiry date (optional)</label>
                <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xlsx,.xls"
              onChange={handleUpload}
              disabled={uploading || !category}
              style={{ ...inputStyle, cursor: category ? 'pointer' : 'not-allowed', opacity: category ? 1 : 0.5 }}
            />
            {!category && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>
                Choose a category to enable file selection.
              </div>
            )}
            {uploading && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>Uploading…</div>}
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, opacity: 0.7 }}>
              Max 50 MB. PDF, images, Word, Excel.
            </div>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: '#ff453a', marginBottom: 12, padding: 8, background: 'rgba(255,69,58,0.08)', borderRadius: 6 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Loading files" role="status">
            {[0, 1, 2].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px', animation: 'pulseBg 1.6s ease-in-out infinite', animationDelay: `${i * 0.15}s` }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, background: 'var(--surface)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 10, width: `${60 - i * 12}%`, borderRadius: 4, background: 'var(--surface)', marginBottom: 6 }} />
                  <div style={{ height: 8, width: '35%', borderRadius: 4, background: 'var(--surface)' }} />
                </div>
                <div style={{ width: 52, height: 22, borderRadius: 6, background: 'var(--surface)' }} />
              </div>
            ))}
          </div>
        ) : files.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0', textAlign: 'center' }}>
            No files in CaseSync yet
          </div>
        ) : (
          (() => {
            const q = fileQuery.trim().toLowerCase()
            const visible = q
              ? files.filter(f => f.file_name.toLowerCase().includes(q))
              : files
            const toolbar = (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <input
                  value={fileQuery}
                  onChange={e => setFileQuery(e.target.value)}
                  placeholder="Search files by name…"
                  style={{ flex: 1, minWidth: 160, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '6px 10px', fontSize: 13 }}
                />
                <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  {([['category', 'By category'], ['newest', 'Newest first']] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => setSortMode(mode)}
                      style={{
                        fontSize: 12, padding: '6px 12px', border: 'none', cursor: 'pointer',
                        background: sortMode === mode ? 'var(--accent, #2563eb)' : 'var(--surface-2)',
                        color: sortMode === mode ? '#fff' : 'var(--text-secondary)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )
            if (visible.length === 0) {
              return (
                <>
                  {toolbar}
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0', textAlign: 'center' }}>
                    No files match the search.
                  </div>
                </>
              )
            }
            if (sortMode === 'newest') {
              const sorted = [...visible].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
              return (
                <>
                  {toolbar}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sorted.map(renderRow)}
                  </div>
                </>
              )
            }
            const byFolder: Record<string, ClientFile[]> = {}
            for (const f of visible) {
              const k = folderOf(f.category)
              ;(byFolder[k] ??= []).push(f)
            }
            const folders = q
              ? FILE_FOLDERS.filter(fld => (byFolder[fld.key]?.length ?? 0) > 0)
              : FILE_FOLDERS
            return (
              <>
                {toolbar}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {folders.map(fld => {
                    const rows = byFolder[fld.key] ?? []
                    const isOpen = openFolders[fld.key] ?? rows.length > 0
                    return (
                      <div key={fld.key} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        <button
                          onClick={() => setOpenFolders(s => ({ ...s, [fld.key]: !isOpen }))}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                            background: 'var(--surface-2)', border: 'none', cursor: 'pointer',
                            padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text)',
                          }}
                        >
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                          <span style={{ fontSize: 16 }}>📁</span>
                          <span>{fld.label}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', background: 'var(--surface)', borderRadius: 10, padding: '1px 8px' }}>{rows.length}</span>
                        </button>
                        {isOpen && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', background: 'var(--surface)' }}>
                            {rows.length > 0 ? rows.map(renderRow) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                                <span>Nothing in {fld.label} yet.</span>
                                <button
                                  onClick={() => { setCategory(fld.key); setShowUpload(true); setError('') }}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--accent, #2563eb)', fontSize: 12.5, cursor: 'pointer', padding: 0, fontWeight: 600 }}
                                >
                                  Upload the first document
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()
        )}
      </div>

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div role="dialog" aria-modal="true" aria-label="Delete file" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 420, maxWidth: '100%', padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Delete file?</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16, wordBreak: 'break-word' }}>
              <strong style={{ color: 'var(--text)' }}>{confirmDelete.file_name}</strong> will be permanently removed from CaseSync and SharePoint. This can&apos;t be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)} disabled={deleting} style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={() => performDelete(confirmDelete)}
                disabled={deleting}
                className="cs-file-delete-confirm-btn"
                style={{ background: deleting ? 'rgba(255,69,58,0.45)' : '#ff453a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer' }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <FileViewer
          file={viewing.file}
          url={viewing.url}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  )
}
