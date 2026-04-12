import { redirect } from 'next/navigation'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'

const HEADER: (string | Date | number)[] = [
  'client_id','first_name','last_name','category','eligibility_code','eligibility_end_date','last_contact_date','last_contact_type','three_month_visit_date','three_month_visit_due','quarterly_waiver_date','drop_in_visit_date','poc_date','loc_date','med_tech_redet_date','med_tech_status','pos_deadline','pos_status','assessment_due','spm_completed','spm_next_due','foc','provider_forms','signatures_needed','schedule_docs','atp','snfs','lease','reportable_events','appeals','thirty_day_letter_date','co_financial_redet_date','co_app_date','request_letter','mfp_consent_date','two57_date','doc_mdh_date','goal_pct','client_classification','notes'
]

const SAMPLE: (string | Date | number)[] = [
  'BLH-2001','John','Smith','co','ELIG-B',new Date('2026-11-30'),new Date('2026-04-03'),'home_visit',new Date('2026-03-20'),new Date('2026-06-20'),new Date('2026-09-15'),new Date('2026-04-11'),new Date('2026-04-06'),new Date('2026-04-08'),new Date('2026-10-05'),'pending',new Date('2026-05-05'),'in_progress',new Date('2026-05-22'),'TRUE',new Date('2026-07-03'),'complete','pending','needed','FALSE','received','clear','on_file','','none',new Date('2026-05-18'),new Date('2026-08-04'),new Date('2026-06-04'),'sent',new Date('2026-06-24'),new Date('2026-07-14'),new Date('2026-04-27'),68,'real','Planner example row - replace before import'
]

const DATE_COLUMNS = new Set([
  'eligibility_end_date','last_contact_date','three_month_visit_date','three_month_visit_due','quarterly_waiver_date','drop_in_visit_date','poc_date','loc_date','med_tech_redet_date','pos_deadline','assessment_due','spm_next_due','thirty_day_letter_date','co_financial_redet_date','co_app_date','mfp_consent_date','two57_date','doc_mdh_date'
])

function buildWorkbook() {
  const worksheet = XLSX.utils.aoa_to_sheet([HEADER, SAMPLE])
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')

  for (let col = 0; col <= range.e.c; col++) {
    const headerCell = XLSX.utils.encode_cell({ r: 0, c: col })
    const sampleCell = XLSX.utils.encode_cell({ r: 1, c: col })
    const header = worksheet[headerCell]?.v as string | undefined
    if (DATE_COLUMNS.has(header || '') && worksheet[sampleCell]) {
      worksheet[sampleCell].t = 'd'
      worksheet[sampleCell].z = 'yyyy-mm-dd'
    }
  }

  worksheet['!cols'] = HEADER.map((key) => ({ wch: Math.max(String(key).length + 2, 14) }))
  worksheet['!autofilter'] = { ref: worksheet['!ref'] || 'A1' }
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1 }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Planner Import Template')
  return workbook
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'supports_planner') {
    redirect('/dashboard')
  }

  const workbook = buildWorkbook()
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const body = new Uint8Array(buffer)

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="planner-client-import-template.xlsx"',
      'cache-control': 'private, no-store',
    },
  })
}
