#!/usr/bin/env python3
"""
Workryn RBAC — Phase 2: wire the capability helpers into the surface gates.

Run from the repo root (e.g. /home/casesync/casesync):
    python3 wire_rbac_phase2.py

Every edit is anchored and assertion-guarded. The script aborts on the first
mismatch without writing anything, so a partial/early-exit leaves the tree clean.

Intent (helpers were shipped in Phase 1 / commit e777a62):
  - Evaluations: IT (and Assistant) excluded   -> canViewEvaluations / canManageEvaluations
  - Department writes: IT excluded              -> canManageDepartments  (Owner/Supervisor)
  - Ticket notes (triage): Assistant added      -> canTriageTickets
  - Ticket archive (manage): Owner + IT only    -> canManageTickets      (narrows out Supervisor)
  - Schedule maintain + view-all-staff: Assistant added -> canMaintainSchedule / canSeeAllDepartments
  - Settings admin features: IT added           -> canManageSettings
  - Transfer-ownership self-demotion: ADMIN -> SUPERVISOR
"""
import re
import pathlib

ROOT = pathlib.Path(".")
PERM = "@/lib/workryn/permissions"
IMPORT_RE = re.compile(r"import \{([^}]*)\} from '" + re.escape(PERM) + r"'")

# Track, per file, which permission names end up *called* so we can verify imports.
applied = []


def _dedupe(seq):
    seen, out = set(), []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def edit(path, repls=None, import_map=None, add_import=None):
    p = ROOT / path
    assert p.exists(), f"MISSING FILE: {path}"
    s = orig = p.read_text()

    # 1) call-site replacements (count-asserted)
    for old, new, n in (repls or []):
        c = s.count(old)
        assert c == n, f"{path}: expected {n}x {old!r}, found {c}"
        s = s.replace(old, new)

    # 2) rewrite the names inside an existing permissions import
    if import_map:
        m = IMPORT_RE.search(s)
        assert m, f"{path}: no permissions import to rewrite"
        names = [x.strip() for x in m.group(1).split(",") if x.strip()]
        new_names = _dedupe(import_map.get(x, x) for x in names)
        s = s[:m.start()] + "import { " + ", ".join(new_names) + " } from '" + PERM + "'" + s[m.end():]

    # 3) add a fresh permissions import (file had none)
    if add_import:
        assert PERM not in s, f"{path}: already imports permissions; use import_map instead"
        # insert right after the first import statement line
        first = s.index("import ")
        nl = s.index("\n", first) + 1
        s = s[:nl] + add_import + "\n" + s[nl:]

    assert s != orig, f"{path}: no-op (anchors matched nothing meaningful)"
    p.write_text(s)
    applied.append(path)
    print("  OK", path)


# ----------------------------------------------------------------------------
# EVALUATIONS  (IT out; Assistant stays out)
#   isAdminOrAbove(  -> canManageEvaluations(   |  isManagerOrAbove(  -> canViewEvaluations(
# ----------------------------------------------------------------------------
EVAL_IMPORT = {"isAdminOrAbove": "canManageEvaluations", "isManagerOrAbove": "canViewEvaluations"}
EVAL_ADMIN = ("isAdminOrAbove(", "canManageEvaluations(")
EVAL_MGR = ("isManagerOrAbove(", "canViewEvaluations(")

print("Evaluations:")
edit("app/(workryn)/w/evaluations/page.tsx",
     [(*EVAL_ADMIN, 1), (*EVAL_MGR, 1)], EVAL_IMPORT)
edit("app/api/workryn/evaluations/[id]/route.ts",
     [(*EVAL_ADMIN, 3), (*EVAL_MGR, 1)], EVAL_IMPORT)
edit("app/api/workryn/evaluations/route.ts",
     [(*EVAL_ADMIN, 2), (*EVAL_MGR, 3)], EVAL_IMPORT)
edit("app/api/workryn/evaluations/templates/[id]/route.ts",
     [(*EVAL_ADMIN, 2), (*EVAL_MGR, 1)], EVAL_IMPORT)
edit("app/api/workryn/evaluations/templates/route.ts",
     [(*EVAL_ADMIN, 1), (*EVAL_MGR, 1)], EVAL_IMPORT)
edit("app/api/workryn/evaluations/county-preference/route.ts",
     [(*EVAL_MGR, 1)], EVAL_IMPORT)
edit("app/api/workryn/evaluations/milestones/route.ts",
     [(*EVAL_MGR, 1)], EVAL_IMPORT)
edit("app/api/workryn/evaluations/onboarding/route.ts",
     [(*EVAL_MGR, 2)], EVAL_IMPORT)
edit("app/api/workryn/evaluations/self-assessment/route.ts",
     [(*EVAL_MGR, 1)], EVAL_IMPORT)  # the role:{in:[...]} reviewer query at L93 is untouched
edit("app/api/workryn/evaluations/upload/route.ts",
     [(*EVAL_MGR, 1)], EVAL_IMPORT)
edit("components/workryn/EvaluationsClient.tsx",
     [(*EVAL_ADMIN, 1), (*EVAL_MGR, 1)], EVAL_IMPORT)
