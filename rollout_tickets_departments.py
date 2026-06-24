#!/usr/bin/env python3
"""Page-banner rollout batch 2: Tickets + Departments.

Same recipe as Tasks: full-width container, PageBanner (260px, white label),
action button relocated below the banner, original hero as empty-folder
fallback. Departments' button stays admin-gated (isAdmin).

Run from repo root:  python3 rollout_tickets_departments.py
Aborts (no writes) if any anchor doesn't match.
"""
import sys
def patch(path, edits):
    s=open(path,encoding="utf-8").read()
    for old,new,n in edits:
        c=s.count(old)
        if c!=n: sys.exit(f"ABORT {path}: expected {n}, found {c}: {old[:50]!r}")
        s=s.replace(old,new)
    open(path,"w",encoding="utf-8").write(s)

herodiv='        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>'

# ---------------- TICKETS ----------------
patch("app/(workryn)/w/tickets/page.tsx", [
 ("import TicketsClient from '@/components/workryn/TicketsClient'\n",
  "import TicketsClient from '@/components/workryn/TicketsClient'\nimport { getPageBannerUrl } from '@/lib/workryn/pageBanner'\n",1),
 ("  return (\n    <TicketsClient",
  "  const bannerUrl = await getPageBannerUrl('tickets')\n\n  return (\n    <TicketsClient",1),
 ("      currentUser={{ id: session!.user.id, role: session!.user.role }}\n    />",
  "      currentUser={{ id: session!.user.id, role: session!.user.role }}\n      bannerUrl={bannerUrl}\n    />",1),
])
ti_branch=('        {bannerUrl ? (\n          <>\n            <PageBanner title="Tickets" bannerUrl={bannerUrl} />\n'
 '            <Group justify="flex-end" mb="lg">\n'
 "              <Button size=\"md\" leftSection={<Plus size={16} />} onClick={() => { resetForm(); modal.open() }} className=\"tia-btn-primary\">New Ticket</Button>\n"
 '            </Group>\n          </>\n        ) : (\n'+herodiv)
patch("components/workryn/TicketsClient.tsx", [
 ("} from '@mantine/core'\n","} from '@mantine/core'\nimport PageBanner from '@/components/workryn/PageBanner'\n",1),
 ("({ initialTickets, users, departments, currentUser }: Props) {",
  "({ initialTickets, users, departments, currentUser, bannerUrl }: Props & { bannerUrl?: string | null }) {",1),
 ('<Container size="xl" py="lg" className="tia-root">','<Container size="xl" py="lg" w="100%" className="tia-root">',1),
 (herodiv, ti_branch, 1),
 ("        </div>\n\n        {/* ============ STAT CARDS ============ */}",
  "        </div>\n        )}\n\n        {/* ============ STAT CARDS ============ */}",1),
])

# ---------------- DEPARTMENTS ----------------
patch("app/(workryn)/w/departments/page.tsx", [
 ("import DepartmentsClient from '@/components/workryn/DepartmentsClient'\n",
  "import DepartmentsClient from '@/components/workryn/DepartmentsClient'\nimport { getPageBannerUrl } from '@/lib/workryn/pageBanner'\n",1),
 ("  return (\n    <DepartmentsClient",
  "  const bannerUrl = await getPageBannerUrl('departments')\n\n  return (\n    <DepartmentsClient",1),
 ("      currentUserRole={session.user.role}\n    />",
  "      currentUserRole={session.user.role}\n      bannerUrl={bannerUrl}\n    />",1),
])
dp_branch=('        {bannerUrl ? (\n          <>\n            <PageBanner title="Departments" bannerUrl={bannerUrl} />\n'
 '            {isAdmin && (\n              <Group justify="flex-end" mb="lg">\n'
 '                <Button size="md" leftSection={<Plus size={16} />} onClick={openCreate} className="dpa-btn-primary">New Department</Button>\n'
 '              </Group>\n            )}\n          </>\n        ) : (\n'+herodiv)
patch("components/workryn/DepartmentsClient.tsx", [
 ("} from '@mantine/core'\n","} from '@mantine/core'\nimport PageBanner from '@/components/workryn/PageBanner'\n",1),
 ("({ initialDepartments, users, currentUserRole }: Props) {",
  "({ initialDepartments, users, currentUserRole, bannerUrl }: Props & { bannerUrl?: string | null }) {",1),
 ('<Container size="xl" py="lg" className="dpa-root">','<Container size="xl" py="lg" w="100%" className="dpa-root">',1),
 (herodiv, dp_branch, 1),
 ("        </div>\n\n        {/* ============ SEARCH BAR ============ */}",
  "        </div>\n        )}\n\n        {/* ============ SEARCH BAR ============ */}",1),
])
print("Tickets + Departments banner wiring applied.")
