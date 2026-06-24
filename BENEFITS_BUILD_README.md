# Workryn Benefits page — build bundle

The 3-table migration is already applied (verified live). This bundle adds the
page, forms, PDF stamping, and infra patches.

## Apply (from repo root `/home/casesync/casesync`, clean tree)
1. `git status`  → confirm a clean tree on `main`.
2. `tar xzf benefits_build.tar.gz`   (drops new files in place + the patch script at root)
3. `python3 apply_benefits_patches.py`   → expect 11 `[ok]` lines, then "All infra patches applied."
   (patches prisma/schema.prisma, lib/workryn/email.ts, lib/workryn/aurora.ts,
    components/workryn/WorkrynSidebar.tsx, package.json — each with an exact-occurrence assert)
4. `npm install`   (installs pdf-lib ^1.17.1; `build` already runs `prisma generate`)
5. Commit EXPLICIT paths (do NOT commit the script/README/tarball):
   git add lib/benefits/funds.ts lib/pdf/cdm.ts lib/pdf/cdmBlank.ts \
           app/actions/benefits.ts "app/(workryn)/w/benefits/page.tsx" \
           components/workryn/BenefitsClient.tsx public/benefits \
           prisma/schema.prisma lib/workryn/email.ts lib/workryn/aurora.ts \
           components/workryn/WorkrynSidebar.tsx package.json package-lock.json
   git commit -m "Add Workryn /w/benefits page (gym/401k/mileage in-portal + PDF to Bianca)"
   git push origin main
6. Poll Vercel deploy → READY, then open /w/benefits.

## Operational notes
- Emails to Bianca (gym + 401k PDF) and mileage@blhnurses.com only SEND once
  SMTP_* env vars are set in Vercel. Until then sendEmail is a dev no-op and
  `emailedAt` stays null (the election/row still saves).
- 401(k) form scope = percent (pre-tax) deferral, 22-fund grid, one primary +
  one contingent beneficiary (matches the measured CDM coordinates). SSN/DOB are
  collected at submit only to stamp the PDF — never written to the DB.
- A few intentional deviations from the v6 prototype, flagged for your review:
  401(k) is enroll-only (no waive toggle — the data model is an election);
  mileage submits one trip per row (append-only model); the 401(k) form adds a
  transient "details for your enrollment form" block (SSN/DOB/address) needed to
  complete the CDM PDF.
