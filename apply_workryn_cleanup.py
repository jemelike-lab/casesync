#!/usr/bin/env python3
"""Workryn clean-up pass — anchored patches with assertion guards.

Run from the repo root:  python3 apply_workryn_cleanup.py
Aborts (no writes) if any anchor count is unexpected, so it can't apply
to drifted source.
"""
import sys

def patch(path, edits):
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    out = src
    for old, new, n in edits:
        found = out.count(old)
        if found != n:
            sys.exit(f"ABORT {path}: expected {n} of anchor, found {found}\n  anchor: {old[:70]!r}")
        out = out.replace(old, new)
    if out == src:
        sys.exit(f"ABORT {path}: no change produced")
    with open(path, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"patched {path}")

# 1) WorkrynSidebar: stop building the browser client at render; build it
#    lazily inside the only consumer (logout fallback).
patch("components/workryn/WorkrynSidebar.tsx", [
    ("\n  const supabase = createClient()\n", "\n", 1),
    (
        "    } catch {\n      await supabase.auth.signOut()\n    }",
        "    } catch {\n"
        "      // Build the browser client lazily, client-side only \u2014 never at\n"
        "      // render time, where Supabase's auth init reads document.cookie during SSR.\n"
        "      const supabase = createClient()\n"
        "      await supabase.auth.signOut()\n"
        "    }",
        1,
    ),
])

# 2) Dashboard page: degrade gracefully if the session lookup throws.
patch("app/(workryn)/w/dashboard/page.tsx", [
    (
        "  const session = await getWorkrynSession()\n",
        "  let session: Awaited<ReturnType<typeof getWorkrynSession>>\n"
        "  try {\n"
        "    session = await getWorkrynSession()\n"
        "  } catch (err) {\n"
        "    console.error('[Workryn Dashboard] getWorkrynSession failed:', err)\n"
        "    redirect('/dashboard')\n"
        "  }\n",
        1,
    ),
])

# 3) .env.example: point at the live project + correct pooler host; add a
#    password-encoding note.
patch(".env.example", [
    (
        "# Project ref: jvyrohfzyxncidqcgmwj\n",
        "# Project ref: jvyrohfzyxncidqcgmwj\n"
        "# NOTE: copy the EXACT pooler host from Supabase \u2192 Connect (aws-N prefix varies);\n"
        "#       URL-encode special chars in the password, or use an alphanumeric one.\n",
        1,
    ),
    ("jvyrohfzyxncidqcgmwj", "iiqttbpaufzlinbufsdx", 3),
    ("aws-0-", "aws-1-", 4),
])

print("\nAll patches applied cleanly.")
