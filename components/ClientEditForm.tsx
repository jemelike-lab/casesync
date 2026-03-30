'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Client, getDateStatus, formatDate } from '@/lib/types'
import StatusDot from '@/components/StatusDot'
import Link from 'next/link'

type EditableClient = Omit<Client, 'id' | 'client_id' | 'last_name' | 'first_name' | 'category' | 'assigned_to' | 'created_at' | 'updated_at' | 'profiles'>

interface ClientEditFormProps {
  client: Client
}

const inputStyle: React.CSSProperties = {
  background: '#1c1c1e',
  border: '1px solid #333336',
  borderRadius: 6,
  color: '#f5f5f7',
  padding: '6px 10px',
  fontSize: 13,
  colorScheme: 'dark' as any,
  width: '100%',
  boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  background: '#1c1c1e',
  border: '1px solid #333336',
  borderRadius: 6,
  color: '#f5f5f7',
  padding: '6px 10px',
  fontSize: 13,
  width: '100%',
  cursor: 'pointer',
  appearance: 'auto',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

type SelectOption = { value: string; label: string }

function SelectField({
  field,
  value,
  options,
  onChange,
}: {
  field: string
  value: string | null | undefined
  options: SelectOption[]
  onChange: (field: string, value: string | null) => void
}) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(field, e.target.value || null)}
      style={selectStyle}
    >
      <option value="">— Select —</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

const POS_STATUS_OPTIONS: SelectOption[] = [
  { value: 'Pending', label: 'Pending' },
  { value: 'In-Progress', label: 'In-Progress' },
  { value: 'Completed', label: 'Completed' },
]

const MED_TECH_STATUS_OPTIONS: SelectOption[] = [
  { value: 'Active', label: 'Active' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Expired', label: 'Expired' },
  { value: 'Not Applicable', label: 'Not Applicable' },
]

const ATP_OPTIONS: SelectOption[] = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Expired', label: 'Expired' },
  { value: 'Not Applicable', label: 'Not Applicable' },
]

