import { createClient } from '@/lib/supabase/server'
import { Client, formatDate, getDateStatus } from '@/lib/types'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

function PrintRow({ label, value }: { label: string; value: string | null | boolean | number | undefined }) {
  if (value === null || value === undefined || value === '') return null
  let display = ''
  if (typeof value === 'boolean') display = value ? 'Yes' : 'No'
  else display = String(value)

  return (
    <tr>
      <td style={{ padding: '6px 12px', fontWeight: 600, width: '40%', verticalAlign: 'top', borderBottom: '1px solid #ddd', color: '#333', fontSize: 13 }}>{label}</td>
      <td style={{ padding: '6px 12px', borderBottom: '1px solid #ddd', fontSize: 13, color: '#111' }}>{display}</td>
    </tr>
  )
}

function PrintDateRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  const status = getDateStatus(value)
  const color = status === 'red' ? '#c0392b' : status === 'orange' ? '#e67e22' : status === 'yellow' ? '#f39c12' : '#27ae60'
  return (
    <tr>
      <td style={{ padding: '6px 12px', fontWeight: 600, width: '40%', verticalAlign: 'top', borderBottom: '1px solid #ddd', color: '#333', fontSize: 13 }}>{label}</td>
      <td style={{ padding: '6px 12px', borderBottom: '1px solid #ddd', fontSize: 13, color: status !== 'none' ? color : '#111' }}>{formatDate(value)}</td>
    </tr>
  )
}

function PrintSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#555', margin: '0 0 8px 0', borderBottom: '2px solid #333', paddingBottom: 4 }}>{title}</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: client, error } = await supabase
    .from('clients')
    .select('*, profiles!clients_assigned_to_fkey(id, full_name, role)')
    .eq('id', id)
    .single()

  if (error || !client) notFound()

  const c = client as Client

  return (
    <html>
      <head>
        <title>{c.last_name}, {c.first_name} — CaseSync</title>
        <style>{`
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: white; color: black; }
          @media print {
            body { padding: 10px; }
            button { display: none !important; }
            @page { margin: 1cm; }
          }
        `}</style>
      </head>
      <body>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {/* Print button */}
          <button
            onClick={() => window.print()}
            style={{
              marginBottom: 20, padding: '8px 16px', background: '#007aff', color: 'white',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
            }}
          >
            🖨️ Print
          </button>

          {/* Header */}
          <div style={{ marginBottom: 24, borderBottom: '2px solid #333', paddingBottom: 12 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{c.last_name}, {c.first_name}</h1>
            <div style={{ display: 'flex', gap: 20, marginTop: 6, fontSize: 13, color: '#555' }}>
              <span>Client ID: <strong>{c.client_id}</strong></span>
              <span>Category: <strong style={{ textTransform: 'uppercase' }}>{c.category}</strong></span>
              {c.eligibility_code && <span>Eligibility: <strong>{c.eligibility_code}</strong></span>}
              <span>Assigned To: <strong>{c.profiles?.full_name ?? 'Unassigned'}</strong></span>
              <span>Goal: <strong>{c.goal_pct}%</strong></span>
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              Printed: {new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
            </div>
          </div>

          <PrintSection title="Eligibility">
            <PrintRow label="Eligibility Code" value={c.eligibility_code} />
            <PrintDateRow label="Eligibility End Date" value={c.eligibility_end_date} />
          </PrintSection>

          <PrintSection title="Contact & Visits">
            <PrintDateRow label="Last Contact Date" value={c.last_contact_date} />
            <PrintRow label="Last Contact Type" value={c.last_contact_type} />
            <PrintDateRow label="Drop-in Visit Date" value={c.drop_in_visit_date} />
            <PrintDateRow label="30-Day Letter Date" value={c.thirty_day_letter_date} />
            <PrintDateRow label="3-Month Visit Date" value={c.three_month_visit_date} />
            <PrintDateRow label="3-Month Visit Due" value={c.three_month_visit_due} />
            <PrintDateRow label="Quarterly Waiver Date" value={c.quarterly_waiver_date} />
          </PrintSection>

          <PrintSection title="Med Tech">
            <PrintDateRow label="Med-Tech Redet Date" value={c.med_tech_redet_date} />
            <PrintRow label="Med/Tech Status" value={c.med_tech_status} />
          </PrintSection>

          <PrintSection title="Plans & Assessments">
            <PrintDateRow label="POC Date" value={c.poc_date} />
            <PrintDateRow label="LOC Date" value={c.loc_date} />
            <PrintDateRow label="Documentation MDH" value={c.doc_mdh_date} />
            <PrintDateRow label="POS Deadline" value={c.pos_deadline} />
            <PrintRow label="POS Status" value={c.pos_status} />
            <PrintDateRow label="Assessment Due" value={c.assessment_due} />
            <PrintRow label="SPM Completed" value={c.spm_completed} />
            <PrintDateRow label="SPM Next Due" value={c.spm_next_due} />
          </PrintSection>

          <PrintSection title="Forms & Signatures">
            <PrintRow label="FOC" value={c.foc} />
            <PrintRow label="Provider Forms" value={c.provider_forms} />
            <PrintRow label="Signatures Needed" value={c.signatures_needed} />
            <PrintRow label="Schedule Docs Attached" value={c.schedule_docs} />
          </PrintSection>

          <PrintSection title="Authorizations">
            <PrintRow label="ATP" value={c.atp} />
            <PrintRow label="SNFs" value={c.snfs} />
            <PrintRow label="Lease" value={c.lease} />
          </PrintSection>

          <PrintSection title="CO Details">
            <PrintDateRow label="CO Financial Redet Date" value={c.co_financial_redet_date} />
            <PrintDateRow label="CO App Date" value={c.co_app_date} />
            <PrintRow label="Request Letter" value={c.request_letter} />
            <PrintDateRow label="MFP Consent Date" value={c.mfp_consent_date} />
            <PrintDateRow label="257 Date" value={c.two57_date} />
          </PrintSection>

          <PrintSection title="Reporting & Reviews">
            <PrintRow label="Reportable Events" value={c.reportable_events} />
            <PrintRow label="Appeals" value={c.appeals} />
            <PrintRow label="Audit Review" value={c.audit_review} />
            <PrintRow label="QA Review" value={c.qa_review} />
          </PrintSection>
        </div>
      </body>
    </html>
  )
}
