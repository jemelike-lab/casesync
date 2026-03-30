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
  profiles?: { full_name: string | null } | null
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

export default function ClientDocuments({ clientId, currentUserId, currentProfile }: Props) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<ClientDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [category, setCategory] = useState('general')
  const [expiresAt, setExpiresAt] = useState('')
  const [error, setError] = useState('')

  const inputStyle: React.CSSProperties = {
    background: '#1c1c1e', border: '1px solid #333336', borderRadius: 6,
    color: '#f5f5f7', padding: '6px 10px', fontSize: 13, width: '100%', colorScheme: 'dark' as any,
  }
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

  async function fetchDocs() {
    setLoading(true)
    const { data } = await supabase
      .from('client_documents')
      .select('*, profiles!client_documents_uploaded_by_fkey(full_name)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    setDocs((data as ClientDocument[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchDocs() }, [clientId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const ext = file.name.split('.').pop()
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

  async function handleDownload(doc: ClientDocument) {
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

  async function handleDelete(doc: ClientDocument) {
    if (!confirm(`Delete "${doc.file_name}"?`)) return
    await supabase.storage.from('client-documents').remove([doc.file_path])
    await supabase.from('client_documents').delete().eq('id', doc.id)
    await fetchDocs()
  }

  const canDelete = (doc: ClientDocument) =>
    doc.uploaded_by === currentUserId || currentProfile.role === 'supervisor'

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
          {uploading && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>Uploading…</div>}
          {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0' }}>Loading documents…</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0', textAlign: 'center' }}>No documents uploaded yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map(doc => (
            <div key={doc.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px',
            }}>
              <span style={{ fontSize: 20 }}>
                {doc.mime_type?.includes('pdf') ? '📄' : doc.mime_type?.includes('image') ? '🖼️' : doc.mime_type?.includes('sheet') || doc.file_name.endsWith('.xlsx') ? '📊' : '📎'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.file_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ background: 'var(--surface)', borderRadius: 4, padding: '1px 5px' }}>
                    {CATEGORIES.find(c => c.value === doc.category)?.label ?? doc.category}
                  </span>
                  <span>{formatFileSize(doc.file_size)}</span>
                  <span>by {doc.profiles?.full_name ?? 'Unknown'}</span>
                  <span>{formatDate(doc.created_at)}</span>
                  <ExpiryBadge expiresAt={doc.expires_at} />
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
          ))}
        </div>
      )}
    </div>
  )
}
