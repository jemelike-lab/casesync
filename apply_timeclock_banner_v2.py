#!/usr/bin/env python3
"""Time Clock banner v2: full-size (260px, Training's size) + decluttered.

When a photo is present (normal case): the hero is just the photo at the full
260px banner size, with a bottom scrim and only the page name "Time Clock".
When the folder is empty: falls back to the original hero (keeps all existing
hero variables referenced, so the build stays clean).

Run from repo root:  python3 apply_timeclock_banner_v2.py
Aborts (no writes) if any anchor doesn't match.
"""
import sys

path = "components/workryn/TimeClockClient.tsx"
s = open(path, encoding="utf-8").read()

edits = [
 # 1) full banner size — Training's 260px
 ('          <Paper radius="lg" p="xl" className="tca-hero">',
  '          <Paper radius="lg" p="xl" className="tca-hero" style={{ minHeight: 260 }}>', 1),

 # 2) bottom-weighted scrim + page-name label (inside the banner branch)
 ('                <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", background: "linear-gradient(90deg, rgba(13,16,38,0.86) 0%, rgba(13,16,38,0.66) 42%, rgba(13,16,38,0.34) 100%)" }} />',
  '                <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", background: "linear-gradient(0deg, rgba(8,10,24,0.82) 0%, rgba(8,10,24,0.30) 38%, rgba(8,10,24,0.06) 66%, transparent 100%)" }} />\n'
  '                <div style={{ position: "absolute", left: 32, bottom: 26, zIndex: 2 }}>\n'
  '                  <Title order={1} style={{ color: "#fff", fontSize: 34, fontWeight: 800, letterSpacing: "-0.01em", textShadow: "0 2px 18px rgba(0,0,0,0.55)" }}>Time Clock</Title>\n'
  '                </div>', 1),

 # 3a) busy hero content only renders when there is no banner photo
 ("            <Group justify=\"space-between\" align=\"flex-start\" wrap=\"wrap\" gap=\"lg\" style={{ position: 'relative', zIndex: 2 }}>",
  "            {!bannerUrl && (\n            <Group justify=\"space-between\" align=\"flex-start\" wrap=\"wrap\" gap=\"lg\" style={{ position: 'relative', zIndex: 2 }}>", 1),

 # 3b) close that wrap before the hero Paper closes
 ("            </Group>\n          </Paper>\n        </div>",
  "            </Group>\n            )}\n          </Paper>\n        </div>", 1),
]

for old, new, n in edits:
    c = s.count(old)
    if c != n:
        sys.exit(f"ABORT: expected {n} of anchor, found {c}: {old[:54]!r}")
    s = s.replace(old, new)

open(path, "w", encoding="utf-8").write(s)
print("Time Clock banner v2 applied (full size + decluttered).")
