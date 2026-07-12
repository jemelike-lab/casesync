'use client'

import { useState } from 'react'
import { Save, X } from 'lucide-react'
import EligibilityCodeSelect from '@/components/EligibilityCodeSelect'
import type { Client, Profile } from '@/lib/types'
import { businessDateOffsetStr } from '@/lib/business-date'

// ---------------------------------------------------------------------------
// ClientEditFormV2 — Phase A Batch 3.5
//
// Replaces the legacy ClientEditForm for the ?edit=1 route. Contract is
// IDENTICAL to the legacy form so the API surface stays untouched:
//   - PATCH /api/clients/[id] with the full 35-key formData payload
//     (the route's allow-list mirrors this exact set — do not add keys
//     without updating the route).
//   - Activity-log diff entries for the same 9 tracked fields.
//   - spm_completed=true auto-sets spm_next_due to today + 30 days.
// The form is always in edit state (it only renders under ?edit=1);
// Cancel/Save both hand control back via onExitEdit.
// ---------------------------------------------------------------------------

interface Props {
  client: Client
  currentUserId: string
  currentProfile: Profile
  planners?: Profile[]
  onExitEdit?: () => void
}

interface SelectOption { value: string; label: string }

const CONTACT_TYPE_OPTIONS: SelectOption[] = [{ value: 'Phone', label: 'Phone' }, { value: 'Home Visit', label: 'Home Visit' }, { value: 'Email', label: 'Email' }, { value: 'Office Visit', label: 'Office Visit' }]
const POS_STATUS_OPTIONS: SelectOption[] = [{ value: 'Pending', label: 'Pending' }, { value: 'In-Progress', label: 'In-Progress' }, { value: 'Completed', label: 'Completed' }]
const MED_TECH_STATUS_OPTIONS: SelectOption[] = [{ value: 'Active', label: 'Active' }, { value: 'Pending', label: 'Pending' }, { value: 'Expired', label: 'Expired' }, { value: 'Not Applicable', label: 'N/A' }]
const ATP_OPTIONS: SelectOption[] = [{ value: 'Pending', label: 'Pending' }, { value: 'Approved', label: 'Approved' }, { value: 'Expired', label: 'Expired' }, { value: 'Not Applicable', label: 'N/A' }]
const AUDIT_OPTIONS: SelectOption[] = [{ value: 'Not Started', label: 'Not Started' }, { value: 'Pending', label: 'Pending' }, { value: 'Passed', label: 'Passed' }, { value: 'Failed', label: 'Failed' }]
const QA_OPTIONS: SelectOption[] = [{ value: 'Not Started', label: 'Not Started' }, { value: 'Pending', label: 'Pending' }, { value: 'Passed', label: 'Passed' }, { value: 'Failed', label: 'Failed' }]

// Fields whose changes are appended to the activity log (legacy parity).
const TRACKED_FIELDS = ['pos_status', 'eligibility_end_date', 'last_contact_date', 'assessment_due', 'goal_pct', 'med_tech_status', 'atp', 'spm_completed', 'pos_deadline'] as const

type FormShape = Record<string, string | number | boolean | null>

function initialFormData(client: Client): FormShape {
  return {
    eligibility_code: client.eligibility_code, eligibility_end_date: client.eligibility_end_date,
    last_contact_date: client.last_contact_date, last_contact_type: client.last_contact_type,
    three_month_visit_date: client.three_month_visit_date, three_month_visit_due: client.three_month_visit_due,
    quarterly_waiver_date: client.quarterly_waiver_date, med_tech_redet_date: client.med_tech_redet_date,
    med_tech_status: client.med_tech_status, poc_date: client.poc_date, loc_date: client.loc_date,
    doc_mdh_date: client.doc_mdh_date, pos_deadline: client.pos_deadline, pos_status: client.pos_status,
    assessment_due: client.assessment_due, spm_completed: client.spm_completed, spm_next_due: client.spm_next_due,
    foc: client.foc, provider_forms: client.provider_forms, signatures_needed: client.signatures_needed,
    schedule_docs: client.schedule_docs, atp: client.atp, snfs: client.snfs, lease: client.lease,
    co_financial_redet_date: client.co_financial_redet_date, co_app_date: client.co_app_date,
    request_letter: client.request_letter, mfp_consent_date: client.mfp_consent_date,
    two57_date: client.two57_date, reportable_events: client.reportable_events, appeals: client.appeals,
    thirty_day_letter_date: client.thirty_day_letter_date, drop_in_visit_date: client.drop_in_visit_date,
    audit_review: client.audit_review, qa_review: client.qa_review, goal_pct: client.goal_pct,
  } as FormShape
}

