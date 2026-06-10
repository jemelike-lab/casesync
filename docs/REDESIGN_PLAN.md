# CaseSync Visual Redesign — Plan for Next Session

**Status:** Pre-launch. Pre-redesign. Earth-tone palette restored. Last
two visual-redesign attempts (`015edf8`, `0bdd1b3` on 2026-06-09) were
reverted via `357a0d9` + `7edc31c` — they were patch-on-patch color
swaps over a dark-mode-first codebase and produced an inconsistent
result across pages.

## Lesson learned, don't repeat

CaseSync's current TSX (≈20k lines across the dashboard components
alone) is full of inline `linear-gradient(160deg, #0c1a3a ...)` style
declarations designed for a dark canvas. `app/globals.css` had grown to
~1,100 lines, ~30% of which were `[data-theme="light"]
[style*="..."]` patches written to defeat earlier color choices. Git
log shows the pattern repeating:

  - `Revert "feat(theme): unify to two-tone green system"`           (d39c7ad)
  - `feat(theme): premium light-mode pass v2 — forest-green sidebar` (1382105)
  - `Merge: comprehensive light-mode pass for all Aurora pages`      (7ZQmTp4)
  - `revert: roll back tonight's theme experiments`                   (357a0d9, 7edc31c)

Each one tried to push the legacy components in a new direction with
CSS overrides. Each one got reverted. **Stop patching. The next
attempt has to start with new components, not new CSS rules over old
components.**

## Agreed approach for next session

**Build one new page from scratch as the design north star.** Pick the
dashboard. Don't touch `SupervisorControlPanelClient.tsx`,
`DashboardClient.tsx`, or `PremiumStatGrid.tsx` — leave them for later
migration. Build a new route at `/dashboard-v2` (or replace `/dashboard`
once it's ready) with:

- A real component library — strong default: **Mantine**, since Workryn
  already uses it (`lib/workryn/theme.ts`) and adopting it for CaseSync
  means one design system across both apps.
- An optional alternative: **shadcn/ui** + Tailwind. Cleaner Tailwind
  ergonomics but means running two design systems in the repo.
- A real theme token file — colors, spacing, radii, shadows — defined
  once and consumed by every component. No inline gradients.
- Mock data first, real data second. Build the layout against a
  hand-written sample so visual iteration is fast; wire to Supabase
  once the layout is locked.

Success looks like: one page Josh actually loves. From there we
migrate the other pages one at a time over multiple sessions.

## What not to do next session

- Do not edit `app/globals.css` to "fix light mode" again.
- Do not search-and-replace hex codes in inline styles.
- Do not add more `[data-theme="light"] [style*="..."]` selectors.
- Do not touch Workryn files (`app/(workryn)/*`, `app/workryn*.css`,
  `components/workryn/*`, `lib/workryn/theme.ts`) — they're outside scope.

## Reference: CaseFox aesthetic (target)

User-provided reference screenshots show:

- Vivid cobalt-blue topbar with white text, ~`#1E7CFF`
- Soft lavender→pink page canvas (very subtle gradient)
- Pure white content cards, ~16–20px radius, slate shadows
- KPI tiles as solid bright fills: blue / coral / emerald / amber
- Hot magenta + teal chart accents
- Clean sans-serif (Inter is fine)

## Open items still blocking launch

These take priority over redesign per `docs/HANDOFF_LAUNCH_PREP.md`:

- Real staff roster with roles
- Real client data import (source + format)
- Email sending domain + DNS records
- BAA confirmation with Supabase / Vercel / Resend
- Supabase PITR verification
- Bot confidence threshold for autonomous action
- Target cutover date

If launch and redesign compete for time, launch wins. Redesign can ship
v2 after cutover.