const AUDIT_REVIEW_OPTIONS: SelectOption[] = [
  { value: 'Not Started', label: 'Not Started' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Passed', label: 'Passed' },
  { value: 'Failed', label: 'Failed' },
]

const QA_REVIEW_OPTIONS: SelectOption[] = [
  { value: 'Not Started', label: 'Not Started' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Passed', label: 'Passed' },
  { value: 'Failed', label: 'Failed' },
]

const LAST_CONTACT_TYPE_OPTIONS: SelectOption[] = [
  { value: 'Phone', label: 'Phone' },
  { value: 'Home Visit', label: 'Home Visit' },
  { value: 'Email', label: 'Email' },
  { value: 'Office Visit', label: 'Office Visit' },
]

function FieldRow({
  label,
  field,
  value,
  type,
  editing,
  onChange,
  dateStatus,
  selectOptions,
  extra,
}: {
  label: string
  field: string
  value: string | boolean | number | null | undefined
  type: 'date' | 'text' | 'boolean' | 'number' | 'select'
  editing: boolean
  onChange: (field: string, value: string | boolean | number | null) => void
  dateStatus?: 'green' | 'yellow' | 'orange' | 'red' | 'none'
  selectOptions?: SelectOption[]
  extra?: React.ReactNode
}) {
  if (!editing && (value === null || value === undefined || value === '')) return null

  let displayValue: string
  if (typeof value === 'boolean') displayValue = value ? '✓ Yes' : '✗ No'
  else if (value === null || value === undefined) displayValue = '—'
  else if (type === 'date') displayValue = formatDate(String(value).split('T')[0])
  else displayValue = String(value)

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
      gap: 12,
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: '0 0 200px' }}>{label}</span>

      {editing ? (
        <div style={{ flex: 1 }}>
          {type === 'date' && (
            <input
              type="date"
              value={value ? String(value).split('T')[0] : ''}
              onChange={e => onChange(field, e.target.value || null)}
              style={inputStyle}
            />
          )}
          {type === 'text' && (
            <input
              type="text"
              value={value !== null && value !== undefined ? String(value) : ''}
              onChange={e => onChange(field, e.target.value || null)}
              style={inputStyle}
            />
          )}
          {type === 'number' && (
            <input
              type="number"
              min={0}
              max={100}
              value={value !== null && value !== undefined ? Number(value) : ''}
              onChange={e => onChange(field, e.target.value ? Number(e.target.value) : null)}
              style={inputStyle}
            />
          )}
          {type === 'boolean' && (
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={e => onChange(field, e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#007aff', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{value ? 'Yes' : 'No'}</span>
              </label>
              {extra}
            </div>
          )}
          {type === 'select' && selectOptions && (
            <SelectField
              field={field}
              value={value as string | null}
              options={selectOptions}
              onChange={(f, v) => onChange(f, v)}
            />
          )}
        </div>
      ) : (
        <span style={{
          fontSize: 13,
          fontWeight: 500,
          color: dateStatus ? `var(--${dateStatus === 'none' ? 'text-secondary' : dateStatus})` : 'var(--text)',
          textAlign: 'right',
          flex: 1,
        }}>
          {dateStatus && dateStatus !== 'none' && <StatusDot status={dateStatus} style={{ marginRight: 6 }} />}
          {displayValue}
        </span>
      )}
    </div>
  )
}

export default function ClientEditForm({ client }: ClientEditFormProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [formData, setFormData] = useState<Partial<EditableClient>>({
    eligibility_code: client.eligibility_code,
    eligibility_end_date: client.eligibility_end_date,
    last_contact_date: client.last_contact_date,
    last_contact_type: client.last_contact_type,
    three_month_visit_date: client.three_month_visit_date,
    three_month_visit_due: client.three_month_visit_due,
    quarterly_waiver_date: client.quarterly_waiver_date,
    med_tech_redet_date: client.med_tech_redet_date,
    med_tech_status: client.med_tech_status,
    poc_date: client.poc_date,
    loc_date: client.loc_date,
    doc_mdh_date: client.doc_mdh_date,
    pos_deadline: client.pos_deadline,
    pos_status: client.pos_status,
    assessment_due: client.assessment_due,
    spm_completed: client.spm_completed,
    spm_next_due: client.spm_next_due,
    foc: client.foc,
    provider_forms: client.provider_forms,
    signatures_needed: client.signatures_needed,
    schedule_docs: client.schedule_docs,
    atp: client.atp,
    snfs: client.snfs,
    lease: client.lease,
    co_financial_redet_date: client.co_financial_redet_date,
    co_app_date: client.co_app_date,
    request_letter: client.request_letter,
    mfp_consent_date: client.mfp_consent_date,
    two57_date: client.two57_date,
    reportable_events: client.reportable_events,
    appeals: client.appeals,
    thirty_day_letter_date: client.thirty_day_letter_date,
    drop_in_visit_date: client.drop_in_visit_date,
    audit_review: client.audit_review,
    qa_review: client.qa_review,
    goal_pct: client.goal_pct,
  })

  const handleChange = (field: string, value: string | boolean | number | null) => {
    if (field === 'spm_completed') {
      const checked = Boolean(value)
      if (checked) {
        const nextDue = new Date()
        nextDue.setDate(nextDue.getDate() + 30)
        const nextDueStr = nextDue.toISOString().split('T')[0]
        setFormData(prev => ({ ...prev, spm_completed: true, spm_next_due: nextDueStr }))
      } else {
        setFormData(prev => ({ ...prev, spm_completed: false }))
      }
      return
    }
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setToast(null)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('clients')
        .update(formData)
        .eq('id', client.id)

      if (error) throw error

      setEditing(false)
      setToast({ type: 'success', message: 'Changes saved successfully!' })
      setTimeout(() => setToast(null), 3000)
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message || 'Failed to save changes.' })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      eligibility_code: client.eligibility_code,
      eligibility_end_date: client.eligibility_end_date,
      last_contact_date: client.last_contact_date,
      last_contact_type: client.last_contact_type,
      three_month_visit_date: client.three_month_visit_date,
      three_month_visit_due: client.three_month_visit_due,
      quarterly_waiver_date: client.quarterly_waiver_date,
      med_tech_redet_date: client.med_tech_redet_date,
      med_tech_status: client.med_tech_status,
      poc_date: client.poc_date,
      loc_date: client.loc_date,
      doc_mdh_date: client.doc_mdh_date,
      pos_deadline: client.pos_deadline,
      pos_status: client.pos_status,
      assessment_due: client.assessment_due,
      spm_completed: client.spm_completed,
      spm_next_due: client.spm_next_due,
      foc: client.foc,
      provider_forms: client.provider_forms,
      signatures_needed: client.signatures_needed,
      schedule_docs: client.schedule_docs,
      atp: client.atp,
      snfs: client.snfs,
      lease: client.lease,
      co_financial_redet_date: client.co_financial_redet_date,
      co_app_date: client.co_app_date,
      request_letter: client.request_letter,
      mfp_consent_date: client.mfp_consent_date,
      two57_date: client.two57_date,
      reportable_events: client.reportable_events,
      appeals: client.appeals,
      thirty_day_letter_date: client.thirty_day_letter_date,
      drop_in_visit_date: client.drop_in_visit_date,
      audit_review: client.audit_review,
      qa_review: client.qa_review,
      goal_pct: client.goal_pct,
    })
    setEditing(false)
  }

  const f = formData

  // SPM next-due note shown next to checkbox when editing and spm_completed is true
  const spmNextDueNote = editing && f.spm_completed && f.spm_next_due ? (
    <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
      Next due: <strong style={{ color: '#f5f5f7' }}>{formatDate(f.spm_next_due)}</strong>
    </span>
  ) : null

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 9999,
          background: toast.type === 'success' ? '#1a3a1a' : '#3a1a1a',
          border: `1px solid ${toast.type === 'success' ? '#34c759' : '#ff3b30'}`,
          borderRadius: 10,
          padding: '12px 18px',
          color: toast.type === 'success' ? '#34c759' : '#ff3b30',
          fontSize: 14,
          fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          maxWidth: 320,
        }}>
          {toast.type === 'success' ? '✓ ' : '✗ '}{toast.message}
        </div>
      )}

      {/* Back */}
      <Link href="/dashboard" style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: 'var(--accent)',
        textDecoration: 'none',
        fontSize: 14,
        marginBottom: 24,
      }}>
        ← Back to Dashboard
      </Link>

      {/* Header */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            {client.last_name}, {client.first_name}
          </h1>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>ID: <strong>{client.client_id}</strong></span>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 12,
              background: 'var(--surface-2)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {client.category}
            </span>
            {f.eligibility_code && (
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Eligibility: <strong>{f.eligibility_code}</strong></span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!editing && (
            <div style={{
              fontSize: 24,
              fontWeight: 700,
              color: (f.goal_pct ?? 0) >= 80 ? 'var(--green)' : (f.goal_pct ?? 0) >= 50 ? 'var(--yellow)' : 'var(--red)',
              marginRight: 8,
            }}>
              {f.goal_pct}%
            </div>
          )}
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  background: '#007aff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                style={{
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              style={{
                background: 'var(--surface-2)',
                color: 'var(--accent)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 18px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Eligibility */}
      <Section title="Eligibility">
        <FieldRow label="Eligibility Code" field="eligibility_code" value={f.eligibility_code} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Eligibility End Date" field="eligibility_end_date" value={f.eligibility_end_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.eligibility_end_date as string | null)} />
      </Section>

      {/* Contact & Visits */}
      <Section title="Contact & Visits">
        <FieldRow label="Last Contact Date" field="last_contact_date" value={f.last_contact_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.last_contact_date as string | null)} />
        <FieldRow
          label="Last Contact Type"
          field="last_contact_type"
          value={f.last_contact_type}
          type={editing ? 'select' : 'text'}
          editing={editing}
          onChange={handleChange}
          selectOptions={LAST_CONTACT_TYPE_OPTIONS}
        />
        <FieldRow label="Drop-in Visit Date" field="drop_in_visit_date" value={f.drop_in_visit_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.drop_in_visit_date as string | null)} />
        <FieldRow label="30-Day Letter Date" field="thirty_day_letter_date" value={f.thirty_day_letter_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.thirty_day_letter_date as string | null)} />
        <FieldRow label="3-Month Visit Date" field="three_month_visit_date" value={f.three_month_visit_date} type="date" editing={editing} onChange={handleChange} />
        <FieldRow label="3-Month Visit Due" field="three_month_visit_due" value={f.three_month_visit_due} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.three_month_visit_due as string | null)} />
        <FieldRow label="Quarterly Visit Waiver Date" field="quarterly_waiver_date" value={f.quarterly_waiver_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.quarterly_waiver_date as string | null)} />
      </Section>

      {/* Med Tech */}
      <Section title="Med Tech">
        <FieldRow label="Med-Tech Redet Date" field="med_tech_redet_date" value={f.med_tech_redet_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.med_tech_redet_date as string | null)} />
        <FieldRow
          label="Med/Tech Status"
          field="med_tech_status"
          value={f.med_tech_status}
          type={editing ? 'select' : 'text'}
          editing={editing}
          onChange={handleChange}
          selectOptions={MED_TECH_STATUS_OPTIONS}
        />
      </Section>

      {/* Plans & Assessments */}
      <Section title="Plans & Assessments">
        <FieldRow label="POC Date" field="poc_date" value={f.poc_date} type="date" editing={editing} onChange={handleChange} />
        <FieldRow label="LOC Date (If Necessary)" field="loc_date" value={f.loc_date} type="date" editing={editing} onChange={handleChange} />
        <FieldRow label="Documentation MDH (45 days)" field="doc_mdh_date" value={f.doc_mdh_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.doc_mdh_date as string | null)} />
        <FieldRow label="POS Deadline" field="pos_deadline" value={f.pos_deadline} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.pos_deadline as string | null)} />
        <FieldRow
          label="POS Status"
          field="pos_status"
          value={f.pos_status}
          type={editing ? 'select' : 'text'}
          editing={editing}
          onChange={handleChange}
          selectOptions={POS_STATUS_OPTIONS}
        />
        <FieldRow label="Assessment Due Date" field="assessment_due" value={f.assessment_due} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.assessment_due as string | null)} />
        <FieldRow
          label="SPM Completed"
          field="spm_completed"
          value={f.spm_completed}
          type="boolean"
          editing={editing}
          onChange={handleChange}
          extra={spmNextDueNote}
        />
        {!editing && f.spm_next_due && (
          <FieldRow
            label="SPM Next Due"
            field="spm_next_due"
            value={f.spm_next_due}
            type="date"
            editing={false}
            onChange={handleChange}
          />
        )}
        {editing && (
          <FieldRow label="Goal Progress (%)" field="goal_pct" value={f.goal_pct} type="number" editing={editing} onChange={handleChange} />
        )}
      </Section>

      {/* Forms & Signatures */}
      <Section title="Forms & Signatures">
        <FieldRow label="FOC" field="foc" value={f.foc} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Provider Forms" field="provider_forms" value={f.provider_forms} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Signatures Needed" field="signatures_needed" value={f.signatures_needed} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Schedule/Supporting Documents Attached?" field="schedule_docs" value={f.schedule_docs} type="boolean" editing={editing} onChange={handleChange} />
      </Section>

      {/* Authorizations */}
      <Section title="Authorizations & Services">
        <FieldRow
          label="ATP"
          field="atp"
          value={f.atp}
          type={editing ? 'select' : 'text'}
          editing={editing}
          onChange={handleChange}
          selectOptions={ATP_OPTIONS}
        />
        <FieldRow label="SNFs" field="snfs" value={f.snfs} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Lease" field="lease" value={f.lease} type="text" editing={editing} onChange={handleChange} />
      </Section>

      {/* CO Details */}
      <Section title="CO Details">
        <FieldRow label="CO Financial Redetermination Due Date" field="co_financial_redet_date" value={f.co_financial_redet_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.co_financial_redet_date as string | null)} />
        <FieldRow label="CO Application Date" field="co_app_date" value={f.co_app_date} type="date" editing={editing} onChange={handleChange} />
        <FieldRow label="Request Letter" field="request_letter" value={f.request_letter} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="MFP Consent Form Date" field="mfp_consent_date" value={f.mfp_consent_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.mfp_consent_date as string | null)} />
        <FieldRow label="257 Date" field="two57_date" value={f.two57_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.two57_date as string | null)} />
      </Section>

      {/* Reporting */}
      <Section title="Reporting & Reviews">
        <FieldRow label="Reportable Events" field="reportable_events" value={f.reportable_events} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Appeals" field="appeals" value={f.appeals} type="text" editing={editing} onChange={handleChange} />
        <FieldRow
          label="Audit Team Review"
          field="audit_review"
          value={f.audit_review}
          type={editing ? 'select' : 'text'}
          editing={editing}
          onChange={handleChange}
          selectOptions={AUDIT_REVIEW_OPTIONS}
        />
        <FieldRow
          label="QA Team Review"
          field="qa_review"
          value={f.qa_review}
          type={editing ? 'select' : 'text'}
          editing={editing}
          onChange={handleChange}
          selectOptions={QA_REVIEW_OPTIONS}
        />
      </Section>

      {/* Assignment */}
      <Section title="Assignment">
        <FieldRow label="Assigned To" field="assigned_to" value={client.profiles?.full_name ?? 'Unassigned'} type="text" editing={false} onChange={handleChange} />
        <FieldRow label="Category" field="category" value={client.category.toUpperCase()} type="text" editing={false} onChange={handleChange} />
        <FieldRow label="Goal Progress" field="goal_pct" value={`${f.goal_pct}%`} type="text" editing={false} onChange={handleChange} />
        <FieldRow label="Created" field="created_at" value={client.created_at ? formatDate(client.created_at.split('T')[0]) : null} type="text" editing={false} onChange={handleChange} />
        <FieldRow label="Updated" field="updated_at" value={client.updated_at ? formatDate(client.updated_at.split('T')[0]) : null} type="text" editing={false} onChange={handleChange} />
      </Section>
    </div>
  )
}
