#!/usr/bin/env python3
"""Point the post-login redirect at Workryn (/w/dashboard) per design.

The login page hard-coded the post-login destination to /dashboard (CaseSync).
This sends normal logins and invite/magiclink logins to /w/dashboard instead.
Recovery (/reset-password) and not-yet-onboarded (/onboarding) paths unchanged.
Run from repo root:  python3 apply_login_redirect_fix.py
Aborts (no writes) if anchors don't match.
"""
import sys
p = "app/login/page.tsx"
s = open(p, encoding="utf-8").read()
edits = [
    ("router.push(profile && profile.onboarded === false ? '/onboarding' : '/dashboard')",
     "router.push(profile && profile.onboarded === false ? '/onboarding' : '/w/dashboard')", 1),
    ("else if (type === 'invite' || type === 'magiclink') router.push('/dashboard')",
     "else if (type === 'invite' || type === 'magiclink') router.push('/w/dashboard')", 1),
]
for old, new, n in edits:
    c = s.count(old)
    if c != n:
        sys.exit(f"ABORT {p}: expected {n} of anchor, found {c}: {old[:50]!r}")
    s = s.replace(old, new)
open(p, "w", encoding="utf-8").write(s)
print(f"patched {p}\nPost-login redirect now targets /w/dashboard.")
