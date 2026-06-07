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

const CATEGORIES = [
  { value: 'general',        label: 'General' },
  { value: 'intake',         label: 'Intake' },
  { value: 'plan',           label: 'Plan' },
  { value: 'assessment',     label: 'Assessment' },
  { value: 'consent_form',   label: 'Consent Form' },
  { value: 'letter',         label: 'Letter' },
  { value: 'authorization',  label: 'Authorization' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'medical',        label: 'Medical' },
  { value: 'financial',      label: 'Financial' },
  { value: 'other',          label: 'Other' },
]

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

function canPreviewInline(mime: string | null | undefined) {
  if (!mime) return false
  if (mime === 'application/pdf') return true
  if (mime.startsWith('image/')) return true
  return false
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
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 20px',
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
          style={{
            background: 'var(--surface, #1c1c1e)', border: '1px solid #333336',
            borderRadius: 6, padding: '6px 12px', fontSize: 12,
            color: '#f5f5f7', textDecoration: 'none',
          }}
        >
          ↓ Download
        </a>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: '1px solid #333336',
            borderRadius: 6, padding: '6px 12px', fontSize: 12,
            color: '#f5f5f7', cursor: 'pointer',
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
          alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
      >
        {isPdf && (
          <iframe
            src={url}
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
        {!isPdf && !isImage && (
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
  const [category, setCategory] = useState('general')
  const [expiresAt, setExpiresAt] = useState('')
  const [error, setError] = useState('')

  // Viewer state
  const [viewing, setViewing] = useState<{ file: ClientFile; url: string } | null>(null)
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
      const res = await fetch(`/api/clients/${clientId}/files`, { cache: 'no-store' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Failed to load files (${res.status})`)
      }
      const data = await res.json()
      setFiles((data.files ?? []).filter((f: ClientFile) => f.storage_provider !== 'sharepoint'))
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
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('category', category)
      if (expiresAt) form.append('expiresAt', expiresAt)

      const res = await fetch(`/api/clients/${clientId}/files`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Upload failed (${res.status})`)
      }
      setShowUpload(false)
      setCategory('general')
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
      const res = await fetch(`/api/clients/${clientId}/files/${file.id}/view-url`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Could not open file (${res.status})`)
      }
      const { url } = await res.json()
      setViewing({ file, url })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not open file'
      setError(msg)
    } finally {
      setLoadingView(null)
    }
  }

  async function handleDelete(file: ClientFile) {
    if (!confirm(`Permanently delete "${file.file_name}"?`)) return
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}/files/${file.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Delete failed (${res.status})`)
      }
      await fetchFiles()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      setError(msg)
    }
  }

  const elevated =
    currentProfile.role === 'supervisor' || currentProfile.role === 'it'
  const canDelete = (f: ClientFile) =>
    elevated || f.uploaded_by === currentUserId

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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)} style={selectStyle}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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
              disabled={uploading}
              style={{ ...inputStyle, cursor: 'pointer' }}
            />
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
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0' }}>Loading…</div>
        ) : files.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0', textAlign: 'center' }}>
            No files in CaseSync yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {files.map(f => {
              const previewable = canPreviewInline(f.mime_type)
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
                        {CATEGORIES.find(c => c.value === f.category)?.label ?? f.category}
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
                        onClick={() => handleDelete(f)}
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
            })}
          </div>
        )}
      </div>

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
