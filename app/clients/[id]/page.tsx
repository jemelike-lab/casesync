import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Client, getDateStatus } from '@/lib/types'
import StatusDot from '@/components/StatusDot'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function FieldRow({ label, value, dateStatus }: {
  label: string
  value: string | boolean | number | null | undefined
  dateStatus?: 'green' | 'yellow' | 'orange' | 'red' | 'none'
}) {
  if (value === null || value === undefined || value === '') return null

  let displayValue: string
  if (typeof value === 'boolean') displayValue = value ? '✓ Yes' : '✗ No'
  else displayValue = String(value)

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>{label}</span>
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
    </div>
  )
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

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: client, error } = await supabase
    .from('clients')
    .select('*, profiles!clients_assigned_to_fkey(id, full_name, role)')
    .eq('id', id)
    .single()

  if (error || !client) notFound()

  const c = client as Client

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
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
            {c.last_name}, {c.first_name}
          </h1>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>ID: <strong>{c.client_id}</strong></span>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 12,
              background: 'var(--surface-2)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {c.category}
            </span>
            {c.eligibility_code && (
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Eligibility: <strong>{c.eligibility_code}</strong></span>
            )}
          </div>
        </div>
        <div style={{
          fontSize: 24,
          fontWeight: 700,
          color: c.goal_pct >= 80 ? 'var(--green)' : c.goal_pct >= 50 ? 'var(--yellow)' : 'var(--red)',
        }}>
          {c.goal_pct}%
        </div>
      </div>

      {/* Eligibility */}
      <Section title="Eligibility">
        <FieldRow label="Eligibility Code" value={c.eligibility_code} />
        <FieldRow label="Eligibility End Date" value={c.eligibility_end_date} dateStatus={getDateStatus(c.eligibility_end_date)} />
      </Section>

      {/* Contact */}
      <Section title="Contact & Visits">
        <FieldRow label="Last Contact Date" value={c.last_contact_date} dateStatus={getDateStatus(c.last_contact_date)} />
        <FieldRow label="Last Contact Type" value={c.last_contact_type} />
        <FieldRow label="Drop-in Visit Date" value={c.drop_in_visit_date} dateStatus={getDateStatus(c.drop_in_visit_date)} />
        <FieldRow label="30-Day Letter Date" value={c.thirty_day_letter_date} dateStatus={getDateStatus(c.thirty_day_letter_date)} />
        <FieldRow label="3-Month Visit Date" value={c.three_month_visit_date} />
        <FieldRow label="3-Month Visit Due" value={c.three_month_visit_due} dateStatus={getDateStatus(c.three_month_visit_due)} />
        <FieldRow label="Quarterly Visit Waiver Date" value={c.quarterly_waiver_date} dateStatus={getDateStatus(c.quarterly_waiver_date)} />
      </Section>

      {/* Med Tech */}
      <Section title="Med Tech">
        <FieldRow label="Med-Tech Redet Date" value={c.med_tech_redet_date} dateStatus={getDateStatus(c.med_tech_redet_date)} />
        <FieldRow label="Med/Tech Status" value={c.med_tech_status} />
      </Section>

      {/* Plans & Assessments */}
      <Section title="Plans & Assessments">
        <FieldRow label="POC Date" value={c.poc_date} />
        <FieldRow label="LOC Date (If Necessary)" value={c.loc_date} />
        <FieldRow label="Documentation MDH (45 days)" value={c.doc_mdh_date} dateStatus={getDateStatus(c.doc_mdh_date)} />
        <FieldRow label="POS Deadline" value={c.pos_deadline} dateStatus={getDateStatus(c.pos_deadline)} />
        <FieldRow label="POS Status" value={c.pos_status} />
        <FieldRow label="Assessment Due Date" value={c.assessment_due} dateStatus={getDateStatus(c.assessment_due)} />
        <FieldRow label="SPM Completed" value={c.spm_completed} />
      </Section>

      {/* Forms & Signatures */}
      <Section title="Forms & Signatures">
        <FieldRow label="FOC" value={c.foc} />
        <FieldRow label="Provider Forms" value={c.provider_forms} />
        <FieldRow label="Signatures Needed" value={c.signatures_needed} />
        <FieldRow label="Schedule/Supporting Documents Attached?" value={c.schedule_docs} />
      </Section>

      {/* Authorizations */}
      <Section title="Authorizations & Services">
        <FieldRow label="ATP" value={c.atp} />
        <FieldRow label="SNFs" value={c.snfs} />
        <FieldRow label="Lease" value={c.lease} />
      </Section>

      {/* CO/CFC Specific */}
      <Section title="CO Details">
        <FieldRow label="CO Financial Redetermination Due Date" value={c.co_financial_redet_date} dateStatus={getDateStatus(c.co_financial_redet_date)} />
        <FieldRow label="CO Application Date" value={c.co_app_date} />
        <FieldRow label="Request Letter" value={c.request_letter} />
        <FieldRow label="MFP Consent Form Date" value={c.mfp_consent_date} dateStatus={getDateStatus(c.mfp_consent_date)} />
        <FieldRow label="257 Date" value={c.two57_date} dateStatus={getDateStatus(c.two57_date)} />
      </Section>

      {/* Reporting */}
      <Section title="Reporting & Reviews">
        <FieldRow label="Reportable Events" value={c.reportable_events} />
        <FieldRow label="Appeals" value={c.appeals} />
        <FieldRow label="Audit Team Review" value={c.audit_review} />
        <FieldRow label="QA Team Review" value={c.qa_review} />
      </Section>

      {/* Assignment */}
      <Section title="Assignment">
        <FieldRow label="Assigned To" value={c.profiles?.full_name ?? 'Unassigned'} />
        <FieldRow label="Category" value={c.category.toUpperCase()} />
        <FieldRow label="Goal Progress" value={`${c.goal_pct}%`} />
        <FieldRow label="Created" value={c.created_at ? new Date(c.created_at).toLocaleDateString() : null} />
        <FieldRow label="Updated" value={c.updated_at ? new Date(c.updated_at).toLocaleDateString() : null} />
      </Section>
    </div>
  )
}
