'use client'

import { isSupervisorLike } from '@/lib/roles'
import { scrollToElement } from '@/lib/scroll'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Profile } from '@/lib/types'
import { useTheme } from '@/hooks/useTheme'
import LottieBlock from '@/components/ui/LottieBlock'
import { ANIM } from '@/lib/animations'

const GUIDES = [
  { key: 'supports_planner', label: 'Supports Planner', icon: '👤', role: 'supports_planner', url: '/api/guides?guide=supports-planner', filename: 'guide-supports-planner.txt' },
  { key: 'team_manager', label: 'Team Manager', icon: '👥', role: 'team_manager', url: '/api/guides?guide=team-manager', filename: 'guide-team-manager.txt' },
  { key: 'supervisor', label: 'Supervisor', icon: '🏢', role: 'supervisor', url: '/api/guides?guide=supervisor', filename: 'guide-supervisor.txt' },
]

const SHORTCUTS = [
  { key: 'N', action: 'New client' }, { key: 'C', action: 'Calendar' },
  { key: '/', action: 'Search' }, { key: '?', action: 'Show shortcuts' },
]

const ACRONYMS = [
  { abbr: 'POS', meaning: 'Place of Service' }, { abbr: 'POC', meaning: 'Plan of Care' },
  { abbr: 'ATP', meaning: 'Assistive Technology Professional' }, { abbr: 'LOC', meaning: 'Level of Care' },
  { abbr: 'NF', meaning: 'Nursing Facility' }, { abbr: 'SP', meaning: 'Supports Planner' },
  { abbr: 'CFC', meaning: 'Community First Choice' }, { abbr: 'CO', meaning: 'Community Options' },
  { abbr: 'CPAS', meaning: 'Community Personal Assistance Services' }, { abbr: 'RUG', meaning: 'Resource Utilization Group' },
  { abbr: 'MFP', meaning: 'Money Follows the Person' }, { abbr: 'NM', meaning: 'Nurse Manager' },
  { abbr: 'LHD', meaning: 'Local Health Department' }, { abbr: 'LTSS', meaning: 'Long-Term Services and Supports' },
  { abbr: 'DHMH', meaning: 'Dept of Health & Mental Hygiene (now MDH)' }, { abbr: 'EDD', meaning: 'Expected Discharge Date' },
  { abbr: 'PAA', meaning: 'Prior Authorization Assessment' }, { abbr: 'DDA', meaning: 'Developmental Disabilities Administration' },
  { abbr: 'ALF', meaning: 'Assisted Living Facility' }, { abbr: 'PPL', meaning: 'Public Partnerships LLC (FMS)' },
  { abbr: 'CSQ', meaning: 'Client Status Questionnaire' }, { abbr: 'PCA', meaning: 'Personal Care Aide' },
  { abbr: 'PERS', meaning: 'Personal Emergency Response System' }, { abbr: 'MMIS', meaning: 'Medicaid Management Information System' },
]

const CONTACTS = [
  { name: 'Transition Funds', email: 'transitionfunds@blhnurses.com', phone: '', contact: '' },
  { name: 'DHMH ATP (A–I)', email: 'keshia.turner@maryland.gov', phone: '410-767-9738', contact: 'Keshia Turner' },
  { name: 'DHMH ATP (J–Q)', email: 'kourtney.jeffers@maryland.gov', phone: '410-767-6772', contact: 'Kourtney Jeffers' },
  { name: 'DHMH ATP (R–Z)', email: 'amanda.patek@maryland.gov', phone: '410-767-9738', contact: 'Amanda Patek' },
  { name: 'Medicaid Long Term Care', email: '', phone: '410-767-1739', contact: '' },
]

function slugify(t: string): string {
  return t.toLowerCase().trim().replace(/^(\d+)\./, '$1').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
}
function escHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function inlineMd(t: string): string {
  t = escHtml(t)
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>')
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const url = String(href)
    if (/^(javascript|data|vbscript):/i.test(url.trim())) return label
    if (url.startsWith('#') || url.startsWith('/')) return `<a href="${url}" class="help-link-internal">${label}</a>`
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })
  return t
}

interface Chapter { id: string; title: string; number: number | null; html: string }

