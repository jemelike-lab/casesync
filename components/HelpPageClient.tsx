'use client'

import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { useState, useEffect } from 'react'
import { Profile } from '@/lib/types'

const GUIDES = [
  {
    key: 'supports_planner',
    label: 'Supports Planner Guide',
    icon: '👤',
    role: 'supports_planner',
    url: '/api/guides?guide=supports-planner',
    filename: 'guide-supports-planner.txt',
  },
  {
    key: 'team_manager',
    label: 'Team Manager Guide',
    icon: '👥',
    role: 'team_manager',
    url: '/api/guides?guide=team-manager',
    filename: 'guide-team-manager.txt',
  },
  {
    key: 'supervisor',
    label: 'Supervisor Guide',
    icon: '🏢',
    role: 'supervisor',
    url: '/api/guides?guide=supervisor',
    filename: 'guide-supervisor.txt',
  },
  {
    key: 'video_script',
    label: 'Video Script',
    icon: '🎬',
    role: null,
    url: '/api/guides?guide=video-script',
    filename: 'video-script.txt',
  },
]

const SHORTCUTS = [
  { key: 'N', action: 'New client' },
  { key: 'C', action: 'Calendar' },
  { key: '/', action: 'Search' },
  { key: '?', action: 'Show shortcuts' },
]

const ACRONYMS = [
  { abbr: 'POS', meaning: 'Place of Service' },
  { abbr: 'POC', meaning: 'Plan of Care' },
  { abbr: 'ATP', meaning: 'Assistive Technology Professional' },
  { abbr: 'LOC', meaning: 'Level of Care' },
  { abbr: 'NF', meaning: 'Nursing Facility' },
  { abbr: 'SP', meaning: 'Supports Planner' },
  { abbr: 'CFC', meaning: 'Community First Choice' },
  { abbr: 'CO', meaning: 'Community Options' },
  { abbr: 'CPAS', meaning: 'Community Personal Assistance Services' },
  { abbr: 'RUG', meaning: 'Resource Utilization Group' },
  { abbr: 'MFP', meaning: 'Money Follows the Person' },
  { abbr: 'NM', meaning: 'Nurse Manager' },
  { abbr: 'LHD', meaning: 'Local Health Department' },
  { abbr: 'LTSS', meaning: 'Long-Term Services and Supports' },
  { abbr: 'DHMH', meaning: 'Dept of Health & Mental Hygiene (now MDH)' },
  { abbr: 'EDD', meaning: 'Expected Discharge Date' },
  { abbr: 'PAA', meaning: 'Prior Authorization Assessment' },
  { abbr: 'DDA', meaning: 'Developmental Disabilities Administration' },
  { abbr: 'ALF', meaning: 'Assisted Living Facility' },
  { abbr: 'PPL', meaning: 'Public Partnerships LLC (FMS)' },
  { abbr: 'CSQ', meaning: 'Client Status Questionnaire' },
  { abbr: 'PCA', meaning: 'Personal Care Aide' },
  { abbr: 'PERS', meaning: 'Personal Emergency Response System' },
  { abbr: 'MMIS', meaning: 'Medicaid Management Information System' },
]

const CONTACTS = [
  {
    name: 'Transition Funds',
    email: 'transitionfunds@blhnurses.com',
    phone: '',
    contact: '',
  },
  {
    name: 'DHMH ATP (A–I)',
    email: 'keshia.turner@maryland.gov',
    phone: '410-767-9738',
    contact: 'Keshia Turner',
  },
  {
    name: 'DHMH ATP (J–Q)',
    email: 'kourtney.jeffers@maryland.gov',
    phone: '410-767-6772',
    contact: 'Kourtney Jeffers',
  },
  {
    name: 'DHMH ATP (R–Z)',
    email: 'amanda.patek@maryland.gov',
    phone: '410-767-9738',
    contact: 'Amanda Patek',
  },
  {
    name: 'Medicaid Long Term Care',
    email: '',
    phone: '410-767-1739',
    contact: '',
  },
]

function slugifyHeading(text: string): string {
  // Keep numeric prefixes (e.g. "1. Getting Started") as part of the id.
  // The guides' Table of Contents links use "#1-getting-started" style anchors.
  return text
    .toLowerCase()
    .trim()
    // convert numeric prefix like "1." to "1" so ids match the TOC
    .replace(/^(\d+)\./, '$1')
    // strip punctuation except spaces/hyphens
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
}

