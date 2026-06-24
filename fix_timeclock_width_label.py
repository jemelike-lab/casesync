#!/usr/bin/env python3
"""Fix Time Clock banner: full width (match Training) + legible label.

1) Container w="100%" — overrides the Workryn layout's center shrink-wrap so the
   page fills the content width (root 1173px -> hero 1141px, == Training).
2) Label uses the design-system .banner-heading class (white !important in light
   mode) and drops the inline white that tripped the slate-override rule.

Run from repo root:  python3 fix_timeclock_width_label.py
"""
import sys
path = "components/workryn/TimeClockClient.tsx"
s = open(path, encoding="utf-8").read()
edits = [
 ('      <Container size="xl" py="lg" className="tca-root">',
  '      <Container size="xl" py="lg" w="100%" className="tca-root">', 1),
 ('                  <Title order={1} style={{ color: "#fff", fontSize: 34, fontWeight: 800, letterSpacing: "-0.01em", textShadow: "0 2px 18px rgba(0,0,0,0.55)" }}>Time Clock</Title>',
  '                  <Title order={1} className="banner-heading" style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.01em", textShadow: "0 2px 18px rgba(0,0,0,0.55)" }}>Time Clock</Title>', 1),
]
for old, new, n in edits:
    c = s.count(old)
    if c != n:
        sys.exit(f"ABORT: expected {n}, found {c}: {old[:50]!r}")
    s = s.replace(old, new)
open(path, "w", encoding="utf-8").write(s)
print("Time Clock width + label fix applied.")
