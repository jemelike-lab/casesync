#!/usr/bin/env python3
"""Page-banner rollout — TEMPLATE (Tasks) + shared PageBanner component.

Creates components/workryn/PageBanner.tsx (reused by every page) and wires the
Tasks page: full-width container, photo banner (260px, white banner-heading
label), "New Task" relocated to a row below the banner. Original hero kept as
the empty-folder fallback (no orphaned vars).

Run from repo root:  python3 rollout_tasks_template.py
Aborts (no writes) if any anchor doesn't match.
"""
import sys

pb = '''\'use client\'

import { Paper, Title } from \'@mantine/core\'

/**
 * Full-bleed page banner: photo (cover) + page name, sized to match the
 * Training hero (260px). Rendered only when a banner image exists; pages keep
 * their original hero as fallback when the folder is empty.
 */
export default function PageBanner({
  title,
  bannerUrl,
  minHeight = 260,
}: {
  title: string
  bannerUrl: string
  minHeight?: number
}) {
  return (
    <Paper radius="lg" p={0} mb="md" style={{ position: \'relative\', overflow: \'hidden\', minHeight }}>
      <img
        src={bannerUrl}
        alt=""
        aria-hidden="true"
        style={{ position: \'absolute\', inset: 0, width: \'100%\', height: \'100%\', objectFit: \'cover\', zIndex: 0, pointerEvents: \'none\' }}
      />
      <div
        aria-hidden="true"
        style={{ position: \'absolute\', inset: 0, zIndex: 1, pointerEvents: \'none\', background: \'linear-gradient(0deg, rgba(8,10,24,0.82) 0%, rgba(8,10,24,0.30) 38%, rgba(8,10,24,0.06) 66%, transparent 100%)\' }}
      />
      <div style={{ position: \'absolute\', left: 32, bottom: 26, zIndex: 2 }}>
        <Title order={1} className="banner-heading" style={{ fontSize: 34, fontWeight: 800, letterSpacing: \'-0.01em\', textShadow: \'0 2px 18px rgba(0,0,0,0.55)\' }}>
          {title}
        </Title>
      </div>
    </Paper>
  )
}
'''
open("components/workryn/PageBanner.tsx","w").write(pb)
print("created components/workryn/PageBanner.tsx")

def patch(path, edits):
    s=open(path,encoding="utf-8").read()
    for old,new,n in edits:
        c=s.count(old)
        if c!=n: sys.exit(f"ABORT {path}: expected {n}, found {c}: {old[:48]!r}")
        s=s.replace(old,new)
    open(path,"w",encoding="utf-8").write(s)
    print("patched",path)

patch("app/(workryn)/w/tasks/page.tsx", [
 ("import TasksClient from '@/components/workryn/TasksClient'\n",
  "import TasksClient from '@/components/workryn/TasksClient'\nimport { getPageBannerUrl } from '@/lib/workryn/pageBanner'\n", 1),
 ("  ])\n\n  return (\n    <TasksClient",
  "  ])\n\n  const bannerUrl = await getPageBannerUrl('tasks')\n\n  return (\n    <TasksClient", 1),
 ("      currentUserId={session!.user.id}\n    />",
  "      currentUserId={session!.user.id}\n      bannerUrl={bannerUrl}\n    />", 1),
])

hero_start = '        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>'
banner_branch = (
'        {bannerUrl ? (\n'
'          <>\n'
'            <PageBanner title="Tasks" bannerUrl={bannerUrl} />\n'
'            <Group justify="flex-end" mb="lg">\n'
'              <Button size="md" leftSection={<Plus size={16} />} onClick={openCreate} className="tka-btn-primary">New Task</Button>\n'
'            </Group>\n'
'          </>\n'
'        ) : (\n'
+ hero_start
)
patch("components/workryn/TasksClient.tsx", [
 ("import { useState, useRef, useEffect } from 'react'\n",
  "import { useState, useRef, useEffect } from 'react'\nimport PageBanner from '@/components/workryn/PageBanner'\n", 1),
 ("  currentUserId: string\n}", "  currentUserId: string\n  bannerUrl?: string | null\n}", 1),
 ("currentUserId: _currentUserId }: Props", "currentUserId: _currentUserId, bannerUrl }: Props", 1),
 ('<Container size="xl" py="lg" className="tka-root">', '<Container size="xl" py="lg" w="100%" className="tka-root">', 1),
 (hero_start, banner_branch, 1),
 ("        </div>\n\n        {/* ============ STAT CARDS ============ */}",
  "        </div>\n        )}\n\n        {/* ============ STAT CARDS ============ */}", 1),
])
print("\nTasks template applied.")