function renderMarkdown(md: string): string {
  if (!md) return ''

  const lines = md.split('\n')
  const output: string[] = []
  let inUl = false
  let inOl = false

  const closeList = () => {
    if (inUl) { output.push('</ul>'); inUl = false }
    if (inOl) { output.push('</ol>'); inOl = false }
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // Headings
    if (line.startsWith('### ')) {
      closeList()
      const raw = line.slice(4)
      const text = inlineMarkdown(raw)
      const id = slugifyHeading(raw)
      output.push(`<h3 id="${id}">${text}</h3>`)
      continue
    }
    if (line.startsWith('## ')) {
      closeList()
      const raw = line.slice(3)
      const text = inlineMarkdown(raw)
      const id = slugifyHeading(raw)
      output.push(`<h2 id="${id}">${text}</h2>`)
      continue
    }
    if (line.startsWith('# ')) {
      closeList()
      const raw = line.slice(2)
      const text = inlineMarkdown(raw)
      const id = slugifyHeading(raw)
      output.push(`<h1 id="${id}">${text}</h1>`)
      continue
    }

    // HR
    if (line.trim() === '---') {
      closeList()
      output.push('<hr />')
      continue
    }

    // Unordered list
    if (/^- /.test(line)) {
      if (!inUl) { output.push('<ul>'); inUl = true }
      if (inOl) { output.push('</ol>'); inOl = false; output.push('<ul>'); inUl = true }
      const text = inlineMarkdown(line.slice(2))
      output.push(`<li>${text}</li>`)
      continue
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      if (!inOl) { output.push('<ol>'); inOl = true }
      if (inUl) { output.push('</ul>'); inUl = false; output.push('<ol>'); inOl = true }
      const text = inlineMarkdown(line.replace(/^\d+\. /, ''))
      output.push(`<li>${text}</li>`)
      continue
    }

    // Blank line
    if (line.trim() === '') {
      closeList()
      output.push('<p></p>')
      continue
    }

    // Regular paragraph
    closeList()
    const text = inlineMarkdown(line)
    output.push(`<p>${text}</p>`)
  }

  closeList()
  return output.join('\n')
}

function inlineMarkdown(text: string): string {
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Links
  // - Internal anchors (#...) and internal routes (/...) should open in the same tab.
  // - External links (http/https) open in a new tab.
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const url = String(href)
    const isAnchor = url.startsWith('#')
    const isInternal = isAnchor || url.startsWith('/')

    // Tag internal anchors so our click handler can smooth-scroll reliably.
    // (Without this, some anchors may not jump depending on timing/layout.)
    if (isInternal) {
      return `<a href="${url}" class="help-link-internal">${label}</a>`
    }

    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })
  return text
}

