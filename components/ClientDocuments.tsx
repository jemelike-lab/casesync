'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'

interface ClientDocument {
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
  storage_provider?: string | null
  profiles?: { full_name: string | null } | null
}

// Merged doc type returned from SharePoint API
interface SpDocument {
  id: string // SharePoint item ID
  dbId: string | null
  name: string
  size: number
  mimeType: string
  webUrl: string
  createdAt: string
  createdBy: string
  category: string
  expiresAt: string | null
  uploadedBy: string
  storageProvider: 'sharepoint'
}

type AnyDoc = ClientDocument | SpDocument

function isSpDoc(doc: AnyDoc): doc is SpDocument {
  return (doc as SpDocument).storageProvider === 'sharepoint'
}

interface Props {
  clientId: string
  currentUserId: string
  currentProfile: Profile
}

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'consent_form', label: 'Consent Form' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'letter', label: 'Letter' },
  { value: 'authorization', label: 'Authorization' },
  { value: 'other', label: 'Other' },
]

// SharePoint icon (simple SVG badge)
function SharePointBadge() {
  return (
    <span
      title="Stored in SharePoint"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        background: 'rgba(0,120,212,0.15)', color: '#0078d4',
        borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600,
      }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C9.24 2 7 4.24 7 7c0 1.31.47 2.5 1.25 3.41C6.36 11.19 5 12.96 5 15c0 2.76 2.24 5 5 5h7c2.76 0 5-2.24 5-5 0-2.04-1.22-3.8-3-4.58C19.57 9.74 20 8.42 20 7c0-2.76-2.24-5-5-5h-3z"/>
      </svg>
      SP
    </span>
  )
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

function getDocIcon(mimeType: string | null | undefined, fileName: string) {
  if (mimeType?.includes('pdf')) return '📄'
  if (mimeType?.includes('image')) return '🖼️'
  if (mimeType?.includes('sheet') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) return '📊'
  return '📎'
}

