#!/usr/bin/env python3
"""Guard the browser Supabase client's cookie adapter against SSR.

Fixes "ReferenceError: document is not defined" thrown when any component
constructs the browser client during server render (e.g. global SessionGuard).
No-op in the browser. Run from repo root:  python3 apply_supabase_ssr_guard.py
Aborts (no writes) if anchors don't match.
"""
import sys
p = "lib/supabase/client.ts"
s = open(p, encoding="utf-8").read()
edits = [
    ("        getAll() {\n          return document.cookie",
     "        getAll() {\n"
     "          // No `document` during SSR. Return no cookies so the auth client's\n"
     "          // init can't throw \"document is not defined\" when a component\n"
     "          // constructs this browser client server-side. Server-side auth is\n"
     "          // handled by the server client; this one only matters in the browser.\n"
     "          if (typeof document === 'undefined') return []\n"
     "          return document.cookie", 1),
    ("        setAll(cookiesToSet) {\n          cookiesToSet.forEach",
     "        setAll(cookiesToSet) {\n          if (typeof document === 'undefined') return\n          cookiesToSet.forEach", 1),
]
for old, new, n in edits:
    c = s.count(old)
    if c != n:
        sys.exit(f"ABORT {p}: expected {n} of anchor, found {c}: {old[:45]!r}")
    s = s.replace(old, new)
open(p, "w", encoding="utf-8").write(s)
print(f"patched {p}\nAll guards applied cleanly.")
