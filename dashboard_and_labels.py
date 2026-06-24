#!/usr/bin/env python3
"""Dashboard banner + drop redundant page-name labels (keep Time Clock's).

1. PageBanner: page-name label becomes optional (renders only if `title` given).
2. Tasks/Tickets/Departments/PTO/Evaluations/Schedule/Training: drop their
   `title` so the banner shows photo only (no redundant label).
3. Time Clock: untouched (keeps its inline label).
4. Dashboard: full-width photo banner with the greeting overlaid, LiveClock
   below, and the "Here's what's happening..." subtitle removed.

Run from repo root:  python3 dashboard_and_labels.py
"""
import sys
def patch(path, edits):
    s=open(path,encoding="utf-8").read()
    for old,new,n in edits:
        c=s.count(old)
        if c!=n: sys.exit(f"ABORT {path}: expected {n}, found {c}: {old[:55]!r}")
        s=s.replace(old,new)
    open(path,"w",encoding="utf-8").write(s)

# 1) PageBanner: optional label
patch("components/workryn/PageBanner.tsx", [
 ("  title: string\n  bannerUrl: string","  title?: string\n  bannerUrl: string",1),
 ("""      <div style={{ position: 'absolute', left: 32, bottom: 26, zIndex: 2 }}>
        <Title order={1} className="banner-heading" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.01em', textShadow: '0 2px 18px rgba(0,0,0,0.55)' }}>
          {title}
        </Title>
      </div>""",
  """      {title ? (
        <div style={{ position: 'absolute', left: 32, bottom: 26, zIndex: 2 }}>
          <Title order={1} className="banner-heading" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.01em', textShadow: '0 2px 18px rgba(0,0,0,0.55)' }}>
            {title}
          </Title>
        </div>
      ) : null}""",1),
])

# 2) drop title on the 7 pages
for c,t in [("TasksClient","Tasks"),("TicketsClient","Tickets"),("DepartmentsClient","Departments"),
            ("PTOClient","PTO"),("EvaluationsClient","Evaluations"),("ScheduleClient","Schedule"),
            ("TrainingClient","Training")]:
    patch(f"components/workryn/{c}.tsx", [
      (f'<PageBanner title="{t}" bannerUrl={{bannerUrl}} />','<PageBanner bannerUrl={bannerUrl} />',1),
    ])

# 3) Dashboard page.tsx
patch("app/(workryn)/w/dashboard/page.tsx", [
 ("import DashboardClient from '@/components/workryn/DashboardClient'\n",
  "import DashboardClient from '@/components/workryn/DashboardClient'\nimport { getPageBannerUrl } from '@/lib/workryn/pageBanner'\n",1),
 ("  return (\n    <DashboardClient",
  "  const bannerUrl = await getPageBannerUrl('dashboard')\n\n  return (\n    <DashboardClient",1),
 ("      csRole={csRole}\n    />","      csRole={csRole}\n      bannerUrl={bannerUrl}\n    />",1),
])

# 4) DashboardClient
db_div='        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>'
db_branch=(
"        {bannerUrl ? (\n"
"          <>\n"
"            <PageBanner title={greet(user.name ?? 'there')} bannerUrl={bannerUrl} />\n"
'            <Group justify="flex-end" mb="lg">\n'
"              <LiveClock />\n"
"            </Group>\n"
"          </>\n"
"        ) : (\n"
+ db_div)
patch("components/workryn/DashboardClient.tsx", [
 ("} from '@mantine/core'\n","} from '@mantine/core'\nimport PageBanner from '@/components/workryn/PageBanner'\n",1),
 ("  csRole,\n}: Props) {","  csRole,\n  bannerUrl,\n}: Props & { bannerUrl?: string | null }) {",1),
 ('<Container size="xl" py="lg" className="wd-aurora">','<Container size="xl" py="lg" w="100%" className="wd-aurora">',1),
 # remove subtitle
 ('                </Title>\n                <Text size="md" c="dimmed">\n                  Here&apos;s what&apos;s happening in your workspace today.\n                </Text>\n              </Stack>',
  '                </Title>\n              </Stack>',1),
 # wrap hero
 (db_div, db_branch, 1),
 ("          </Paper>\n        </div>\n\n        {/* ============================== STATS ============================== */}",
  "          </Paper>\n        </div>\n        )}\n\n        {/* ============================== STATS ============================== */}",1),
])
print("Applied: PageBanner optional label + 7 title drops + dashboard banner.")
