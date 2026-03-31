export interface EligibilityCode {
  code: string
  description: string
}

export const ELIGIBILITY_CODES: EligibilityCode[] = [
  { code: '*†S04', description: 'Pickle Amendment' },
  { code: '*A02', description: 'Adults Ages 19 to <65, no Medicare; up to 138% FPL (includes Adults with children (<65, no Medicare); 124%–138% FPL)' },
  { code: '*†S05', description: 'Disabled Widowed Beneficiaries (DWB) § 1634(d)' },
  { code: '*A03', description: 'Disabled adults, no Medicare, up to 77% FPL (not newly eligible)' },
  { code: '*A04', description: 'No spend-down for newly eligible adults' },
  { code: '*†S19', description: 'Disabled Adult Children (DAC) § 1634(c)' },
  { code: '*†S20', description: 'Disabled Widowed Beneficiaries (DWB) § 1634(b)' },
  { code: 'F05', description: 'Low-income parents/caretaker relatives, any age, Medicare permitted, up to 123% FPL' },
  { code: '*†S98', description: 'Transitional Medical Assistance' },
  { code: '†S99', description: 'ABD – Medically Needy / ABD – Medically Needy With Spend-down' },
  { code: '*F02', description: 'Post-low-income parents/children: earnings' },
  { code: '*P02', description: 'Pregnant Women up to 189% FPL' },
  { code: '*P11', description: 'Pregnant Women 190% – 264% FPL' },
  { code: '*P06', description: 'Child Under 1 in LTC (P06 Standards)' },
  { code: '*P07', description: 'Child Under 6/19 in LTC (P07 Standards)' },
  { code: '*F98', description: 'Child in LTC With Spend-down' },
  { code: '*P13', description: 'Newborns of Eligible Mothers; children <1 yr up to 199% FPL; or deemed newborns; Children 1–6 yrs 143% FPL; 6–19 yrs 138% FPL; Children 19 & 20 yrs up to 123% FPL' },
  { code: '*†H01', description: 'HCBS Waiver and PACE participants up to 189% FPL' },
  { code: '*D02', description: 'MCHP Premium, 212–264% FPL' },
  { code: '*D04', description: 'MCHP Premium, 265–322% FPL' },
  { code: '*†E01', description: 'IV-E or SSI, Foster Care or Subsidized Adoptions' },
  { code: '*†E02', description: 'Non-IV-E, Foster Care or Special Needs Subsidized Adoption & Subsidized Guardianship' },
  { code: '*E05', description: 'Former Foster Care 21 up to 26 years old' },
  { code: '*†S01', description: 'Public Assistance to Adults (PAA)' },
  { code: '*†S02', description: 'SSI Recipients' },
]

export function getEligibilityDescription(code: string): string {
  return ELIGIBILITY_CODES.find(e => e.code === code)?.description ?? ''
}
