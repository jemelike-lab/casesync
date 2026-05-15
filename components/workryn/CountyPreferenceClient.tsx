'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  MapPin, CheckCircle2, ChevronDown, Send, Loader2, Star,
  AlertTriangle, Info, Home, Navigation, Plus, X,
} from 'lucide-react'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

interface Props {
  currentUser: { id: string; name: string; email: string; role: string; avatarColor: string }
}

const MD_COUNTIES = [
  'Garrett', 'Allegany', 'Washington', 'Frederick', 'Carroll',
  'Howard', 'Montgomery', 'Baltimore', 'Baltimore City', 'Anne Arundel',
  "Prince George's", 'Charles', 'Calvert', "St. Mary's",
  'Harford', 'Cecil', 'Kent', "Queen Anne's", 'Talbot',
  'Caroline', 'Dorchester', 'Wicomico', 'Somerset', 'Worcester',
]

// Region grouping for the visual layout
const REGIONS: Record<string, { label: string; color: string; counties: string[] }> = {
  western: {
    label: 'Western MD',
    color: '#f59e0b',
    counties: ['Garrett', 'Allegany', 'Washington'],
  },
  central: {
    label: 'Central MD',
    color: '#3b82f6',
    counties: ['Frederick', 'Carroll', 'Howard', 'Montgomery', 'Baltimore', 'Baltimore City'],
  },
  southern: {
    label: 'Southern MD',
    color: '#10b981',
    counties: ["Prince George's", 'Charles', 'Calvert', "St. Mary's"],
  },
  capital: {
    label: 'Capital Region',
    color: '#8b5cf6',
    counties: ['Anne Arundel'],
  },
  upper_eastern: {
    label: 'Upper Eastern Shore',
    color: '#06b6d4',
    counties: ['Harford', 'Cecil', 'Kent', "Queen Anne's"],
  },
  lower_eastern: {
    label: 'Lower Eastern Shore',
    color: '#ec4899',
    counties: ['Talbot', 'Caroline', 'Dorchester', 'Wicomico', 'Somerset', 'Worcester'],
  },
}

function getRegionColor(county: string): string {
  for (const r of Object.values(REGIONS)) {
    if (r.counties.includes(county)) return r.color
  }
  return '#6366f1'
}

