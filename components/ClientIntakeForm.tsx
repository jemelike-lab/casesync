'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import Link from 'next/link'

interface Props {
  planners: Profile[]
  currentUserId: string
}

type Category = 'CO' | 'CFC' | 'CPAS'

interface FormData {
  // Step 1
  client_id: string
  first_name: string
  last_name: string
  category: Category | ''
  eligibility_code: string
  eligibility_end_date: string
  assigned_to: string

  // Step 2
  last_contact_date: string
  last_contact_type: string
  three_month_visit_date: string
  three_month_visit_due: string
  quarterly_waiver_date: string
  drop_in_visit_date: string

  // Step 3
  poc_date: string
  loc_date: string
  med_tech_redet_date: string
  med_tech_status: string
  pos_deadline: string
  pos_status: string
  assessment_due: string
  spm_completed: boolean

  // Step 4
  foc: string
  provider_forms: string
  signatures_needed: string
  schedule_docs: boolean
  atp: string
  snfs: string
  lease: string

  // Step 5 (CO/CFC only)
  co_financial_redet_date: string
  co_app_date: string
  request_letter: string
  mfp_consent_date: string
  two57_date: string
}

const initialForm: FormData = {
  client_id: '',
  first_name: '',
  last_name: '',
  category: '',
  eligibility_code: '',
  eligibility_end_date: '',
  assigned_to: '',
  last_contact_date: '',
  last_contact_type: '',
  three_month_visit_date: '',
  three_month_visit_due: '',
  quarterly_waiver_date: '',
  drop_in_visit_date: '',
  poc_date: '',
  loc_date: '',
  med_tech_redet_date: '',
  med_tech_status: '',
  pos_deadline: '',
  pos_status: '',
  assessment_due: '',
  spm_completed: false,
  foc: '',
  provider_forms: '',
  signatures_needed: '',
  schedule_docs: false,
  atp: '',
  snfs: '',
  lease: '',
  co_financial_redet_date: '',
  co_app_date: '',
  request_letter: '',
  mfp_consent_date: '',
  two57_date: '',
}

