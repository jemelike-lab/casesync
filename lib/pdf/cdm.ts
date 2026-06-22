/**
 * CDM 401(k) Enrollment Form stamper + Gym Election PDF builder (Node / pdf-lib).
 *
 * Ported 1:1 from the measured reportlab coordinate map (cdm_overlay.py):
 *   page size 720 x 931.92 pt; raster grid 1500 x 1942 px @150dpi.
 *   X(px) = px * 720/1500 ; Y(py) = 931.92 - py * 931.92/1942.
 * pdf-lib uses a bottom-left origin (same as reportlab), so the transforms
 * are identical. We draw straight onto the loaded original pages — no merge.
 *
 * MEASURED COVERAGE (from the prior session): page-2 participant + ONE primary
 * and ONE contingent beneficiary row; page-3 enrollment fields, the PERCENT
 * deferral box, the 22-fund allocation grid, and both signatures.
 * NOT yet measured: additional beneficiary rows, and the dollar-amount
 * deferral box. `deferralType: 'amount'` is flagged below until measured.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { FUND_BY_KEY } from '@/lib/benefits/funds'

const PH = 931.92
const SX = 720 / 1500
const SY = 931.92 / 1942
const X = (px: number) => px * SX
const Y = (py: number) => PH - py * SY
const BLACK = rgb(0, 0, 0)

export interface CdmBeneficiary {
  name: string
  dob?: string
  ssn?: string
  address?: string
  relationship?: string
  percent: number
}

export interface CdmData {
  name: string
  ssn?: string
  addr?: string
  city?: string
  state?: string
  zip?: string
  email?: string
  phone?: string
  dob?: string
  hire?: string
  deferralType: 'percent' | 'amount'
  deferralValue: number
  allocations: Record<string, number> // fund key -> whole %
  primary?: CdmBeneficiary
  contingent?: CdmBeneficiary
  signatureName: string
  date: string // mm/dd/yyyy
}

function drawerFor(page: PDFPage, fonts: { helv: PDFFont; bold: PDFFont; obl: PDFFont }) {
  const left = (px: number, py: number, s: unknown, size = 9, font = fonts.helv) =>
    page.drawText(String(s ?? ''), { x: X(px), y: Y(py), size, font, color: BLACK })
  const center = (px: number, py: number, s: unknown, size = 9, font = fonts.helv) => {
    const str = String(s ?? '')
    const w = font.widthOfTextAtSize(str, size)
    page.drawText(str, { x: X(px) - w / 2, y: Y(py), size, font, color: BLACK })
  }
  return { left, center }
}

/** Stamp the employee's election onto the blank CDM form. Returns PDF bytes. */
export async function fillCdmEnrollmentPdf(blankBytes: Uint8Array, d: CdmData): Promise<Uint8Array> {
  const doc = await PDFDocument.load(blankBytes)
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const obl = await doc.embedFont(StandardFonts.HelveticaOblique)
  const pages = doc.getPages()
  if (pages.length < 3) throw new Error(`CDM form expected 3 pages, got ${pages.length}`)

  // ---- PAGE 2 — beneficiary designation ----
  {
    const { left, center } = drawerFor(pages[1], { helv, bold, obl })
    left(175, 219, d.name)
    left(806, 219, d.ssn)
    if (d.primary) {
      left(175, 446, d.primary.name)
      left(670, 446, d.primary.dob)
      left(1045, 446, d.primary.ssn)
      left(195, 499, d.primary.address)
      left(670, 499, d.primary.relationship)
      center(1240, 499, d.primary.percent)
    }
    if (d.contingent) {
      left(175, 719, d.contingent.name)
      left(670, 719, d.contingent.dob)
      left(1045, 719, d.contingent.ssn)
      left(195, 773, d.contingent.address)
      left(670, 773, d.contingent.relationship)
      center(1240, 773, d.contingent.percent)
    }
    left(120, 1122, d.signatureName, 14, obl)
    left(630, 1122, d.date)
  }

  // ---- PAGE 3 — enrollment + deferral + investments ----
  {
    const { left, center } = drawerFor(pages[2], { helv, bold, obl })
    left(175, 268, d.name)
    left(835, 268, d.ssn)
    left(195, 331, d.addr)
    left(715, 331, d.city)
    left(1020, 331, d.state)
    left(1220, 331, d.zip)
    left(235, 393, d.email)
    left(1095, 393, d.phone)
    left(230, 449, d.dob)
    left(905, 449, d.hire)

    // deferral — only the PERCENT box/position is measured
    if (d.deferralType === 'percent') {
      center(109, 646, 'X', 11, bold)
      center(418, 657, d.deferralValue)
    } else {
      // dollar-amount box position not yet measured — see header note.
      throw new Error('CDM stamp: dollar-amount deferral position not yet measured; use percent or measure the $ box first')
    }

    // investment allocations
    for (const [key, pct] of Object.entries(d.allocations)) {
      const f = FUND_BY_KEY[key]
      if (!f || !pct) continue
      const cx = f.cdmCol === 'L' ? 590 : 1108
      center(cx, f.cdmRow - 4, pct)
    }

    left(150, 1336, d.signatureName, 14, obl)
    left(960, 1336, d.date)
  }

  return doc.save()
}

