/**
 * Canonical BLH 401(k) PSP (02J) fund lineup — single source of truth.
 *
 * Consumed by:
 *   - components/workryn/BenefitsClient.tsx  (the allocation grid)
 *   - lib/pdf/cdm.ts                         (stamping the CDM enrollment form)
 *
 * `cdmRow` / `cdmCol` are the measured positions on page 3 of the real CDM
 * Enrollment Form (raster grid 1500x1942 @150dpi); the PDF stamper converts
 * them to PDF points. Do NOT renumber `key` once data exists — allocations
 * are persisted as { [key]: wholePercent } in w_benefit_retirement_election.
 */

export type FundCol = 'L' | 'R'

export interface Fund {
  key: string
  label: string // exact label as printed on the CDM form
  cdmRow: number // raster y (px) of the fund's row on CDM page 3
  cdmCol: FundCol // L = left column, R = right column
  group: 'target' | 'us_index' | 'us_value' | 'intl' | 'bond_cash'
}

// Left column raster rows (px), top → bottom, matched to RIGHT column 1:1.
const ROWS = [908, 931, 955, 979, 1003, 1027, 1051, 1075, 1099, 1123, 1147]

const LEFT: Array<[string, Fund['group']]> = [
  ['DFA International Value I', 'intl'],
  ['DFA US Small Cap Value I', 'us_value'],
  ['Vanguard 500 Index Adm', 'us_index'],
  ['Vanguard Mid Cap Growth Index Adm', 'us_index'],
  ['Vanguard Small Cap Growth Index Adm', 'us_index'],
  ['Vanguard Target Retirement 2025', 'target'],
  ['Vanguard Target Retirement 2035', 'target'],
  ['Vanguard Target Retirement 2045', 'target'],
  ['Vanguard Target Retirement 2055', 'target'],
  ['Vanguard Target Retirement Income', 'target'],
  ['Vanguard Total Intl Stock Index Adm', 'intl'],
]

const RIGHT: Array<[string, Fund['group']]> = [
  ['DFA US Large Cap Value I', 'us_value'],
  ['Schwab Bank Savings', 'bond_cash'],
  ['Vanguard Large Cap Index Adm', 'us_index'],
  ['Vanguard Mid Cap Value Index Adm', 'us_index'],
  ['Vanguard Target Retirement 2020', 'target'],
  ['Vanguard Target Retirement 2030', 'target'],
  ['Vanguard Target Retirement 2040', 'target'],
  ['Vanguard Target Retirement 2050', 'target'],
  ['Vanguard Target Retirement 2060', 'target'],
  ['Vanguard Total Bond Market Index Adm', 'bond_cash'],
  ['Vanguard Total Stock Mkt Idx Adm', 'us_index'],
]

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function build(): Fund[] {
  const out: Fund[] = []
  LEFT.forEach(([label, group], i) =>
    out.push({ key: slug(label), label, cdmRow: ROWS[i], cdmCol: 'L', group }),
  )
  RIGHT.forEach(([label, group], i) =>
    out.push({ key: slug(label), label, cdmRow: ROWS[i], cdmCol: 'R', group }),
  )
  return out
}

export const FUNDS: Fund[] = build()

export const FUND_BY_KEY: Record<string, Fund> = Object.fromEntries(
  FUNDS.map((f) => [f.key, f]),
)

/** True when every key is known and the whole-number percentages total 100. */
export function allocationsValid(allocations: Record<string, number>): boolean {
  const entries = Object.entries(allocations)
  if (entries.length === 0) return false
  let total = 0
  for (const [key, pct] of entries) {
    if (!FUND_BY_KEY[key]) return false
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) return false
    total += pct
  }
  return total === 100
}
