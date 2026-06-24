#!/usr/bin/env python3
"""Harden the Workryn layout against DB outages.

Wraps the session lookup + auto-provision in a single try/catch so a DB
hiccup degrades to the fallback user instead of 500'ing every /w/* route.
Run from repo root:  python3 apply_workryn_layout_guard.py
Aborts (no writes) if the anchor doesn't match.
"""
import sys
p = "app/(workryn)/layout.tsx"
s = open(p, encoding="utf-8").read()

old = """  let session = await getWorkrynSession()

  // Auto-provision: create w_user from CaseSync profile if missing
  if (!session) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    try {
      await db.user.upsert({
        where: { supabaseId: user.id },
        create: {
          supabaseId: user.id,
          email: user.email ?? '',
          name: profile?.full_name ?? user.email ?? '',
          role: mapRole(profile?.role),
          avatarColor: '#6366f1',
          isActive: true,
        },
        update: {
          // On conflict, update role/name in case they changed in CaseSync
          name: profile?.full_name ?? user.email ?? '',
          role: mapRole(profile?.role),
        },
      })
      session = await getWorkrynSession()
    } catch (err) {
      console.error('[Workryn Layout] Auto-provision failed:', err)
      session = await getWorkrynSession()
    }
  }"""

new = """  // Wrap the session lookup + auto-provision in one guard so any DB hiccup
  // degrades to the fallback user below instead of crashing the layout (which
  // would 500 every /w/* route before the page's own guard could run).
  let session: Awaited<ReturnType<typeof getWorkrynSession>> = null
  try {
    session = await getWorkrynSession()

    // Auto-provision: create w_user from CaseSync profile if missing
    if (!session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      await db.user.upsert({
        where: { supabaseId: user.id },
        create: {
          supabaseId: user.id,
          email: user.email ?? '',
          name: profile?.full_name ?? user.email ?? '',
          role: mapRole(profile?.role),
          avatarColor: '#6366f1',
          isActive: true,
        },
        update: {
          // On conflict, update role/name in case they changed in CaseSync
          name: profile?.full_name ?? user.email ?? '',
          role: mapRole(profile?.role),
        },
      })
      session = await getWorkrynSession()
    }
  } catch (err) {
    console.error('[Workryn Layout] session/auto-provision failed:', err)
  }"""

c = s.count(old)
if c != 1:
    sys.exit(f"ABORT {p}: expected 1 anchor, found {c}")
open(p, "w", encoding="utf-8").write(s.replace(old, new))
print(f"patched {p}\nLayout hardening applied cleanly.")
