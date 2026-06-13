'use client'

import { useState, type CSSProperties } from 'react'
import { Brain, Zap, RefreshCw } from 'lucide-react'

// ---------------------------------------------------------------------------
// AIIntelligencePanel — Phase A Batch 3d
//
// AIAskClient + AISummary are lifted VERBATIM from the legacy ClientEditForm
// so the per-client AI surface can be reused in the v2 sticky rail / floating
// widget. Logic is unchanged: AIAskClient -> /api/blhbot/ask,
// AISummary -> /api/client-summary, both with the same 401-refresh retry.
// The legacy form now imports AIAskClient/AISummary from here (single source).
// ---------------------------------------------------------------------------

const inputStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10, color: '#f5f5f7', padding: '8px 12px', fontSize: 13,
  colorScheme: 'dark' as any, width: '100%', boxSizing: 'border-box', outline: 'none',
}

export function AIAskClient({ clientId }: { clientId: string }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ask = async () => {
    if (!question.trim()) return
    setLoading(true); setError(null); setAnswer(null)
    try {
      let res = await fetch('/api/blhbot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: clientId, question: question.trim() }),
      })

      // Auto-retry on 401: refresh the session token and try once more
      if (res.status === 401) {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { error: refreshErr } = await supabase.auth.refreshSession()
        if (!refreshErr) {
          res = await fetch('/api/blhbot/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ id: clientId, question: question.trim() }),
          })
        }
      }

      if (res.status === 401) {
        throw new Error('Session expired — please refresh the page and sign in again')
      }

      if (res.status === 429) {
        throw new Error('BLH Bot is busy — please wait a moment and try again')
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setAnswer(data.answer)
    } catch (err: any) { setError(err.message) } finally { setLoading(false) }
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask() }}
          placeholder="Ask about this client…" style={{ ...inputStyle, flex: 1, fontSize: 12, borderColor: 'rgba(191,90,242,0.2)' }} />
        <button onClick={ask} disabled={loading || !question.trim()} style={{
          background: 'rgba(191,90,242,0.1)', border: '1px solid rgba(191,90,242,0.2)', borderRadius: 10,
          color: '#bf5af2', fontSize: 11, fontWeight: 600, padding: '6px 10px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap',
        }}>{loading ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> …</> : <><Brain size={12} /> Ask</>}</button>
      </div>
      {error && <div style={{ marginTop: 6, fontSize: 11, color: '#ff453a' }}>⚠️ {error}</div>}
      {answer && <div style={{ marginTop: 8, background: 'rgba(191,90,242,0.04)', border: '1px solid rgba(191,90,242,0.12)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{answer}</div>}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export function AISummary({ clientId }: { clientId: string }) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generate = async () => {
    setLoading(true); setError(null); setSummary(null)
    try {
      let res = await fetch('/api/client-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ clientId }),
      })

      // Auto-retry on 401: refresh the session token and try once more
      if (res.status === 401) {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { error: refreshErr } = await supabase.auth.refreshSession()
        if (!refreshErr) {
          res = await fetch('/api/client-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ clientId }),
          })
        }
      }

      if (res.status === 401) {
        throw new Error('Session expired — please refresh the page and sign in again')
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setSummary(data.summary)
    } catch (err: any) { setError(err.message) } finally { setLoading(false) }
  }
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={generate} disabled={loading} style={{
        background: 'rgba(191,90,242,0.08)', border: '1px solid rgba(191,90,242,0.15)', borderRadius: 8,
        color: '#bf5af2', fontSize: 11, fontWeight: 600, padding: '6px 10px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 4, opacity: loading ? 0.6 : 1,
      }}>{loading ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> …</> : <><Zap size={12} /> AI Summary</>}</button>
      {error && <div style={{ marginTop: 6, fontSize: 11, color: '#ff453a' }}>⚠️ {error}</div>}
      {summary && <div style={{ marginTop: 8, background: 'rgba(191,90,242,0.04)', border: '1px solid rgba(191,90,242,0.12)', borderRadius: 10, padding: '10px 12px', fontSize: 12, lineHeight: 1.6, color: 'var(--text)' }}>{summary}</div>}
    </div>
  )
}

export default function AIIntelligencePanel({ clientId }: { clientId: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Brain size={14} style={{ color: '#bf5af2' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#bf5af2', textTransform: 'uppercase', letterSpacing: '0.04em' }}>AI Intelligence</span>
      </div>
      <AIAskClient clientId={clientId} />
      <AISummary clientId={clientId} />
    </div>
  )
}
