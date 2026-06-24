#!/usr/bin/env python3
"""Page-banner rollout batch 3: PTO + Training.

Same recipe (full-width container, PageBanner 260px white label, action button
relocated below, original hero as fallback). Multi-line destructures use an
intersection type. Training keeps its canCreate gate; it has no photo yet so it
stays on the original hero until one is dropped in the 'training' folder.

Run from repo root:  python3 rollout_pto_training.py
"""
import sys
def patch(path, edits):
    s=open(path,encoding="utf-8").read()
    for old,new,n in edits:
        c=s.count(old)
        if c!=n: sys.exit(f"ABORT {path}: expected {n}, found {c}: {old[:50]!r}")
        s=s.replace(old,new)
    open(path,"w",encoding="utf-8").write(s)

# ---------------- PTO ----------------
patch("app/(workryn)/w/pto/page.tsx", [
 ("import PTOClient from '@/components/workryn/PTOClient'\n",
  "import PTOClient from '@/components/workryn/PTOClient'\nimport { getPageBannerUrl } from '@/lib/workryn/pageBanner'\n",1),
 ("  return (\n    <PTOClient",
  "  const bannerUrl = await getPageBannerUrl('pto')\n\n  return (\n    <PTOClient",1),
 ("      intuitCompanyName={(intuitConnection as any)?.companyName ?? null}\n    />",
  "      intuitCompanyName={(intuitConnection as any)?.companyName ?? null}\n      bannerUrl={bannerUrl}\n    />",1),
])
pto_div='        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>'
pto_branch=('        {bannerUrl ? (\n          <>\n            <PageBanner title="PTO" bannerUrl={bannerUrl} />\n'
 '            <Group justify="flex-end" mb="lg">\n'
 "              <Button size=\"md\" leftSection={<Plus size={16} />} onClick={() => { resetForm(); modal.open() }} className=\"ptoa-btn-primary\">New Request</Button>\n"
 '            </Group>\n          </>\n        ) : (\n'+pto_div)
patch("components/workryn/PTOClient.tsx", [
 ("} from '@mantine/core'\n","} from '@mantine/core'\nimport PageBanner from '@/components/workryn/PageBanner'\n",1),
 ("  intuitCompanyName: initialCompanyName = null,\n}: PTOClientProps) {",
  "  intuitCompanyName: initialCompanyName = null,\n  bannerUrl,\n}: PTOClientProps & { bannerUrl?: string | null }) {",1),
 ('<Container size="xl" py="lg" className="ptoa-root">','<Container size="xl" py="lg" w="100%" className="ptoa-root">',1),
 (pto_div, pto_branch, 1),
 ("        </div>\n\n        {/* ============ BALANCE WALLET CARDS ============ */}",
  "        </div>\n        )}\n\n        {/* ============ BALANCE WALLET CARDS ============ */}",1),
])

# ---------------- TRAINING ----------------
patch("app/(workryn)/w/training/page.tsx", [
 ("import TrainingClient from '@/components/workryn/TrainingClient'\n",
  "import TrainingClient from '@/components/workryn/TrainingClient'\nimport { getPageBannerUrl } from '@/lib/workryn/pageBanner'\n",1),
 ("  return (\n    <TrainingClient",
  "  const bannerUrl = await getPageBannerUrl('training')\n\n  return (\n    <TrainingClient",1),
 ("      departments={JSON.parse(JSON.stringify(departments))}\n    />",
  "      departments={JSON.parse(JSON.stringify(departments))}\n      bannerUrl={bannerUrl}\n    />",1),
])
tra_div="        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20, position: 'relative', zIndex: 1 }}>"
tra_branch=('        {bannerUrl ? (\n          <>\n            <PageBanner title="Training" bannerUrl={bannerUrl} />\n'
 '            {canCreate && (\n              <Group justify="flex-end" mb="lg">\n'
 '                <Button size="md" leftSection={<Plus size={16} />} onClick={createModal.open} className="tra-btn-primary">Create Course</Button>\n'
 '              </Group>\n            )}\n          </>\n        ) : (\n'+tra_div)
patch("components/workryn/TrainingClient.tsx", [
 ("} from '@mantine/core'\n","} from '@mantine/core'\nimport PageBanner from '@/components/workryn/PageBanner'\n",1),
 ("  initialCourses, initialEnrollments, currentUser, users = [], departments = [],\n}: Props) {",
  "  initialCourses, initialEnrollments, currentUser, users = [], departments = [],\n  bannerUrl,\n}: Props & { bannerUrl?: string | null }) {",1),
 ('<Container size="xl" py="lg" className="tra-root">','<Container size="xl" py="lg" w="100%" className="tra-root">',1),
 (tra_div, tra_branch, 1),
 ("        </div>\n\n        {/* ============ CHANNEL TILES ============ */}",
  "        </div>\n        )}\n\n        {/* ============ CHANNEL TILES ============ */}",1),
])
print("PTO + Training banner wiring applied.")