export default function CountyPreferenceClient({ currentUser }: Props) {
  const isManager = isManagerOrAbove(currentUser.role)

  const [residence, setResidence] = useState<string>('')
  const [preferred, setPreferred] = useState<string[]>([])
  const [additional, setAdditional] = useState<string[]>([])
  const [excusedFromVisits, setExcusedFromVisits] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [existingSubmission, setExistingSubmission] = useState(false)

  // Load existing preference
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/workryn/evaluations/county-preference')
        if (res.ok) {
          const data = await res.json()
          if (data.preference) {
            setResidence(data.preference.residenceCounty)
            setPreferred(JSON.parse(data.preference.preferredCounties || '[]'))
            setAdditional(JSON.parse(data.preference.additionalCounties || '[]'))
            setExcusedFromVisits(data.preference.excusedFromVisits)
            setNotes(data.preference.notes || '')
            setExistingSubmission(true)
          }
        }
      } catch {}
      setLoading(false)
    })()
  }, [])

  function togglePreferred(county: string) {
    setPreferred(prev =>
      prev.includes(county) ? prev.filter(c => c !== county) : [...prev, county]
    )
  }

  function toggleAdditional(county: string) {
    setAdditional(prev =>
      prev.includes(county) ? prev.filter(c => c !== county) : [...prev, county]
    )
  }

  const canSubmit = residence && (preferred.length >= 2 || excusedFromVisits) && !saving

  async function handleSubmit() {
    if (!canSubmit) return
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/workryn/evaluations/county-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residenceCounty: residence, preferredCounties: preferred, additionalCounties: additional, excusedFromVisits, notes }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Failed to save')
      }
      setSaved(true)
      setExistingSubmission(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save') }
    setSaving(false)
  }

  // Counties already selected in one section shouldn't appear in the other
  const availableForPreferred = MD_COUNTIES.filter(c => c !== residence)
  const availableForAdditional = MD_COUNTIES.filter(c => c !== residence && !preferred.includes(c))

  const allSelected = useMemo(() => {
    const s = new Set<string>()
    if (residence) s.add(residence)
    preferred.forEach(c => s.add(c))
    additional.forEach(c => s.add(c))
    return s
  }, [residence, preferred, additional])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-muted)' }}>
        <Loader2 size={24} className="spin" style={{ marginRight: 10 }} /> Loading…
      </div>
    )
  }

  return (
    <div className="cp-page">
      {/* ── Hero Header ── */}
      <div className="cp-hero">
        <div className="cp-hero-bg" />
        <div className="cp-hero-content">
          <div className="cp-hero-icon">
            <MapPin size={28} />
          </div>
          <h1 className="cp-hero-title">County Preference</h1>
          <p className="cp-hero-sub">
            In our continued effort to ensure your clients are in your preferred jurisdiction,
            please select your county of residence and at least 2 additional counties where you
            would like your clients to be located.
          </p>
          {existingSubmission && (
            <div className="cp-existing-badge">
              <CheckCircle2 size={14} /> Previously submitted — you can update your preferences below
            </div>
          )}
        </div>
      </div>

      <div className="cp-body">
        {/* ── Section 1: County of Residence ── */}
        <section className="cp-section animate-slide-up" style={{ animationDelay: '0ms' }}>
          <div className="cp-section-header">
            <div className="cp-section-num">1</div>
            <div>
              <h2 className="cp-section-title">County of Residence</h2>
              <p className="cp-section-desc">Select the Maryland county where you currently live.</p>
            </div>
            {residence && (
              <span className="cp-selected-badge" style={{ background: `${getRegionColor(residence)}22`, color: getRegionColor(residence), borderColor: `${getRegionColor(residence)}44` }}>
                <Home size={12} /> {residence}
              </span>
            )}
          </div>
          <div className="cp-county-grid">
            {Object.entries(REGIONS).map(([key, region]) => (
              <div key={key} className="cp-region-group">
                <div className="cp-region-label" style={{ color: region.color }}>
                  <span className="cp-region-dot" style={{ background: region.color }} />
                  {region.label}
                </div>
                {region.counties.map(county => {
                  const isSelected = residence === county
                  return (
                    <button
                      key={county} type="button"
                      className={`cp-county-chip focus-ring ${isSelected ? 'selected' : ''}`}
                      onClick={() => setResidence(isSelected ? '' : county)}
                      style={isSelected ? { background: `${region.color}22`, borderColor: region.color, color: region.color } : {}}
                    >
                      {isSelected && <CheckCircle2 size={13} />}
                      {county}
                    </button>
                  )
                })}
              </div>
            ))}
            <div className="cp-region-group">
              <div className="cp-region-label" style={{ color: '#94a3b8' }}>
                <span className="cp-region-dot" style={{ background: '#94a3b8' }} />
                Other
              </div>
              <button
                type="button"
                className={`cp-county-chip focus-ring ${residence === 'Not a Maryland Resident' ? 'selected' : ''}`}
                onClick={() => setResidence(residence === 'Not a Maryland Resident' ? '' : 'Not a Maryland Resident')}
                style={residence === 'Not a Maryland Resident' ? { background: 'rgba(148,163,184,0.2)', borderColor: '#94a3b8', color: '#94a3b8' } : {}}
              >
                {residence === 'Not a Maryland Resident' && <CheckCircle2 size={13} />}
                Not a Maryland Resident
              </button>
            </div>
          </div>
        </section>

        {/* ── Section 2: Preferred Counties ── */}
        <section className="cp-section animate-slide-up" style={{ animationDelay: '80ms' }}>
          <div className="cp-section-header">
            <div className="cp-section-num" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>2</div>
            <div>
              <h2 className="cp-section-title">Preferred Counties for Clients</h2>
              <p className="cp-section-desc">
                Select <strong>at least 2</strong> counties where you would prefer your clients to be located.
              </p>
            </div>
            <span className="cp-count-badge" style={{ color: preferred.length >= 2 ? '#10b981' : '#f59e0b' }}>
              {preferred.length} selected
              {preferred.length < 2 && !excusedFromVisits && <AlertTriangle size={12} style={{ marginLeft: 4 }} />}
            </span>
          </div>

          {/* Excused toggle */}
          <label className="cp-excused-toggle">
            <input type="checkbox" checked={excusedFromVisits} onChange={e => setExcusedFromVisits(e.target.checked)} />
            <div className="cp-excused-slider" />
            <span>Excused from visits</span>
            {excusedFromVisits && <Info size={13} style={{ color: '#f59e0b' }} />}
          </label>

          {!excusedFromVisits && (
            <div className="cp-county-grid">
              {Object.entries(REGIONS).map(([key, region]) => (
                <div key={key} className="cp-region-group">
                  <div className="cp-region-label" style={{ color: region.color }}>
                    <span className="cp-region-dot" style={{ background: region.color }} />
                    {region.label}
                  </div>
                  {region.counties.filter(c => c !== residence).map(county => {
                    const isSelected = preferred.includes(county)
                    return (
                      <button
                        key={county} type="button"
                        className={`cp-county-chip focus-ring ${isSelected ? 'selected' : ''}`}
                        onClick={() => togglePreferred(county)}
                        style={isSelected ? { background: `${region.color}22`, borderColor: region.color, color: region.color } : {}}
                      >
                        {isSelected && <CheckCircle2 size={13} />}
                        {county}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Selected chips display */}
          {preferred.length > 0 && (
            <div className="cp-selected-row">
              <Navigation size={13} style={{ color: '#10b981' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Selected:</span>
              {preferred.map(c => (
                <span key={c} className="cp-mini-chip" style={{ background: `${getRegionColor(c)}22`, color: getRegionColor(c), borderColor: `${getRegionColor(c)}44` }}>
                  {c}
                  <button type="button" onClick={() => togglePreferred(c)} className="cp-chip-x">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ── Section 3: Additional Counties ── */}
        <section className="cp-section animate-slide-up" style={{ animationDelay: '160ms' }}>
          <div className="cp-section-header">
            <div className="cp-section-num" style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>3</div>
            <div>
              <h2 className="cp-section-title">Additional Counties <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8125rem' }}>(Optional)</span></h2>
              <p className="cp-section-desc">Any other counties you would be willing to serve clients in.</p>
            </div>
            {additional.length > 0 && (
              <span className="cp-count-badge" style={{ color: '#c084fc' }}>{additional.length} added</span>
            )}
          </div>
          <div className="cp-county-grid cp-compact-grid">
            {availableForAdditional.map(county => {
              const isSelected = additional.includes(county)
              const color = getRegionColor(county)
              return (
                <button
                  key={county} type="button"
                  className={`cp-county-chip cp-small focus-ring ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleAdditional(county)}
                  style={isSelected ? { background: `${color}22`, borderColor: color, color } : {}}
                >
                  {isSelected ? <CheckCircle2 size={11} /> : <Plus size={11} style={{ opacity: 0.4 }} />}
                  {county}
                </button>
              )
            })}
          </div>
        </section>

        {/* ── Section 4: Notes ── */}
        <section className="cp-section animate-slide-up" style={{ animationDelay: '240ms' }}>
          <div className="cp-section-header">
            <div className="cp-section-num" style={{ background: 'rgba(6,182,212,0.15)', color: '#22d3ee' }}>4</div>
            <div>
              <h2 className="cp-section-title">Additional Notes <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8125rem' }}>(Optional)</span></h2>
              <p className="cp-section-desc">Any special circumstances, scheduling constraints, or travel limitations.</p>
            </div>
          </div>
          <textarea
            className="input focus-ring cp-notes"
            placeholder="e.g., I prefer morning visits, have limited availability on Fridays, etc."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </section>

        {/* ── Summary & Submit ── */}
        <div className="cp-submit-section animate-slide-up" style={{ animationDelay: '320ms' }}>
          {/* Visual summary */}
          <div className="cp-summary">
            <div className="cp-summary-header">
              <Star size={16} style={{ color: '#fbbf24' }} />
              <span>Your Selection Summary</span>
            </div>
            <div className="cp-summary-grid">
              <div className="cp-summary-item">
                <div className="cp-summary-label">Residence</div>
                <div className="cp-summary-value" style={{ color: residence ? getRegionColor(residence) : 'var(--text-muted)' }}>
                  {residence || '—'}
                </div>
              </div>
              <div className="cp-summary-item">
                <div className="cp-summary-label">Preferred ({preferred.length})</div>
                <div className="cp-summary-value" style={{ color: preferred.length >= 2 ? '#10b981' : '#f59e0b' }}>
                  {preferred.length > 0 ? preferred.join(', ') : '—'}
                </div>
              </div>
              {additional.length > 0 && (
                <div className="cp-summary-item">
                  <div className="cp-summary-label">Additional ({additional.length})</div>
                  <div className="cp-summary-value" style={{ color: '#c084fc' }}>{additional.join(', ')}</div>
                </div>
              )}
              {excusedFromVisits && (
                <div className="cp-summary-item">
                  <div className="cp-summary-label">Status</div>
                  <div className="cp-summary-value" style={{ color: '#f59e0b' }}>⚠️ Excused from visits</div>
                </div>
              )}
            </div>
          </div>

          <div className="cp-notice">
            <Info size={14} />
            A copy of your selection will be sent to <strong>Sarah Abbott</strong> (Onboarding Supervisor)
            and saved to your Workryn profile. Only you, your supervisor, and Sarah can view this.
          </div>

          {error && (
            <div className="cp-error">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {saved && (
            <div className="cp-success">
              <CheckCircle2 size={16} />
              <div>
                <strong>County preference saved successfully!</strong>
                <div>A copy has been emailed to Sarah Abbott. You can update this anytime.</div>
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn btn-gradient focus-ring cp-submit-btn"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {saving ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            {existingSubmission ? 'Update Preferences' : 'Submit County Preference'}
          </button>
        </div>
      </div>

      <style>{`
        .cp-page { max-width: 900px; margin: 0 auto; padding-bottom: 48px; }

        /* ── Hero ── */
        .cp-hero {
          position: relative; padding: 40px 32px 32px; margin-bottom: 28px;
          border-radius: 0 0 var(--radius-lg) var(--radius-lg);
          overflow: hidden; background: var(--glass-bg);
          border: 1px solid var(--border-subtle); border-top: none;
        }
        .cp-hero-bg {
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(124,58,237,0.06) 50%, rgba(16,185,129,0.04) 100%);
          pointer-events: none;
        }
        .cp-hero-content { position: relative; z-index: 1; text-align: center; }
        .cp-hero-icon {
          width: 56px; height: 56px; margin: 0 auto 16px;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(37,99,235,0.2), rgba(124,58,237,0.2));
          display: flex; align-items: center; justify-content: center;
          color: var(--brand-light);
          box-shadow: 0 4px 24px rgba(37,99,235,0.2);
        }
        .cp-hero-title {
          font-size: 1.75rem; font-weight: 800; margin: 0 0 8px;
          background: linear-gradient(135deg, #f5f5f7, rgba(255,255,255,0.7));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .cp-hero-sub {
          font-size: 0.9375rem; color: var(--text-muted); line-height: 1.6;
          max-width: 640px; margin: 0 auto;
        }
        .cp-existing-badge {
          display: inline-flex; align-items: center; gap: 6px;
          margin-top: 14px; padding: 6px 14px; border-radius: 99px;
          background: rgba(16,185,129,0.1); color: #34d399;
          font-size: 0.8125rem; font-weight: 600;
        }

        /* ── Body ── */
        .cp-body { padding: 0 32px; display: flex; flex-direction: column; gap: 20px; }

        /* ── Sections ── */
        .cp-section {
          background: var(--glass-bg); backdrop-filter: var(--glass-blur);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
          padding: 20px 24px; transition: border-color var(--transition-smooth);
        }
        .cp-section:hover { border-color: var(--border-default); }
        .cp-section-header {
          display: flex; align-items: flex-start; gap: 14px; margin-bottom: 16px;
        }
        .cp-section-num {
          width: 32px; height: 32px; border-radius: 8px;
          background: rgba(37,99,235,0.15); color: var(--brand-light);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.875rem; font-weight: 800; flex-shrink: 0;
        }
        .cp-section-title {
          font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0;
        }
        .cp-section-desc {
          font-size: 0.8125rem; color: var(--text-muted); margin: 3px 0 0; line-height: 1.4;
        }
        .cp-selected-badge {
          display: inline-flex; align-items: center; gap: 6px; margin-left: auto;
          padding: 4px 12px; border-radius: 8px; border: 1px solid;
          font-size: 0.8125rem; font-weight: 700; white-space: nowrap;
        }
        .cp-count-badge {
          margin-left: auto; font-size: 0.8125rem; font-weight: 700;
          display: flex; align-items: center; gap: 4px; white-space: nowrap;
        }

        /* ── County chips ── */
        .cp-county-grid {
          display: flex; flex-wrap: wrap; gap: 6px;
        }
        .cp-region-group {
          display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
          width: 100%; margin-bottom: 6px;
        }
        .cp-region-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 0.6875rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; width: 100%; margin-bottom: 2px;
        }
        .cp-region-dot { width: 8px; height: 8px; border-radius: 2px; }
        .cp-county-chip {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 7px 14px; border-radius: 8px;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          color: var(--text-secondary); font-size: 0.8125rem; font-weight: 500;
          cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .cp-county-chip:hover {
          border-color: var(--border-default); background: var(--bg-hover);
          transform: translateY(-1px);
        }
        .cp-county-chip.selected { font-weight: 700; }
        .cp-county-chip.cp-small { padding: 5px 10px; font-size: 0.75rem; }
        .cp-compact-grid { gap: 5px; }

        /* ── Selected row ── */
        .cp-selected-row {
          display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
          margin-top: 12px; padding: 10px 12px;
          background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.15);
          border-radius: var(--radius-sm);
        }
        .cp-mini-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px; border-radius: 6px; border: 1px solid;
          font-size: 0.75rem; font-weight: 600;
        }
        .cp-chip-x {
          display: inline-flex; align-items: center; justify-content: center;
          width: 14px; height: 14px; border-radius: 50%;
          background: rgba(255,255,255,0.1); border: none; cursor: pointer;
          color: inherit; padding: 0; margin-left: 2px;
        }
        .cp-chip-x:hover { background: rgba(255,255,255,0.2); }

        /* ── Excused toggle ── */
        .cp-excused-toggle {
          display: flex; align-items: center; gap: 10px; cursor: pointer;
          margin-bottom: 12px; font-size: 0.875rem; color: var(--text-secondary);
          font-weight: 500;
        }
        .cp-excused-toggle input { display: none; }
        .cp-excused-slider {
          width: 40px; height: 22px; border-radius: 11px;
          background: var(--bg-overlay); border: 1px solid var(--border-default);
          position: relative; transition: all 0.2s;
        }
        .cp-excused-slider::after {
          content: ''; position: absolute; top: 2px; left: 2px;
          width: 16px; height: 16px; border-radius: 50%;
          background: var(--text-muted); transition: all 0.2s;
        }
        .cp-excused-toggle input:checked + .cp-excused-slider {
          background: rgba(245,158,11,0.2); border-color: #f59e0b;
        }
        .cp-excused-toggle input:checked + .cp-excused-slider::after {
          left: 20px; background: #fbbf24;
        }

        /* ── Notes ── */
        .cp-notes { min-height: 80px; resize: vertical; width: 100%; }

        /* ── Submit ── */
        .cp-submit-section {
          background: var(--glass-bg); backdrop-filter: var(--glass-blur);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
          padding: 24px; display: flex; flex-direction: column; gap: 16px;
        }
        .cp-summary {
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md); overflow: hidden;
        }
        .cp-summary-header {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 16px; font-size: 0.8125rem; font-weight: 700;
          color: var(--text-secondary); text-transform: uppercase;
          letter-spacing: 0.04em; border-bottom: 1px solid var(--border-subtle);
          background: rgba(255,255,255,0.015);
        }
        .cp-summary-grid { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
        .cp-summary-item {}
        .cp-summary-label {
          font-size: 0.6875rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 3px;
        }
        .cp-summary-value { font-size: 0.875rem; font-weight: 600; line-height: 1.4; }
        .cp-notice {
          display: flex; align-items: flex-start; gap: 8px;
          font-size: 0.8125rem; color: var(--text-muted); line-height: 1.5;
          padding: 12px 14px; background: rgba(59,130,246,0.06);
          border: 1px solid rgba(59,130,246,0.15); border-radius: var(--radius-sm);
        }
        .cp-notice strong { color: var(--text-secondary); }
        .cp-error {
          display: flex; align-items: center; gap: 8px; padding: 10px 14px;
          background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
          border-radius: var(--radius-sm); color: var(--danger); font-size: 0.8125rem;
        }
        .cp-success {
          display: flex; align-items: flex-start; gap: 10px; padding: 14px 16px;
          background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.25);
          border-radius: var(--radius-md); color: #34d399; font-size: 0.875rem;
        }
        .cp-success strong { color: #10b981; display: block; margin-bottom: 2px; }
        .cp-success div { font-size: 0.8125rem; color: var(--text-muted); }
        .cp-submit-btn {
          align-self: flex-end; padding: 14px 32px; font-size: 1rem;
          display: flex; align-items: center; gap: 10px;
        }

        @media (max-width: 640px) {
          .cp-body { padding: 0 16px; }
          .cp-hero { padding: 28px 20px 24px; }
          .cp-section { padding: 16px; }
          .cp-section-header { flex-wrap: wrap; }
          .cp-submit-btn { width: 100%; justify-content: center; }
        }
      `}</style>
    </div>
  )
}
