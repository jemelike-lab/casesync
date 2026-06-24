#!/usr/bin/env python3
"""
Benefits build — anchored patches to existing files.
Run from the repo root:  python3 apply_benefits_patches.py
Every edit asserts exactly one occurrence of its anchor, so a drifted file
fails loudly instead of silently mis-patching. Re-running is a no-op-safe
error (anchors already consumed) — apply once on a clean tree.
"""
import sys, pathlib

def patch(path, old, new, label):
    p = pathlib.Path(path)
    s = p.read_text()
    n = s.count(old)
    if n != 1:
        sys.exit(f"[FAIL] {label}: expected 1 occurrence in {path}, found {n}")
    p.write_text(s.replace(old, new))
    print(f"[ok] {label}")

# ── 1) prisma/schema.prisma — three benefit models + User back-relations ──
patch(
    "prisma/schema.prisma",
    '  intuitEmployeeMap  IntuitEmployeeMap?\n\n  @@schema("public")\n  @@map("w_user")',
    '  intuitEmployeeMap  IntuitEmployeeMap?\n\n'
    '  // ── Benefits ──\n'
    '  benefitGymSelection       BenefitGymSelection?\n'
    '  benefitRetirementElection BenefitRetirementElection?\n'
    '  benefitMileageSubmissions BenefitMileageSubmission[]\n\n'
    '  @@schema("public")\n  @@map("w_user")',
    "schema: User back-relations",
)

BENEFIT_MODELS = '''

// ─────────────────────────────────────────────────────────────────────────
// Benefits (Workryn) — see benefits_migration.sql. RLS lives in the DB.
// ─────────────────────────────────────────────────────────────────────────
model BenefitGymSelection {
  id                 String    @id @default(cuid())
  userId             String    @unique
  selection          String    // 'pf_option_1' | 'pf_option_2' | 'la_fitness' | 'waive'
  preferredStartDate DateTime? @db.Date
  authorizationAck   Boolean   @default(false)
  signatureName      String
  signedAt           DateTime  @default(now())
  emailedAt          DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  user               User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("w_benefit_gym_selection")
  @@schema("public")
}

model BenefitRetirementElection {
  id            String    @id @default(cuid())
  userId        String    @unique
  deferralType  String    // 'percent' | 'amount'
  deferralValue Decimal   @db.Decimal(10, 2)
  preTax        Boolean   @default(true)
  allocations   Json      @default("{}") // { fundKey: wholePercent } summing to 100
  beneficiaries Json      @default("[]") // [{ tier, name, relationship, percent }]
  signatureName String
  signedAt      DateTime  @default(now())
  emailedAt     DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("w_benefit_retirement_election")
  @@schema("public")
}

model BenefitMileageSubmission {
  id          String    @id @default(cuid())
  userId      String
  tripDate    DateTime  @db.Date
  miles       Decimal   @db.Decimal(8, 1)
  purpose     String?
  ratePerMile Decimal?  @db.Decimal(6, 3)
  amount      Decimal?  @db.Decimal(10, 2)
  submittedAt DateTime  @default(now())
  emailedAt   DateTime?
  createdAt   DateTime  @default(now())
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([userId, tripDate])
  @@map("w_benefit_mileage_submission")
  @@schema("public")
}
'''
# append models at EOF (assert they aren't already present)
sp = pathlib.Path("prisma/schema.prisma")
sc = sp.read_text()
if "model BenefitGymSelection" in sc:
    sys.exit("[FAIL] schema: benefit models already present")
sp.write_text(sc.rstrip() + "\n" + BENEFIT_MODELS)
print("[ok] schema: benefit models appended")

# ── 2) lib/workryn/email.ts — attachment passthrough ──
patch(
    "lib/workryn/email.ts",
    "  html?: string\n  replyTo?: string\n}",
    "  html?: string\n  replyTo?: string\n"
    "  attachments?: Array<{ filename: string; content: Buffer | Uint8Array | string; contentType?: string }>\n}",
    "email: SendOptions.attachments",
)
patch(
    "lib/workryn/email.ts",
    "      replyTo: opts.replyTo,\n    })",
    "      replyTo: opts.replyTo,\n      attachments: opts.attachments,\n    })",
    "email: sendMail attachments",
)
patch(
    "lib/workryn/email.ts",
    "      preview: (opts.text || opts.html || '').slice(0, 200),\n    })",
    "      preview: (opts.text || opts.html || '').slice(0, 200),\n      attachments: opts.attachments?.length || 0,\n    })",
    "email: dev-log attachments",
)

# ── 3) lib/workryn/aurora.ts — add rose accent ──
patch(
    "lib/workryn/aurora.ts",
    "  | 'amber'\n\nexport const AURORA_ACCENTS",
    "  | 'amber'\n  | 'rose'\n\nexport const AURORA_ACCENTS",
    "aurora: union",
)
patch(
    "lib/workryn/aurora.ts",
    "  amber:   { hex: '#F59E0B', rgb: '245,158,11',  soft: 'rgba(245,158,11,0.18)',  bar: 'linear-gradient(90deg, #fbbf24, #d97706)' },\n}",
    "  amber:   { hex: '#F59E0B', rgb: '245,158,11',  soft: 'rgba(245,158,11,0.18)',  bar: 'linear-gradient(90deg, #fbbf24, #d97706)' },\n"
    "  rose:    { hex: '#F43F5E', rgb: '244,63,94',   soft: 'rgba(244,63,94,0.18)',   bar: 'linear-gradient(90deg, #fb7185, #F43F5E)' },\n}",
    "aurora: accent map",
)
patch(
    "lib/workryn/aurora.ts",
    "  '/w/admin':       'amber',\n}",
    "  '/w/admin':       'amber',\n  '/w/benefits':    'rose',\n}",
    "aurora: route map",
)

# ── 4) components/workryn/WorkrynSidebar.tsx — icon + nav item ──
patch(
    "components/workryn/WorkrynSidebar.tsx",
    "  Bell, Check, User, ArrowLeftRight, Menu, X,\n} from 'lucide-react'",
    "  Bell, Check, User, ArrowLeftRight, Menu, X, HeartHandshake,\n} from 'lucide-react'",
    "sidebar: lucide import",
)
patch(
    "components/workryn/WorkrynSidebar.tsx",
    "  { href: '/w/pto',         label: 'PTO',         icon: Umbrella,        accent: 'teal' },",
    "  { href: '/w/pto',         label: 'PTO',         icon: Umbrella,        accent: 'teal' },\n"
    "  { href: '/w/benefits',    label: 'Benefits',    icon: HeartHandshake,  accent: 'rose' },",
    "sidebar: nav item",
)

# ── 5) package.json — add pdf-lib ──
patch(
    "package.json",
    '    "nodemailer": "^7.0.13",\n    "postgres": "^3.4.9",',
    '    "nodemailer": "^7.0.13",\n    "pdf-lib": "^1.17.1",\n    "postgres": "^3.4.9",',
    "package.json: pdf-lib",
)

print("\nAll infra patches applied.")