edit("components/workryn/CountyPreferenceClient.tsx",
     [(*EVAL_MGR, 1)], EVAL_IMPORT)

# ----------------------------------------------------------------------------
# DEPARTMENTS (writes)  IT out:  isAdminOrAbove( -> canManageDepartments(
# ----------------------------------------------------------------------------
DEPT_IMPORT = {"isAdminOrAbove": "canManageDepartments"}
DEPT = ("isAdminOrAbove(", "canManageDepartments(")
print("Departments:")
edit("app/api/workryn/departments/[id]/members/[userId]/route.ts", [(*DEPT, 1)], DEPT_IMPORT)
edit("app/api/workryn/departments/[id]/members/route.ts", [(*DEPT, 1)], DEPT_IMPORT)
edit("app/api/workryn/departments/[id]/route.ts", [(*DEPT, 2)], DEPT_IMPORT)
edit("app/api/workryn/departments/route.ts", [(*DEPT, 1)], DEPT_IMPORT)

# ----------------------------------------------------------------------------
# TICKETS
# ----------------------------------------------------------------------------
print("Tickets:")
# notes = triage -> Assistant gains access
edit("app/api/workryn/tickets/[id]/notes/route.ts",
     [("isManagerOrAbove(", "canTriageTickets(", 2)],
     {"isManagerOrAbove": "canTriageTickets"})
# archive (DELETE) = manage -> Owner + IT (narrows Supervisor out; flagged)
edit("app/api/workryn/tickets/[id]/route.ts",
     [("isAdminOrAbove(", "canManageTickets(", 1)],
     {"isAdminOrAbove": "canManageTickets"})
# client archive button mirror
edit("components/workryn/TicketsClient.tsx",
     [("currentUser.role === 'ADMIN' || currentUser.role === 'OWNER'",
       "canManageTickets(currentUser.role)", 1)],
     add_import="import { canManageTickets } from '@/lib/workryn/permissions'")

# ----------------------------------------------------------------------------
# SCHEDULE  Assistant gains maintain + view-all-staff (delegate local fns to helpers)
# ----------------------------------------------------------------------------
print("Schedule:")
edit("components/workryn/ScheduleClient.tsx",
     [("function canManageSchedule(role: string): boolean {\n"
       "  return ['ADMIN', 'MANAGER', 'OWNER', 'SUPERVISOR', 'TEAM_MANAGER'].includes(role)\n}",
       "function canManageSchedule(role: string): boolean {\n"
       "  return canMaintainSchedule(role)\n}", 1),
      ("function canViewAllStaff(role: string): boolean {\n"
       "  return ['ADMIN', 'MANAGER', 'OWNER', 'SUPERVISOR', 'TEAM_MANAGER'].includes(role)\n}",
       "function canViewAllStaff(role: string): boolean {\n"
       "  return canSeeAllDepartments(role)\n}", 1)],
     add_import="import { canMaintainSchedule, canSeeAllDepartments } from '@/lib/workryn/permissions'")

# ----------------------------------------------------------------------------
# SETTINGS  IT gains admin features
# ----------------------------------------------------------------------------
print("Settings:")
edit("components/workryn/SettingsClient.tsx",
     [("profile.role === 'OWNER' || profile.role === 'ADMIN'",
       "canManageSettings(profile.role)", 1)],
     add_import="import { canManageSettings } from '@/lib/workryn/permissions'")

# ----------------------------------------------------------------------------
# TRANSFER-OWNERSHIP  self-demote ADMIN -> SUPERVISOR
# ----------------------------------------------------------------------------
print("Transfer-ownership:")
edit("app/api/workryn/admin/transfer-ownership/route.ts",
     [("data: { role: 'ADMIN' }", "data: { role: 'SUPERVISOR' }", 1),
      ("self demoted to ADMIN", "self demoted to SUPERVISOR", 1)])

# ----------------------------------------------------------------------------
# VALIDATION: every new helper that's now CALLED must be imported in that file.
# ----------------------------------------------------------------------------
NEW_HELPERS = ["canManageEvaluations", "canViewEvaluations", "canManageDepartments",
               "canTriageTickets", "canManageTickets", "canMaintainSchedule",
               "canSeeAllDepartments", "canManageSettings"]
print("Validation:")
problems = 0
for path in applied:
    s = (ROOT / path).read_text()
    m = IMPORT_RE.search(s)
    imported = set(x.strip() for x in m.group(1).split(",")) if m else set()
    for h in NEW_HELPERS:
        if (h + "(") in s and h not in imported:
            print(f"  !! {path}: calls {h}() but does not import it")
            problems += 1
    # no stray balance issues from our edits
    if s.count("{") != s.count("}"):
        print(f"  !! {path}: brace imbalance ({s.count('{')} vs {s.count('}')})")
        problems += 1

print(f"\n{len(applied)} files edited. {problems} validation problem(s).")
assert problems == 0, "VALIDATION FAILED — see above"
print("Phase 2 wiring applied cleanly.")