function LoadingSkeleton() {
  const widths = ['60%', '80%', '72%', '88%', '64%']

  return (
    <div style={{ padding: '24px 0' }}>
      {widths.map((width, i) => (
        <div key={i} style={{
          height: i === 0 ? 32 : i === 1 ? 20 : 16,
          width,
          background: 'var(--surface-2)',
          borderRadius: 6,
          marginBottom: 16,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}

interface Props {
  profile: Profile | null
}

export default function HelpPageClient({ profile }: Props) {
  const role = profile?.role ?? ''

  // Default tab: match user's role, fallback to supports_planner
  const defaultTab = GUIDES.find(g => g.role === role)?.key ?? 'supports_planner'
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [contents, setContents] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  const activeGuide = GUIDES.find(g => g.key === activeTab)!

  useEffect(() => {
    if (contents[activeTab] || loading[activeTab]) return

    setLoading(prev => ({ ...prev, [activeTab]: true }))
    fetch(activeGuide.url)
      .then(r => r.text())
      .then(text => {
        setContents(prev => ({ ...prev, [activeTab]: text }))
        setLoading(prev => ({ ...prev, [activeTab]: false }))
      })
      .catch(() => {
        setContents(prev => ({ ...prev, [activeTab]: '# Error\n\nFailed to load guide. Please try again.' }))
        setLoading(prev => ({ ...prev, [activeTab]: false }))
      })
  }, [activeTab, activeGuide.url, contents, loading])

  // Smooth-scroll internal anchor links inside rendered markdown
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const a = target?.closest?.('a') as HTMLAnchorElement | null
      if (!a) return

      const href = a.getAttribute('href') || ''
      if (!href.startsWith('#')) return

      // Only handle in-page anchors for this help content
      e.preventDefault()
      const id = href.slice(1)
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  function handlePrint() {
    window.print()
  }

  function handleDownload() {
    const text = contents[activeTab] ?? ''
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = activeGuide.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const isLoading = loading[activeTab] && !contents[activeTab]
  const html = contents[activeTab] ? renderMarkdown(contents[activeTab]) : ''

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          header { display: none !important; }
          nav { display: none !important; }
          .help-print-content {
            font-size: 12pt;
            line-height: 1.6;
            color: #000;
            max-width: 100%;
          }
          .help-print-content h1 { font-size: 20pt; margin-bottom: 12pt; }
          .help-print-content h2 { font-size: 16pt; page-break-before: auto; margin-top: 20pt; }
          .help-print-content h3 { font-size: 13pt; margin-top: 14pt; }
          .help-print-content p { margin-bottom: 8pt; }
          .help-print-content ul, .help-print-content ol { margin: 8pt 0 8pt 20pt; }
          .help-print-content li { margin-bottom: 4pt; }
          .help-print-content code {
            font-family: monospace;
            background: #f0f0f0;
            padding: 1pt 3pt;
            border-radius: 2pt;
          }
          .help-print-content hr { border: 0; border-top: 1pt solid #ccc; margin: 16pt 0; }
          .help-quick-ref { page-break-before: always; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .help-tab-btn {
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
          transition: all 0.15s;
          white-space: nowrap;
        }
        .help-tab-btn:hover {
          color: var(--text);
          background: var(--surface-2);
          border-radius: 6px 6px 0 0;
        }
        .help-tab-btn.active {
          color: var(--accent, #007aff);
          border-bottom-color: var(--accent, #007aff);
        }
        .help-card {
          background: var(--surface);
          border: 2px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
          flex: 1;
          min-width: 180px;
        }
        .help-card:hover {
          border-color: var(--accent, #007aff);
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0, 122, 255, 0.15);
        }
        .help-card.highlighted {
          border-color: var(--accent, #007aff);
          background: rgba(0, 122, 255, 0.07);
        }
        .help-content h1 {
          font-size: 26px;
          font-weight: 700;
          margin: 0 0 12px;
          color: var(--text);
          line-height: 1.3;
        }
        .help-content h2 {
          font-size: 20px;
          font-weight: 600;
          margin: 28px 0 10px;
          color: var(--text);
          padding-bottom: 6px;
          border-bottom: 1px solid var(--border);
        }
        .help-content h3 {
          font-size: 16px;
          font-weight: 600;
          margin: 20px 0 8px;
          color: var(--text);
        }
        .help-content p {
          margin: 0 0 12px;
          color: var(--text-secondary);
          line-height: 1.7;
        }
        .help-content p:empty { margin: 4px 0; }
        .help-content ul, .help-content ol {
          margin: 4px 0 12px 20px;
          color: var(--text-secondary);
          line-height: 1.7;
        }
        .help-content li { margin-bottom: 4px; }
        .help-content code {
          font-family: 'SF Mono', 'Fira Code', monospace;
          background: var(--surface-2);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 13px;
          color: var(--accent, #007aff);
        }
        .help-content hr {
          border: none;
          border-top: 1px solid var(--border);
          margin: 24px 0;
        }
        .help-content a {
          color: var(--accent, #007aff);
          text-decoration: none;
        }
        .help-content a:hover { text-decoration: underline; }
        .help-content strong { color: var(--text); }
      `}</style>

      {/* Page header */}
      <div className="no-print" style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
          📚 Help Center
        </h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 15 }}>
          Everything you need to get started with CaseSync
        </p>
      </div>

      {/* Role-based guide cards */}
      <div className="no-print" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
        {GUIDES.filter(g => g.role !== null).map(guide => (
          <div
            key={guide.key}
            className={`help-card ${guide.role === role ? 'highlighted' : ''}`}
            onClick={() => setActiveTab(guide.key)}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>{guide.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: 'var(--text)' }}>
              {guide.label}
            </div>
            {guide.role === role && (
              <div style={{ fontSize: 11, color: 'var(--accent, #007aff)', marginBottom: 8, fontWeight: 500 }}>
                ✓ Your Role
              </div>
            )}
            <button
              onClick={e => { e.stopPropagation(); setActiveTab(guide.key) }}
              style={{
                marginTop: 8,
                background: guide.role === role ? 'var(--accent, #007aff)' : 'var(--surface-2)',
                color: guide.role === role ? '#fff' : 'var(--text)',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              View Guide
            </button>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="no-print" style={{
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        gap: 0,
        flexWrap: 'wrap',
        marginBottom: 0,
      }}>
        {GUIDES.map(guide => (
          <button
            key={guide.key}
            className={`help-tab-btn ${activeTab === guide.key ? 'active' : ''}`}
            onClick={() => setActiveTab(guide.key)}
          >
            {guide.icon} {guide.label}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="no-print" style={{
        display: 'flex',
        gap: 10,
        padding: '12px 0',
        justifyContent: 'flex-end',
        borderBottom: '1px solid var(--border)',
        marginBottom: 24,
      }}>
        <button
          onClick={handleDownload}
          disabled={!contents[activeTab]}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: contents[activeTab] ? 'pointer' : 'not-allowed',
            color: 'var(--text)',
            opacity: contents[activeTab] ? 1 : 0.5,
            transition: 'all 0.15s',
          }}
        >
          📥 Download
        </button>
        <button
          onClick={handlePrint}
          disabled={!contents[activeTab]}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--accent, #007aff)',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: contents[activeTab] ? 'pointer' : 'not-allowed',
            color: '#fff',
            opacity: contents[activeTab] ? 1 : 0.5,
            transition: 'all 0.15s',
          }}
        >
          🖨️ Print / Save as PDF
        </button>
      </div>

      {/* Guide content */}
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div className="help-print-content">
          {/* Print header (only shows when printing) */}
          <div style={{ display: 'none' }} className="print-only">
            <h1 style={{ fontSize: '24pt', marginBottom: 8 }}>CaseSync — {activeGuide.label}</h1>
            <p style={{ color: '#666', marginBottom: 24 }}>Beatrice Loving Heart | blhnurses.com</p>
            <hr />
          </div>

          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <div
              className="help-content"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>

      {isSupervisorLike(role) && (
        <div style={{ maxWidth: 800, margin: '48px auto 0' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            🧭 Assignment Boards
          </h2>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            display: 'grid',
            gap: 18,
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Client Transfer Board</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                Go to <strong>Team</strong>, then open <strong>Transfer Board</strong>. Drag a client from the client list or from one Support Planner column to another Support Planner column to reassign them.
              </div>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Team Manager Board</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                From the same Team area, open <strong>Team Manager Board</strong>. Drag a Support Planner onto a Team Manager column to update that reporting assignment.
              </div>
            </div>
            <div style={{
              background: 'rgba(0,122,255,0.06)',
              border: '1px solid rgba(0,122,255,0.14)',
              borderRadius: 10,
              padding: 14,
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
            }}>
              Supervisor-only: these assignment boards are intended for supervisors. Changes save when you drop, so move deliberately.
            </div>
          </div>
        </div>
      )}

      {/* Quick Reference section */}
      <div className="help-quick-ref" style={{ maxWidth: 800, margin: '48px auto 0' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          ⚡ Quick Reference
        </h2>

        {/* Keyboard shortcuts */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
            ⌨️ Keyboard Shortcuts
          </h3>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            {SHORTCUTS.map((s, i) => (
              <div key={s.key} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 16px',
                borderBottom: i < SHORTCUTS.length - 1 ? '1px solid var(--border)' : 'none',
                gap: 16,
              }}>
                <kbd style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 5,
                  padding: '2px 8px',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text)',
                  minWidth: 32,
                  textAlign: 'center',
                  display: 'inline-block',
                }}>
                  {s.key}
                </kbd>
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{s.action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Acronyms */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
            📖 Common Acronyms
          </h3>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          }}>
            {ACRONYMS.map((a, i) => (
              <div key={a.abbr} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                borderBottom: i < ACRONYMS.length - 1 ? '1px solid var(--border)' : 'none',
                gap: 12,
              }}>
                <span style={{
                  fontWeight: 700,
                  fontSize: 13,
                  color: 'var(--accent, #007aff)',
                  minWidth: 52,
                  fontFamily: 'monospace',
                }}>
                  {a.abbr}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{a.meaning}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Contact directory */}
        <div style={{ marginBottom: 48 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
            📞 Contact Directory
          </h3>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            {CONTACTS.map((c, i) => (
              <div key={c.name} style={{
                padding: '14px 16px',
                borderBottom: i < CONTACTS.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                  {c.name}
                  {c.contact && (
                    <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 13, marginLeft: 8 }}>
                      — {c.contact}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {c.email && (
                    <a href={`mailto:${c.email}`} style={{
                      fontSize: 13,
                      color: 'var(--accent, #007aff)',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}>
                      ✉️ {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone.replace(/-/g, '')}`} style={{
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}>
                      📱 {c.phone}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