// ---------------------------------------------------------------------------
// Gym election PDF — generated in-app (there is no source PDF for this form).
// ---------------------------------------------------------------------------
export const GYM_SELECTION_LABEL: Record<string, string> = {
  pf_option_1: 'Planet Fitness — Option 1 (Classic, home club) — employee $11/mo',
  pf_option_2: 'Planet Fitness — Option 2 (Black Card, all locations) — employee $16/mo',
  la_fitness: 'LA Fitness (single membership) — employee $29.99/mo',
  waive: 'Waive — declining gym membership at this time',
}

export interface GymElectionData {
  name: string
  selection: keyof typeof GYM_SELECTION_LABEL | string
  preferredStartDate?: string
  authorizationAck: boolean
  signatureName: string
  date: string
}

export async function buildGymElectionPdf(d: GymElectionData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792]) // US Letter
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const rose = rgb(0.957, 0.247, 0.369) // #F43F5E
  const ink = rgb(0.09, 0.1, 0.13)
  const muted = rgb(0.42, 0.45, 0.5)
  const M = 56
  let y = 736

  page.drawRectangle({ x: 0, y: 788, width: 612, height: 4, color: rose })
  page.drawText('Beatrice Loving Heart', { x: M, y, size: 20, font: bold, color: ink })
  y -= 22
  page.drawText('Gym Membership Election', { x: M, y, size: 13, font: helv, color: muted })
  y -= 40

  const row = (label: string, value: string) => {
    page.drawText(label, { x: M, y, size: 9, font: bold, color: muted })
    y -= 15
    const lines = wrap(value, helv, 11, 612 - M * 2)
    for (const ln of lines) {
      page.drawText(ln, { x: M, y, size: 11, font: helv, color: ink })
      y -= 16
    }
    y -= 12
  }

  row('EMPLOYEE', d.name)
  row('ELECTION', GYM_SELECTION_LABEL[d.selection] ?? String(d.selection))
  if (d.selection !== 'waive') row('PREFERRED START DATE', d.preferredStartDate || '—')
  row(
    'AUTHORIZATION',
    d.authorizationAck
      ? 'I authorize the corresponding payroll deduction for the membership elected above.'
      : 'Not acknowledged',
  )

  y -= 16
  page.drawLine({ start: { x: M, y: y + 8 }, end: { x: 612 - M, y: y + 8 }, thickness: 0.75, color: rgb(0.85, 0.86, 0.88) })
  y -= 14
  page.drawText('SIGNATURE', { x: M, y, size: 9, font: bold, color: muted })
  page.drawText('DATE', { x: 612 - M - 120, y, size: 9, font: bold, color: muted })
  y -= 20
  page.drawText(d.signatureName, { x: M, y, size: 15, font: await doc.embedFont(StandardFonts.HelveticaOblique), color: ink })
  page.drawText(d.date, { x: 612 - M - 120, y, size: 11, font: helv, color: ink })

  return doc.save()
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = String(text).split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (font.widthOfTextAtSize(t, size) > maxW && cur) {
      lines.push(cur)
      cur = w
    } else cur = t
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}
