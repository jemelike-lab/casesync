#!/usr/bin/env python3
"""Wire the Time Clock hero to a Supabase Storage banner.

- Creates lib/workryn/pageBanner.ts (server helper: list page-banners/<slug>/,
  return newest image's public URL, null on miss — fails soft).
- Time Clock page passes the URL to its hero.
- Hero renders the photo full-bleed (cover) + legibility scrim, SVG fallback.

Run from repo root:  python3 apply_timeclock_banner.py
Aborts (no writes) if any anchor doesn't match.
"""
import os, sys

os.makedirs("lib/workryn", exist_ok=True)
helper = '''import { createClient } from '@/lib/supabase/server'

const BUCKET = 'page-banners'
const IMG_RE = /\\.(png|jpe?g|webp|gif|avif)$/i

/**
 * Public URL of the banner image dropped into page-banners/<slug>/ in
 * Supabase Storage, or null if none. Newest image wins, so replacing the
 * photo from the Supabase dashboard just works with no code change.
 * Fails soft (returns null) so a storage hiccup never breaks the page.
 */
export async function getPageBannerUrl(slug: string): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(slug, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
    if (error || !data) return null
    const img = data.find((o) => IMG_RE.test(o.name))
    if (!img) return null
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(`${slug}/${img.name}`)
    return pub?.publicUrl ?? null
  } catch {
    return null
  }
}
'''
open("lib/workryn/pageBanner.ts", "w").write(helper)
print("created lib/workryn/pageBanner.ts")

def patch(path, edits):
    s = open(path, encoding="utf-8").read()
    for old, new, n in edits:
        c = s.count(old)
        if c != n:
            sys.exit(f"ABORT {path}: expected {n} of anchor, found {c}: {old[:46]!r}")
        s = s.replace(old, new)
    open(path, "w", encoding="utf-8").write(s)
    print("patched", path)

patch("app/(workryn)/w/time-clock/page.tsx", [
 ("import TimeClockClient from '@/components/workryn/TimeClockClient'\n",
  "import TimeClockClient from '@/components/workryn/TimeClockClient'\nimport { getPageBannerUrl } from '@/lib/workryn/pageBanner'\n", 1),
 ("  ])\n\n  return (\n    <TimeClockClient",
  "  ])\n\n  const bannerUrl = await getPageBannerUrl('time-clock')\n\n  return (\n    <TimeClockClient", 1),
 ("      userName={session.user.name ?? ''}\n    />",
  "      userName={session.user.name ?? ''}\n      bannerUrl={bannerUrl}\n    />", 1),
])

svg_old = '            <img src="/heroes/time-clock.svg" alt="" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", height: "70%", zIndex: 0, opacity: 0.22, pointerEvents: "none" }} />'
svg_new = (
'            {bannerUrl ? (\n'
'              <>\n'
'                <img src={bannerUrl} alt="" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0, pointerEvents: "none" }} />\n'
'                <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", background: "linear-gradient(90deg, rgba(13,16,38,0.86) 0%, rgba(13,16,38,0.66) 42%, rgba(13,16,38,0.34) 100%)" }} />\n'
'              </>\n'
'            ) : (\n'
'              <img src="/heroes/time-clock.svg" alt="" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", height: "70%", zIndex: 0, opacity: 0.22, pointerEvents: "none" }} />\n'
'            )}'
)
patch("components/workryn/TimeClockClient.tsx", [
 ("  userName: string\n}", "  userName: string\n  bannerUrl?: string | null\n}", 1),
 ("  userName,\n}: Props) {", "  userName,\n  bannerUrl,\n}: Props) {", 1),
 (svg_old, svg_new, 1),
])
print("\nTime Clock banner wiring applied cleanly.")