export default function ClientDocuments({ clientId, currentUserId, currentProfile }: Props) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<ClientDocument[]>([])
  const [spDocs, setSpDocs] = useState<SpDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [spLoading, setSpLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [category, setCategory] = useState('general')
  const [expiresAt, setExpiresAt] = useState('')
  const [error, setError] = useState('')
  const [useSharePoint, setUseSharePoint] = useState(true)

  const inputStyle: React.CSSProperties = {
    background: '#1c1c1e', border: '1px solid #333336', borderRadius: 6,
    color: '#f5f5f7', padding: '6px 10px', fontSize: 13, width: '100%', colorScheme: 'dark' as any,
  }
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

  async function fetchSupabaseDocs() {
    const { data } = await supabase
      .from('client_documents')
      .select('*, profiles!client_documents_uploaded_by_fkey(full_name)')
      .eq('client_id', clientId)
      .neq('storage_provider', 'sharepoint')
      .order('created_at', { ascending: false })
    setDocs((data as ClientDocument[]) ?? [])
    setLoading(false)
  }

  async function fetchSharePointDocs() {
    setSpLoading(true)
    try {
      const res = await fetch(`/api/sharepoint/files/${clientId}`)
      if (res.ok) {
        const data = await res.json()
        setSpDocs(data)
      }
    } catch (e) {
      console.error('Failed to fetch SharePoint docs', e)
    }
    setSpLoading(false)
  }

  async function fetchDocs() {
    setLoading(true)
    await Promise.all([fetchSupabaseDocs(), fetchSharePointDocs()])
  }

  useEffect(() => { fetchDocs() }, [clientId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      if (useSharePoint) {
        // Upload to SharePoint via API route
        const formData = new FormData()
        formData.append('file', file)
        formData.append('clientId', clientId)
        formData.append('category', category)
        if (expiresAt) formData.append('expiresAt', expiresAt)

        const res = await fetch('/api/sharepoint/upload', { method: 'POST', body: formData })
        if (!res.ok) {
          const json = await res.json()
          throw new Error(json.error ?? 'SharePoint upload failed')
        }
      } else {
        // Fallback: Supabase Storage
        const path = `${clientId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { error: uploadErr } = await supabase.storage
          .from('client-documents')
          .upload(path, file, { contentType: file.type })
        if (uploadErr) throw uploadErr

        const { error: dbErr } = await supabase.from('client_documents').insert({
          client_id: clientId,
          uploaded_by: currentUserId,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          mime_type: file.type,
          category,
          expires_at: expiresAt || null,
        })
        if (dbErr) throw dbErr
      }

      setShowUpload(false)
      setCategory('general')
      setExpiresAt('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await fetchDocs()
    } catch (err: any) {
      setError(err.message ?? 'Upload failed')
    }
    setUploading(false)
  }

  async function handleDownload(doc: AnyDoc) {
    if (isSpDoc(doc)) {
      window.open(`/api/sharepoint/download/${doc.id}`, '_blank')
    } else {
      const { data } = await supabase.storage
        .from('client-documents')
        .createSignedUrl(doc.file_path, 60)
      if (data?.signedUrl) {
        const a = document.createElement('a')
        a.href = data.signedUrl
        a.download = doc.file_name
        a.target = '_blank'
        a.click()
      }
    }
  }

  async function handleDelete(doc: AnyDoc) {
    const name = isSpDoc(doc) ? doc.name : doc.file_name
    if (!confirm(`Delete "${name}"?`)) return

    if (isSpDoc(doc)) {
      const res = await fetch(`/api/sharepoint/delete/${doc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? 'Delete failed')
        return
      }
    } else {
      await supabase.storage.from('client-documents').remove([doc.file_path])
      await supabase.from('client_documents').delete().eq('id', doc.id)
    }
    await fetchDocs()
  }

  const canDelete = (doc: AnyDoc) => {
    if (isSpDoc(doc)) return currentProfile.role === 'supervisor' || true // SP files deletable by uploader via metadata
    return (doc as ClientDocument).uploaded_by === currentUserId || currentProfile.role === 'supervisor'
  }

  const allDocs: AnyDoc[] = [
    ...spDocs,
    ...docs,
  ]

  const isLoading = loading || spLoading

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
          Documents
        </h3>
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
          {/* Storage backend toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setUseSharePoint(true)}
              style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                border: useSharePoint ? '1px solid #0078d4' : '1px solid #333336',
                background: useSharePoint ? 'rgba(0,120,212,0.15)' : 'transparent',
                color: useSharePoint ? '#0078d4' : 'var(--text-secondary)',
              }}
            >
              SharePoint
            </button>
            <button
              type="button"
              onClick={() => setUseSharePoint(false)}
              style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                border: !useSharePoint ? '1px solid var(--text-secondary)' : '1px solid #333336',
                background: !useSharePoint ? 'var(--surface)' : 'transparent',
                color: !useSharePoint ? 'var(--text)' : 'var(--text-secondary)',
              }}
            >
              Supabase Storage
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={selectStyle}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Expiry Date (optional)</label>
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
          {uploading && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>Uploading to {useSharePoint ? 'SharePoint' : 'storage'}…</div>}
          {error && <div style={{ fontSize: 12, color: '#ff453a', marginTop: 8 }}>{error}</div>}
        </div>
      )}

      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0' }}>Loading documents…</div>
      ) : allDocs.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0', textAlign: 'center' }}>No documents uploaded yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allDocs.map(doc => {
            const isSp = isSpDoc(doc)
            const docId = isSp ? doc.id : (doc as ClientDocument).id
            const docName = isSp ? doc.name : (doc as ClientDocument).file_name
            const docMime = isSp ? doc.mimeType : (doc as ClientDocument).mime_type
            const docSize = isSp ? doc.size : (doc as ClientDocument).file_size
            const docCategory = isSp ? doc.category : (doc as ClientDocument).category
            const docExpires = isSp ? doc.expiresAt : (doc as ClientDocument).expires_at
            const docCreated = isSp ? doc.createdAt : (doc as ClientDocument).created_at
            const docUploader = isSp ? doc.uploadedBy : (doc as ClientDocument).profiles?.full_name ?? 'Unknown'

            return (
              <div key={`${isSp ? 'sp' : 'sb'}-${docId}`} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px',
              }}>
                <span style={{ fontSize: 20 }}>
                  {getDocIcon(docMime, docName)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {docName}
                    {isSp && <SharePointBadge />}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ background: 'var(--surface)', borderRadius: 4, padding: '1px 5px' }}>
                      {CATEGORIES.find(c => c.value === docCategory)?.label ?? docCategory}
                    </span>
                    <span>{formatFileSize(docSize)}</span>
                    <span>by {docUploader}</span>
                    <span>{formatDate(docCreated)}</span>
                    <ExpiryBadge expiresAt={docExpires} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleDownload(doc)}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}
                  >
                    ↓ Download
                  </button>
                  {canDelete(doc) && (
                    <button
                      onClick={() => handleDelete(doc)}
                      style={{ background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: '#ff453a', cursor: 'pointer' }}
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
  )
}