function parseChapters(md: string): Chapter[] {
  if (!md) return []
  const lines = md.split('\n')
  const chapters: Chapter[] = []
  let cTitle = '', cId = '', cNum: number | null = null, cLines: string[] = []
  const flush = () => { if (cTitle && cLines.length) chapters.push({ id: cId, title: cTitle, number: cNum, html: renderBlock(cLines) }) }
  for (const line of lines) {
    if (line.startsWith('## ') && !line.includes('Table of Contents')) {
      flush(); cTitle = line.slice(3).trim(); cId = slugify(cTitle)
      const m = cTitle.match(/^(\d+)\./); cNum = m ? parseInt(m[1]) : null; cLines = []
    } else if (!line.startsWith('# ')) { cLines.push(line) }
  }
  flush(); return chapters
}

function renderBlock(lines: string[]): string {
  const o: string[] = []; let inUl = false, inOl = false
  const cl = () => { if (inUl) { o.push('</ul>'); inUl = false } if (inOl) { o.push('</ol>'); inOl = false } }
  for (const line of lines) {
    if (line.startsWith('### ')) { cl(); const r = line.slice(4); o.push(`<h3 id="${slugify(r)}">${inlineMd(r)}</h3>`) }
    else if (line.trim() === '---') { cl() }
    else if (/^- /.test(line)) { if (inOl) { o.push('</ol>'); inOl = false } if (!inUl) { o.push('<ul>'); inUl = true } o.push(`<li>${inlineMd(line.slice(2))}</li>`) }
    else if (/^\d+\. /.test(line)) { if (inUl) { o.push('</ul>'); inUl = false } if (!inOl) { o.push('<ol>'); inOl = true } o.push(`<li>${inlineMd(line.replace(/^\d+\. /, ''))}</li>`) }
    else if (line.trim() === '') { cl() }
    else { cl(); o.push(`<p>${inlineMd(line)}</p>`) }
  }
  cl(); return o.join('\n')
}

interface Props { profile: Profile | null }

