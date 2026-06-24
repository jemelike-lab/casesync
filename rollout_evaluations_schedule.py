#!/usr/bin/env python3
"""Page-banner rollout batch 4 (final): Evaluations + Schedule.

Evaluations: PageBanner + its two conditionally-gated buttons (self-assessment,
new template) relocated below, original hero as fallback.

Schedule: PageBanner + a faithful controls toolbar below it (week nav, Today,
period label, staff filter, Month/Week/Day toggle, New Shift) so no scheduling
control is lost. Original hero kept as the empty-folder fallback.

Run from repo root:  python3 rollout_evaluations_schedule.py
"""
import sys
def patch(path, edits):
    s=open(path,encoding="utf-8").read()
    for old,new,n in edits:
        c=s.count(old)
        if c!=n: sys.exit(f"ABORT {path}: expected {n}, found {c}: {old[:55]!r}")
        s=s.replace(old,new)
    open(path,"w",encoding="utf-8").write(s)

# ================= EVALUATIONS =================
patch("app/(workryn)/w/evaluations/page.tsx", [
 ("import { getWorkrynSession } from '@/lib/workryn/auth'\n",
  "import { getWorkrynSession } from '@/lib/workryn/auth'\nimport { getPageBannerUrl } from '@/lib/workryn/pageBanner'\n",1),
 ("  return (\n    <EvaluationsClient",
  "  const bannerUrl = await getPageBannerUrl('evaluations')\n\n  return (\n    <EvaluationsClient",1),
 ("      }}\n    />",
  "      }}\n      bannerUrl={bannerUrl}\n    />",1),
])
eva_div='      <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>'
eva_branch=(
'      {bannerUrl ? (\n'
'        <>\n'
'          <PageBanner title="Evaluations" bannerUrl={bannerUrl} />\n'
'          <Group justify="flex-end" mb="lg">\n'
'            {!isManager && getApplicableTemplate(templates, currentUser.hireDate) && (\n'
'              <Button size="md" leftSection={<Edit2 size={16} />} onClick={() => setShowSelfAssessment(true)} className="eva-btn-primary">Start {getMilestoneLabel(getDaysSinceHire(currentUser.hireDate))} Self-Assessment</Button>\n'
'            )}\n'
"            {isAdmin && tab === 'templates' && (\n"
'              <Button size="md" leftSection={<Plus size={16} />} onClick={() => { setTemplateToEdit(null); setShowTemplateBuilder(true) }} className="eva-btn-primary">New Template</Button>\n'
'            )}\n'
'          </Group>\n'
'        </>\n'
'      ) : (\n'
+ eva_div)
patch("components/workryn/EvaluationsClient.tsx", [
 ("} from '@mantine/core'\n","} from '@mantine/core'\nimport PageBanner from '@/components/workryn/PageBanner'\n",1),
 ("  currentUser,\n}: Props) {","  currentUser,\n  bannerUrl,\n}: Props & { bannerUrl?: string | null }) {",1),
 ('    <Container size="xl" py="lg" className="eva-root">','    <Container size="xl" py="lg" w="100%" className="eva-root">',1),
 (eva_div, eva_branch, 1),
 ("      </div>\n\n      {/* ============ STAT CARDS ============ */}",
  "      </div>\n      )}\n\n      {/* ============ STAT CARDS ============ */}",1),
])

# ================= SCHEDULE =================
patch("app/(workryn)/w/schedule/page.tsx", [
 ("import ScheduleClient from '@/components/workryn/ScheduleClient'\n",
  "import ScheduleClient from '@/components/workryn/ScheduleClient'\nimport { getPageBannerUrl } from '@/lib/workryn/pageBanner'\n",1),
 ("  return (\n    <ScheduleClient",
  "  const bannerUrl = await getPageBannerUrl('schedule')\n\n  return (\n    <ScheduleClient",1),
 ("      weekStart={from.toISOString()}\n    />",
  "      weekStart={from.toISOString()}\n      bannerUrl={bannerUrl}\n    />",1),
])
sca_div='        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>'
sca_branch=(
'        {bannerUrl ? (\n'
'          <>\n'
'            <PageBanner title="Schedule" bannerUrl={bannerUrl} />\n'
'            <Group justify="space-between" align="center" wrap="wrap" gap="sm" mb="lg">\n'
'              <Group gap="sm" align="center">\n'
'                <Group gap={4} align="center">\n'
'                  <Tooltip label="Previous" withArrow>\n'
'                    <ActionIcon size="lg" radius="md" variant="default" onClick={prev} className="sca-nav-btn">\n'
'                      <ChevronLeft size={16} />\n'
'                    </ActionIcon>\n'
'                  </Tooltip>\n'
'                  <Button size="sm" variant="default" onClick={goToday} className="sca-today-btn">Today</Button>\n'
'                  <Tooltip label="Next" withArrow>\n'
'                    <ActionIcon size="lg" radius="md" variant="default" onClick={next} className="sca-nav-btn">\n'
'                      <ChevronRight size={16} />\n'
'                    </ActionIcon>\n'
'                  </Tooltip>\n'
'                </Group>\n'
'                <Title order={3} style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{headerLabel()}</Title>\n'
'              </Group>\n'
'              <Group gap="sm" align="center">\n'
'                {canSeeAll && users.length > 5 && (\n'
'                  <Select size="sm" value={filterUserId} onChange={setFilterUserId} data={[{ value: \'\', label: \'All staff\' }, ...users.map((u) => ({ value: u.id, label: u.name ?? \'Unnamed\' }))]} placeholder="All staff" clearable searchable leftSection={<Users size={14} />} w={200} />\n'
'                )}\n'
'                <SegmentedControl size="sm" value={view} onChange={(v) => setView(v as ViewMode)} data={[{ value: \'month\', label: \'Month\' }, { value: \'week\', label: \'Week\' }, { value: \'day\', label: \'Day\' }]} className="sca-view-toggle" />\n'
'                {isManager && (\n'
"                  <Button size=\"md\" leftSection={<Plus size={16} />} onClick={() => openNew(visibleUsers[0]?.id ?? '', cursor)} className=\"sca-btn-primary\">New Shift</Button>\n"
'                )}\n'
'              </Group>\n'
'            </Group>\n'
'          </>\n'
'        ) : (\n'
+ sca_div)
patch("components/workryn/ScheduleClient.tsx", [
 ("} from '@mantine/core'\n","} from '@mantine/core'\nimport PageBanner from '@/components/workryn/PageBanner'\n",1),
 ("({ initialShifts, users, departments, currentUser }: Props) {",
  "({ initialShifts, users, departments, currentUser, bannerUrl }: Props & { bannerUrl?: string | null }) {",1),
 ('      <Container size="xl" py="lg" className="sca-root">','      <Container size="xl" py="lg" w="100%" className="sca-root">',1),
 (sca_div, sca_branch, 1),
 ("        </div>\n\n        {/* ============ CALENDAR PANEL ============ */}",
  "        </div>\n        )}\n\n        {/* ============ CALENDAR PANEL ============ */}",1),
])
print("Evaluations + Schedule banner wiring applied.")