const inputStyle: React.CSSProperties = {
  background: 'var(--v2-surface)', border: '1px solid var(--v2-border-soft)', borderRadius: 8,
  color: 'var(--v2-text)', padding: '7px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 11, color: 'var(--v2-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      {children}
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--v2-surface)', border: '0.5px solid var(--v2-border-soft)', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--v2-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{title}</div>
      <div className="cs-editv2-grid">{children}</div>
    </div>
  )
}

export default function ClientEditFormV2({ client, currentUserId: _uid, currentProfile: _profile, onExitEdit }: Props) {
  const [formData, setFormData] = useState<FormShape>(() => initialFormData(client))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field: string, value: string | number | boolean | null) => {
    if (field === 'spm_completed') {
      const checked = Boolean(value)
      if (checked) {
        setFormData(prev => ({ ...prev, spm_completed: true, spm_next_due: businessDateOffsetStr(30) }))
      } else {
        setFormData(prev => ({ ...prev, spm_completed: false }))
      }
      return
    }
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const str = (field: string) => {
    const v = formData[field]
    return v === null || v === undefined ? '' : String(v)
  }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const changes: Array<{ field: string; old: string | null; new: string | null }> = []
      for (const field of TRACKED_FIELDS) {
        const oldVal = client[field as keyof Client] as string | number | boolean | null
        const newVal = formData[field]
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          changes.push({ field, old: oldVal != null ? String(oldVal) : null, new: newVal != null ? String(newVal) : null })
        }
      }
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error ?? `Save failed (${res.status})`)
      }
      if (changes.length > 0) {
        await fetch(`/api/clients/${client.id}/activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: changes.map(c => ({ action: `Changed ${c.field.replace(/_/g, ' ')}`, field_name: c.field, old_value: c.old, new_value: c.new })) }),
        }).catch(() => {})
      }
      onExitEdit?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setSaving(false)
    }
  }

  const dateInput = (field: string) => (
    <input type="date" value={str(field).split('T')[0]} onChange={e => set(field, e.target.value || null)} style={inputStyle} />
  )
  const textInput = (field: string) => (
    <input type="text" value={str(field)} onChange={e => set(field, e.target.value || null)} style={inputStyle} />
  )
  const selectInput = (field: string, options: SelectOption[]) => (
    <select value={str(field)} onChange={e => set(field, e.target.value || null)} style={{ ...inputStyle, cursor: 'pointer' }}>
      <option value="">—</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
  const boolInput = (field: string) => (
    <div style={{ display: 'flex', alignItems: 'center', height: 34 }}>
      <input type="checkbox" checked={Boolean(formData[field])} onChange={e => set(field, e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
    </div>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 80 }}>
      {/* Sticky save bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--v2-surface)', border: '0.5px solid var(--v2-border-soft)', borderRadius: 8,
        padding: '10px 14px', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--v2-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Editing {client.first_name} {client.last_name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--v2-text-muted)' }}>{client.client_id}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={() => onExitEdit?.()} disabled={saving} style={{ background: 'transparent', color: 'var(--v2-text-muted)', border: '1px solid var(--v2-border-soft)', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <X size={14} /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="cs-editv2-save" style={{ background: saving ? 'rgba(30,124,255,0.55)' : '#1E7CFF', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Save size={14} /> {saving ? 'Saving\u2026' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: '#E24B4A', marginBottom: 12, padding: '8px 12px', background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.25)', borderRadius: 8 }}>
          {error}
        </div>
      )}

      <Section title="Identity">
        <Field label="Eligibility code">
          <EligibilityCodeSelect value={formData.eligibility_code as string | null} onChange={v => set('eligibility_code', v)} editing={true} />
        </Field>
        <Field label="Goal progress (%)">
          <input type="number" min={0} max={100} value={str('goal_pct')} onChange={e => set('goal_pct', e.target.value === '' ? null : Number(e.target.value))} style={inputStyle} />
        </Field>
      </Section>

      <Section title="Key deadlines">
        <Field label="Eligibility end">{dateInput('eligibility_end_date')}</Field>
        <Field label="3-month visit due">{dateInput('three_month_visit_due')}</Field>
        <Field label="Quarterly waiver">{dateInput('quarterly_waiver_date')}</Field>
        <Field label="Med-tech redet">{dateInput('med_tech_redet_date')}</Field>
        <Field label="POS deadline">{dateInput('pos_deadline')}</Field>
        <Field label="Assessment due">{dateInput('assessment_due')}</Field>
        <Field label="Doc to MDH (45d)">{dateInput('doc_mdh_date')}</Field>
        <Field label="SPM next due">{dateInput('spm_next_due')}</Field>
        <Field label="30-day letter">{dateInput('thirty_day_letter_date')}</Field>
        <Field label="Last contact">{dateInput('last_contact_date')}</Field>
      </Section>

      <Section title="Contact & visits">
        <Field label="Last contact type">{selectInput('last_contact_type', CONTACT_TYPE_OPTIONS)}</Field>
        <Field label="Drop-in visit date">{dateInput('drop_in_visit_date')}</Field>
        <Field label="3-month visit date">{dateInput('three_month_visit_date')}</Field>
      </Section>

      <Section title="Plans & assessments">
        <Field label="POC date">{dateInput('poc_date')}</Field>
        <Field label="LOC date">{dateInput('loc_date')}</Field>
        <Field label="POS status">{selectInput('pos_status', POS_STATUS_OPTIONS)}</Field>
        <Field label="SPM completed">
          {boolInput('spm_completed')}
          {Boolean(formData.spm_completed) && formData.spm_next_due ? (
            <span style={{ fontSize: 11, color: 'var(--v2-text-muted)' }}>Next due: {String(formData.spm_next_due)}</span>
          ) : null}
        </Field>
      </Section>

      <Section title="CO details">
        <Field label="CO financial redet">{dateInput('co_financial_redet_date')}</Field>
        <Field label="CO application">{dateInput('co_app_date')}</Field>
        <Field label="MFP consent">{dateInput('mfp_consent_date')}</Field>
        <Field label="257 date">{dateInput('two57_date')}</Field>
        <Field label="Request letter">{textInput('request_letter')}</Field>
      </Section>

      <Section title="Med tech">
        <Field label="Med/tech status">{selectInput('med_tech_status', MED_TECH_STATUS_OPTIONS)}</Field>
      </Section>

      <Section title="Forms & signatures">
        <Field label="FOC">{textInput('foc')}</Field>
        <Field label="Provider forms">{textInput('provider_forms')}</Field>
        <Field label="Signatures needed">{textInput('signatures_needed')}</Field>
        <Field label="Schedule docs">{boolInput('schedule_docs')}</Field>
      </Section>

      <Section title="Authorizations">
        <Field label="ATP">{selectInput('atp', ATP_OPTIONS)}</Field>
        <Field label="SNFs">{textInput('snfs')}</Field>
        <Field label="Lease">{textInput('lease')}</Field>
      </Section>

      <Section title="Reporting & reviews">
        <Field label="Reportable events">{textInput('reportable_events')}</Field>
        <Field label="Appeals">{textInput('appeals')}</Field>
        <Field label="Audit review">{selectInput('audit_review', AUDIT_OPTIONS)}</Field>
        <Field label="QA review">{selectInput('qa_review', QA_OPTIONS)}</Field>
      </Section>

      <style>{`
        .cs-editv2-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
        @media (max-width: 480px) { .cs-editv2-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}