export default function HelpPageClient({ profile }: Props) {
  const role = profile?.role ?? ''
  const { theme } = useTheme()
  const lt = theme === 'light'
  const defaultTab = GUIDES.find(g => g.role === role)?.key ?? 'supports_planner'
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [contents, setContents] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set())
  const [activeChapter, setActiveChapter] = useState('')
  const [showQuickRef, setShowQuickRef] = useState(false)

  const activeGuide = GUIDES.find(g => g.key === activeTab)!

  useEffect(() => {
    if (contents[activeTab] || loading[activeTab]) return
    setLoading(prev => ({ ...prev, [activeTab]: true }))
    fetch(activeGuide.url).then(r => r.text()).then(text => {
      setContents(prev => ({ ...prev, [activeTab]: text }))
      setLoading(prev => ({ ...prev, [activeTab]: false }))
      const chs = parseChapters(text)
      if (chs.length) { setOpenChapters(new Set([chs[0].id])); setActiveChapter(chs[0].id) }
    }).catch(() => {
      setContents(prev => ({ ...prev, [activeTab]: '## Error\n\nFailed to load guide.' }))
      setLoading(prev => ({ ...prev, [activeTab]: false }))
    })
  }, [activeTab, activeGuide.url, contents, loading])

  const chapters = contents[activeTab] ? parseChapters(contents[activeTab]) : []

  const toggleChapter = useCallback((id: string) => {
    setOpenChapters(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
    setActiveChapter(id)
    setTimeout(() => { const el = document.getElementById(`ch-${id}`); if (el) scrollToElement(el, 80, 50) }, 50)
  }, [])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.('a') as HTMLAnchorElement | null
      if (!a) return; const href = a.getAttribute('href') || ''
      if (!href.startsWith('#')) return; e.preventDefault()
      const el = document.getElementById(href.slice(1)); if (el) scrollToElement(el, 80, 50)
    }
    document.addEventListener('click', onClick); return () => document.removeEventListener('click', onClick)
  }, [])

  const handlePrint = () => window.print()
  const handleDownload = () => {
    const text = contents[activeTab] ?? ''; const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = activeGuide.filename; a.click(); URL.revokeObjectURL(url)
  }

  const isLoading = loading[activeTab] && !contents[activeTab]
  const cBg = lt ? '#ffffff' : 'var(--surface)'
  const cBorder = lt ? '1.5px solid #E5E7EB' : '1px solid var(--border)'
  const cShadow = lt ? '0 2px 12px rgba(15,23,42,0.08)' : 'none'
  const chipBg = lt ? 'var(--surface-2)' : 'rgba(255,255,255,0.04)'
  const accent = lt ? '#1E7CFF' : 'var(--accent)'
  const accentText = lt ? '#0071e3' : 'var(--accent)'

  return (
    <>
      <style>{`
        @media print { .no-print{display:none!important} header,nav,.mobile-nav{display:none!important} .help-chapter-body{display:block!important} }
        @keyframes helpFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div className="no-print" style={{
          marginBottom: 28, padding: '28px 28px 24px', borderRadius: 20,
          background: lt ? 'linear-gradient(135deg, #1E7CFF 0%, #2D6FE0 50%, #1A5FD0 100%)' : 'linear-gradient(135deg, #0c1a3a 0%, #142244 50%, #0e1630 100%)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: lt ? 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(100,140,255,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Help Center</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}><LottieBlock src={ANIM.heroHelp} size={36} trigger="mount" /> CaseSync User Guide</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '6px 0 0' }}>Select your role below for a tailored walkthrough</p>
          </div>
        </div>

        {/* Role Selector */}
        <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          {GUIDES.map(g => {
            const isA = activeTab === g.key, isR = g.role === role
            return (
              <button key={g.key} onClick={() => { setActiveTab(g.key); setOpenChapters(new Set()); setActiveChapter('') }} style={{
                flex: '1 1 140px', display: 'flex', alignItems: 'center', gap: 10,
                padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
                background: isA ? accent : cBg, border: isA ? 'none' : cBorder,
                boxShadow: isA ? `0 4px 16px ${lt ? 'rgba(30,124,255,0.25)' : 'rgba(0,122,255,0.3)'}` : cShadow,
                color: isA ? '#fff' : 'var(--text)', transition: 'all 0.2s',
              }}>
                <span style={{ fontSize: 24 }}>{g.icon}</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{g.label}</div>
                  {isR && <div style={{ fontSize: 10, fontWeight: 600, color: isA ? 'rgba(255,255,255,0.7)' : accentText, marginTop: 1 }}>Your Role</div>}
                </div>
              </button>
            )
          })}
        </div>

        {/* Action Bar */}
        <div className="no-print" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 20 }}>
          <button onClick={() => setShowQuickRef(!showQuickRef)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: chipBg, border: cBorder, borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
            ⚡ Quick Reference
          </button>
          <button onClick={handleDownload} disabled={!contents[activeTab]} style={{ display: 'flex', alignItems: 'center', gap: 5, background: chipBg, border: cBorder, borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text)', cursor: contents[activeTab] ? 'pointer' : 'not-allowed', opacity: contents[activeTab] ? 1 : 0.5 }}>
            📥 Download
          </button>
          <button onClick={handlePrint} disabled={!contents[activeTab]} style={{ display: 'flex', alignItems: 'center', gap: 5, background: accent, border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#fff', cursor: contents[activeTab] ? 'pointer' : 'not-allowed', opacity: contents[activeTab] ? 1 : 0.5 }}>
            🖨️ Print
          </button>
        </div>

        {/* Quick Reference Panel */}
        {showQuickRef && (
          <div className="no-print" style={{ marginBottom: 24, animation: 'helpFadeIn 0.25s ease', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <div style={{ background: cBg, border: cBorder, borderRadius: 14, padding: 18, boxShadow: cShadow }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--text)' }}>⌨️ Keyboard Shortcuts</h3>
              <div style={{ display: 'grid', gap: 6 }}>
                {SHORTCUTS.map(s => (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <kbd style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 8px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 28, textAlign: 'center' }}>{s.key}</kbd>
                    <span style={{ color: 'var(--text-secondary)' }}>{s.action}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: cBg, border: cBorder, borderRadius: 14, padding: 18, boxShadow: cShadow }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--text)' }}>📖 Common Acronyms</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 12 }}>
                {ACRONYMS.map(a => (
                  <div key={a.abbr} style={{ display: 'flex', gap: 6 }}>
                    <span style={{ fontWeight: 700, color: accentText, fontFamily: 'monospace', minWidth: 40 }}>{a.abbr}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{a.meaning}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: cBg, border: cBorder, borderRadius: 14, padding: 18, boxShadow: cShadow }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--text)' }}>📞 Contact Directory</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {CONTACTS.map(c => (
                  <div key={c.name} style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                      {c.name}{c.contact && <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> — {c.contact}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {c.email && <a href={`mailto:${c.email}`} style={{ color: accentText, textDecoration: 'none' }}>✉️ {c.email}</a>}
                      {c.phone && <span style={{ color: 'var(--text-secondary)' }}>📱 {c.phone}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Booklet */}
        <div className="help-booklet" style={{
          background: cBg, border: cBorder, borderRadius: 18,
          boxShadow: lt ? '0 4px 24px rgba(15,23,42,0.1)' : '0 4px 24px rgba(0,0,0,0.3)',
          overflow: 'hidden', marginBottom: 48,
        }}>
          {/* Spine */}
          <div style={{
            padding: '18px 24px', borderBottom: lt ? '1.5px solid #E5E7EB' : '1px solid var(--border)',
            background: lt ? 'var(--surface-2)' : 'rgba(255,255,255,0.02)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{activeGuide.icon} {activeGuide.label} Guide</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 10 }}>{chapters.length} chapters</span>
            </div>
            <button onClick={() => {
              if (openChapters.size === chapters.length) setOpenChapters(new Set())
              else setOpenChapters(new Set(chapters.map(c => c.id)))
            }} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
              {openChapters.size === chapters.length ? 'Collapse All' : 'Expand All'}
            </button>
          </div>

          {isLoading ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Loading guide...</div>
            </div>
          ) : (
            <div>
              {chapters.map(ch => {
                const isOpen = openChapters.has(ch.id)
                const isAct = activeChapter === ch.id
                return (
                  <div key={ch.id} id={`ch-${ch.id}`}>
                    <button onClick={() => toggleChapter(ch.id)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                      padding: '16px 24px', border: 'none', cursor: 'pointer',
                      color: 'var(--text)',
                      background: isAct ? (lt ? 'rgba(0,113,227,0.04)' : 'rgba(0,122,255,0.06)') : 'transparent',
                      borderBottom: lt ? '1px solid #e8dcc8' : '1px solid rgba(255,255,255,0.04)',
                      transition: 'background 0.15s', textAlign: 'left',
                    }}>
                      {ch.number !== null && (
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: isAct ? accent : (lt ? 'var(--surface-2)' : 'rgba(255,255,255,0.06)'),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 800, color: isAct ? '#fff' : (lt ? '#64748B' : 'var(--text-secondary)'),
                          flexShrink: 0, transition: 'all 0.15s',
                        }}>{ch.number}</div>
                      )}
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: isAct ? accent : (lt ? '#0F172A' : 'var(--text)') }}>
                        {ch.title.replace(/^\d+\.\s*/, '')}
                      </span>
                      <span style={{ fontSize: 12, color: lt ? '#94A3B8' : 'var(--text-secondary)', flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                    </button>
                    {isOpen && (
                      <div className="help-chapter-body" style={{
                        padding: '20px 28px 28px 70px',
                        borderBottom: lt ? '1px solid #e8dcc8' : '1px solid rgba(255,255,255,0.04)',
                        animation: 'helpFadeIn 0.2s ease',
                      }}>
                        <div className="help-content" dangerouslySetInnerHTML={{ __html: ch.html }} style={{ maxWidth: 680 }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .help-content h3 { font-size:15px; font-weight:700; margin:22px 0 8px; color:var(--text); }
        .help-content p { margin:0 0 10px; color:var(--text-secondary); line-height:1.75; font-size:14px; }
        .help-content p:empty { margin:4px 0; }
        .help-content ul,.help-content ol { margin:4px 0 12px 20px; color:var(--text-secondary); line-height:1.75; font-size:14px; }
        .help-content li { margin-bottom:4px; }
        .help-content code { font-family:'SF Mono','Fira Code',monospace; background:var(--surface-2); padding:2px 6px; border-radius:4px; font-size:12px; color:var(--accent); }
        .help-content a { color:var(--accent); text-decoration:none; }
        .help-content a:hover { text-decoration:underline; }
        .help-content strong { color:var(--text); }
      `}</style>
    </>
  )
}