const inputStyle: React.CSSProperties = {
  background: '#1c1c1e',
  border: '1px solid #333336',
  borderRadius: 8,
  color: '#f5f5f7',
  padding: '10px 14px',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 6,
  color: '#98989d',
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: '#ff453a' }}>*</span>}
      </label>
      {children}
      {error && (
        <div style={{ fontSize: 12, color: '#ff453a', marginTop: 4 }}>{error}</div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#98989d',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 16,
        paddingBottom: 8,
        borderBottom: '1px solid #2c2c2e',
      }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function ProgressBar({ step, total, stepLabels }: { step: number; total: number; stepLabels: string[] }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#f5f5f7' }}>{stepLabels[step - 1]}</span>
        <span style={{ fontSize: 12, color: '#98989d' }}>Step {step} of {total}</span>
      </div>
      <div style={{ height: 4, background: '#2c2c2e', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${(step / total) * 100}%`,
          background: 'var(--accent)',
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            background: i + 1 <= step ? 'var(--accent)' : '#2c2c2e',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string | boolean | null | undefined }) {
  if (!value && value !== false) return null
  const display = typeof value === 'boolean' ? (value ? '✓ Yes' : '✗ No') : value
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '8px 0',
      borderBottom: '1px solid #2c2c2e',
      gap: 12,
    }}>
      <span style={{ fontSize: 12, color: '#98989d', flex: '0 0 180px' }}>{label}</span>
      <span style={{ fontSize: 13, color: '#f5f5f7', textAlign: 'right' }}>{display}</span>
    </div>
  )
}

export default function ClientIntakeForm({ planners, currentUserId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState<FormData>(initialForm)
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const showCOStep = form.category === 'CO' || form.category === 'CFC'
  const totalSteps = showCOStep ? 6 : 5 // Step 5 is CO Details (only if CO/CFC), last step is Review

  // Recalculate step labels based on whether CO step is visible
  const stepLabels = [
    'Basic Info',
    'Contact & Visits',
    'Plans & Medical',
    'Documentation',
    ...(showCOStep ? ['CO Details'] : []),
    'Review & Submit',
  ]

  function set(field: keyof FormData, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  async function validateStep1(): Promise<boolean> {
    const newErrors: Partial<Record<keyof FormData, string>> = {}
    if (!form.client_id.trim()) newErrors.client_id = 'Client ID is required'
    if (!form.last_name.trim()) newErrors.last_name = 'Last name is required'
    if (!form.category) newErrors.category = 'Category is required'

    // Check Client ID uniqueness
    if (form.client_id.trim()) {
      const { data } = await supabase
        .from('clients')
        .select('id')
        .eq('client_id', form.client_id.trim())
        .single()
      if (data) newErrors.client_id = 'This Client ID is already in use'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function validateStep(s: number): boolean {
    // Steps 2-5 have no required fields
    return true
  }

  async function handleNext() {
    if (step === 1) {
      const valid = await validateStep1()
      if (!valid) return
    } else {
      if (!validateStep(step)) return
    }
    setStep(s => s + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleBack() {
    setStep(s => s - 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)

    const payload: Record<string, unknown> = {
      client_id: form.client_id.trim(),
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim(),
      category: form.category.toLowerCase(),
      eligibility_code: form.eligibility_code || null,
      eligibility_end_date: form.eligibility_end_date || null,
      assigned_to: form.assigned_to || null,
      last_contact_date: form.last_contact_date || null,
      last_contact_type: form.last_contact_type || null,
      three_month_visit_date: form.three_month_visit_date || null,
      three_month_visit_due: form.three_month_visit_due || null,
      quarterly_waiver_date: form.quarterly_waiver_date || null,
      drop_in_visit_date: form.drop_in_visit_date || null,
      poc_date: form.poc_date || null,
      loc_date: form.loc_date || null,
      med_tech_redet_date: form.med_tech_redet_date || null,
      med_tech_status: form.med_tech_status || null,
      pos_deadline: form.pos_deadline || null,
      pos_status: form.pos_status || null,
      assessment_due: form.assessment_due || null,
      spm_completed: form.spm_completed,
      foc: form.foc || null,
      provider_forms: form.provider_forms || null,
      signatures_needed: form.signatures_needed || null,
      schedule_docs: form.schedule_docs,
      atp: form.atp || null,
      snfs: form.snfs || null,
      lease: form.lease || null,
      co_financial_redet_date: form.co_financial_redet_date || null,
      co_app_date: form.co_app_date || null,
      request_letter: form.request_letter || null,
      mfp_consent_date: form.mfp_consent_date || null,
      two57_date: form.two57_date || null,
      goal_pct: 0,
    }

    const { data, error } = await supabase
      .from('clients')
      .insert(payload)
      .select('id')
      .single()

    setSubmitting(false)

    if (error) {
      setSubmitError(error.message)
      return
    }

    // Log activity
    await supabase.from('activity_log').insert({
      client_id: data.id,
      user_id: currentUserId,
      action: `Client created via intake form`,
      field_name: null,
      old_value: null,
      new_value: form.client_id,
    })

    router.push(`/clients/${data.id}?created=1`)
    router.refresh()
  }

  const assignedPlanner = planners.find(p => p.id === form.assigned_to)

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/dashboard" style={{ color: '#98989d', textDecoration: 'none', fontSize: 13 }}>
          ← Dashboard
        </Link>
        <span style={{ color: '#3a3a3c' }}>/</span>
        <span style={{ fontSize: 13, color: '#98989d' }}>New Client</span>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Add New Client</h1>
      <p style={{ color: '#98989d', fontSize: 14, marginBottom: 28 }}>
        Fill in the client information across all sections.
      </p>

      {/* Progress */}
      <ProgressBar step={step} total={totalSteps} stepLabels={stepLabels} />

      <div style={{
        background: '#1c1c1e',
        borderRadius: 14,
        border: '1px solid #2c2c2e',
        padding: '28px 24px',
        marginBottom: 16,
      }}>
        {/* ── STEP 1: Basic Info ── */}
        {step === 1 && (
          <Section title="Basic Information">
            <Field label="Client ID" required error={errors.client_id}>
              <input
                type="text"
                value={form.client_id}
                onChange={e => set('client_id', e.target.value)}
                placeholder="e.g. C-12345"
                style={{ ...inputStyle, borderColor: errors.client_id ? '#ff453a' : '#333336' }}
                autoFocus
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="First Name">
                <input
                  type="text"
                  value={form.first_name}
                  onChange={e => set('first_name', e.target.value)}
                  placeholder="Jane"
                  style={inputStyle}
                />
              </Field>
              <Field label="Last Name" required error={errors.last_name}>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={e => set('last_name', e.target.value)}
                  placeholder="Smith"
                  style={{ ...inputStyle, borderColor: errors.last_name ? '#ff453a' : '#333336' }}
                />
              </Field>
            </div>

            <Field label="Category" required error={errors.category}>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value as Category | '')}
                style={{ ...inputStyle, borderColor: errors.category ? '#ff453a' : '#333336', cursor: 'pointer' }}
              >
                <option value="">— Select Category —</option>
                <option value="CO">CO</option>
                <option value="CFC">CFC</option>
                <option value="CPAS">CPAS</option>
              </select>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Eligibility Code">
                <input
                  type="text"
                  value={form.eligibility_code}
                  onChange={e => set('eligibility_code', e.target.value)}
                  placeholder="e.g. MA"
                  style={inputStyle}
                />
              </Field>
              <Field label="Eligibility End Date">
                <input
                  type="date"
                  value={form.eligibility_end_date}
                  onChange={e => set('eligibility_end_date', e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
            </div>

            <Field label="Assign to Supports Planner">
              <select
                value={form.assigned_to}
                onChange={e => set('assigned_to', e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">— Unassigned —</option>
                {planners.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </Field>
          </Section>
        )}

        {/* ── STEP 2: Contact & Visit Tracking ── */}
        {step === 2 && (
          <Section title="Contact & Visit Tracking">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Last Contact Date">
                <input
                  type="date"
                  value={form.last_contact_date}
                  onChange={e => set('last_contact_date', e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
              <Field label="Last Contact Type">
                <select
                  value={form.last_contact_type}
                  onChange={e => set('last_contact_type', e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">— Select —</option>
                  <option value="Phone">Phone</option>
                  <option value="Home Visit">Home Visit</option>
                  <option value="Email">Email</option>
                  <option value="Office Visit">Office Visit</option>
                </select>
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="3-Month Visit Date">
                <input
                  type="date"
                  value={form.three_month_visit_date}
                  onChange={e => set('three_month_visit_date', e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
              <Field label="3-Month Visit Due">
                <input
                  type="date"
                  value={form.three_month_visit_due}
                  onChange={e => set('three_month_visit_due', e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Quarterly Visit Waiver Date">
                <input
                  type="date"
                  value={form.quarterly_waiver_date}
                  onChange={e => set('quarterly_waiver_date', e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
              <Field label="Drop-in Visit Date">
                <input
                  type="date"
                  value={form.drop_in_visit_date}
                  onChange={e => set('drop_in_visit_date', e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
            </div>
          </Section>
        )}

        {/* ── STEP 3: Plans & Medical ── */}
        {step === 3 && (
          <Section title="Plans & Medical">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="POC Date">
                <input
                  type="date"
                  value={form.poc_date}
                  onChange={e => set('poc_date', e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
              <Field label="LOC Date">
                <input
                  type="date"
                  value={form.loc_date}
                  onChange={e => set('loc_date', e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Med-Tech Redet Date">
                <input
                  type="date"
                  value={form.med_tech_redet_date}
                  onChange={e => set('med_tech_redet_date', e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
              <Field label="Med/Tech Status">
                <select
                  value={form.med_tech_status}
                  onChange={e => set('med_tech_status', e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">— Select —</option>
                  <option value="Active">Active</option>
                  <option value="Pending">Pending</option>
                  <option value="Expired">Expired</option>
                  <option value="Not Applicable">Not Applicable</option>
                </select>
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="POS Deadline">
                <input
                  type="date"
                  value={form.pos_deadline}
                  onChange={e => set('pos_deadline', e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
              <Field label="POS Status">
                <select
                  value={form.pos_status}
                  onChange={e => set('pos_status', e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">— Select —</option>
                  <option value="Pending">Pending</option>
                  <option value="In-Progress">In-Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </Field>
            </div>

            <Field label="Assessment Due Date">
              <input
                type="date"
                value={form.assessment_due}
                onChange={e => set('assessment_due', e.target.value)}
                style={{ ...inputStyle, colorScheme: 'dark' }}
              />
            </Field>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 0',
              borderTop: '1px solid #2c2c2e',
              marginTop: 8,
            }}>
              <input
                type="checkbox"
                id="spm_completed"
                checked={form.spm_completed}
                onChange={e => set('spm_completed', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#007aff', cursor: 'pointer' }}
              />
              <label htmlFor="spm_completed" style={{ fontSize: 14, color: '#f5f5f7', cursor: 'pointer' }}>
                SPM Completed
              </label>
            </div>
          </Section>
        )}

        {/* ── STEP 4: Documentation ── */}
        {step === 4 && (
          <Section title="Documentation">
            <Field label="FOC">
              <input
                type="text"
                value={form.foc}
                onChange={e => set('foc', e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="Provider Forms">
              <input
                type="text"
                value={form.provider_forms}
                onChange={e => set('provider_forms', e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="Signatures Needed">
              <input
                type="text"
                value={form.signatures_needed}
                onChange={e => set('signatures_needed', e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="ATP">
              <select
                value={form.atp}
                onChange={e => set('atp', e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">— Select —</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Expired">Expired</option>
                <option value="Not Applicable">Not Applicable</option>
              </select>
            </Field>

            <Field label="SNFs">
              <input
                type="text"
                value={form.snfs}
                onChange={e => set('snfs', e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="Lease">
              <input
                type="text"
                value={form.lease}
                onChange={e => set('lease', e.target.value)}
                style={inputStyle}
              />
            </Field>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 0',
              borderTop: '1px solid #2c2c2e',
              marginTop: 8,
            }}>
              <input
                type="checkbox"
                id="schedule_docs"
                checked={form.schedule_docs}
                onChange={e => set('schedule_docs', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#007aff', cursor: 'pointer' }}
              />
              <label htmlFor="schedule_docs" style={{ fontSize: 14, color: '#f5f5f7', cursor: 'pointer' }}>
                Schedule/Supporting Docs Attached
              </label>
            </div>
          </Section>
        )}

        {/* ── STEP 5: CO Details (CO/CFC only) ── */}
        {step === 5 && showCOStep && (
          <Section title="CO Details">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="CO Financial Redet Date">
                <input
                  type="date"
                  value={form.co_financial_redet_date}
                  onChange={e => set('co_financial_redet_date', e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
              <Field label="CO App Date">
                <input
                  type="date"
                  value={form.co_app_date}
                  onChange={e => set('co_app_date', e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
            </div>

            <Field label="Request Letter">
              <input
                type="text"
                value={form.request_letter}
                onChange={e => set('request_letter', e.target.value)}
                style={inputStyle}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="MFP Consent Form Date">
                <input
                  type="date"
                  value={form.mfp_consent_date}
                  onChange={e => set('mfp_consent_date', e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
              <Field label="257 Date">
                <input
                  type="date"
                  value={form.two57_date}
                  onChange={e => set('two57_date', e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
            </div>
          </Section>
        )}

        {/* ── REVIEW & SUBMIT ── */}
        {step === totalSteps && (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: '#f5f5f7' }}>
              Review your submission
            </h3>

            {submitError && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(255,69,58,0.15)',
                border: '1px solid rgba(255,69,58,0.3)',
                color: '#ff453a',
                fontSize: 13,
                marginBottom: 20,
              }}>
                {submitError}
              </div>
            )}

            <Section title="Basic Info">
              <ReviewRow label="Client ID" value={form.client_id} />
              <ReviewRow label="Name" value={`${form.first_name} ${form.last_name}`.trim()} />
              <ReviewRow label="Category" value={form.category} />
              <ReviewRow label="Eligibility Code" value={form.eligibility_code} />
              <ReviewRow label="Eligibility End Date" value={form.eligibility_end_date} />
              <ReviewRow label="Assigned To" value={assignedPlanner?.full_name ?? form.assigned_to} />
            </Section>

            <Section title="Contact & Visits">
              <ReviewRow label="Last Contact Date" value={form.last_contact_date} />
              <ReviewRow label="Last Contact Type" value={form.last_contact_type} />
              <ReviewRow label="3-Month Visit Date" value={form.three_month_visit_date} />
              <ReviewRow label="3-Month Visit Due" value={form.three_month_visit_due} />
              <ReviewRow label="Quarterly Visit Waiver" value={form.quarterly_waiver_date} />
              <ReviewRow label="Drop-in Visit Date" value={form.drop_in_visit_date} />
            </Section>

            <Section title="Plans & Medical">
              <ReviewRow label="POC Date" value={form.poc_date} />
              <ReviewRow label="LOC Date" value={form.loc_date} />
              <ReviewRow label="Med-Tech Redet Date" value={form.med_tech_redet_date} />
              <ReviewRow label="Med/Tech Status" value={form.med_tech_status} />
              <ReviewRow label="POS Deadline" value={form.pos_deadline} />
              <ReviewRow label="POS Status" value={form.pos_status} />
              <ReviewRow label="Assessment Due" value={form.assessment_due} />
              <ReviewRow label="SPM Completed" value={form.spm_completed} />
            </Section>

            <Section title="Documentation">
              <ReviewRow label="FOC" value={form.foc} />
              <ReviewRow label="Provider Forms" value={form.provider_forms} />
              <ReviewRow label="Signatures Needed" value={form.signatures_needed} />
              <ReviewRow label="ATP" value={form.atp} />
              <ReviewRow label="SNFs" value={form.snfs} />
              <ReviewRow label="Lease" value={form.lease} />
              <ReviewRow label="Schedule/Docs Attached" value={form.schedule_docs} />
            </Section>

            {showCOStep && (form.co_financial_redet_date || form.co_app_date || form.request_letter || form.mfp_consent_date || form.two57_date) && (
              <Section title="CO Details">
                <ReviewRow label="CO Financial Redet" value={form.co_financial_redet_date} />
                <ReviewRow label="CO App Date" value={form.co_app_date} />
                <ReviewRow label="Request Letter" value={form.request_letter} />
                <ReviewRow label="MFP Consent Date" value={form.mfp_consent_date} />
                <ReviewRow label="257 Date" value={form.two57_date} />
              </Section>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
        {step > 1 ? (
          <button
            className="btn-secondary"
            onClick={handleBack}
            disabled={submitting}
            style={{ minWidth: 100, fontSize: 14 }}
          >
            ← Back
          </button>
        ) : (
          <Link href="/dashboard">
            <button className="btn-secondary" style={{ minWidth: 100, fontSize: 14 }}>
              Cancel
            </button>
          </Link>
        )}

        {step < totalSteps ? (
          <button
            className="btn-primary"
            onClick={handleNext}
            style={{ minWidth: 140, fontSize: 14 }}
          >
            Next →
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
            style={{ minWidth: 140, fontSize: 14 }}
          >
            {submitting ? 'Submitting…' : '✓ Submit Client'}
          </button>
        )}
      </div>
    </div>
  )
}
