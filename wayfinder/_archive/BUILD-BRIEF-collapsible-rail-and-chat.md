# Build Brief — Collapsible Rail (→ icons) + collapsed chat (→ input only)

**Status:** specced + signed off 2026-09-13 (grilled). Builds on
`BUILD-BRIEF-float-chat-over-content.md` (chat now floats over full-height content).

## Resolved decisions (from grilling)

- **Rail collapsed:** narrow strip showing **one icon per top-level area**
  (Life, Personal, Professional, Health, Finances, Creativity). Clicking an area
  icon **expands the rail and navigates to that area**.
- **Rail border:** a **defined border** (`border-r`) separating the rail from the
  page — in BOTH expanded and collapsed states.
- **Chat collapsed:** shows **just the input** (composer) — no Context/Clear
  header, no transcript. A **chevron on the collapsed card expands it back** to
  the full card. Still auto-expands on a streaming reply / unresolved proposal.
- **Persistence:** remember BOTH collapsed states in localStorage. **No new
  keyboard shortcuts.**

## Part A — Chat: collapsed = input only (`TerminalDrawer.tsx`)

Today `collapsed` renders the **header only** (Context/Clear) and hides body +
footer. Invert it:

- **Expanded (`!collapsed`):** unchanged — resize handle + header (Context ▾ +
  Clear) + body (transcript) + footer (composer). Header's Context button still
  collapses.
- **Collapsed:** render a slim full-width **expand strip** (a `<button>`, ~h-5,
  centered lucide `ChevronUp`, `aria-label="Expand chat"`, `onClick=onToggleCollapsed`)
  directly above the **footer**; hide the header, body, and resize handle. The
  card hugs the composer.
- **Height:** section `style.height` becomes `'auto'` when collapsed (was
  `TERMINAL_COLLAPSED_HEIGHT`, which sized the old header strip); expanded stays
  `height + TERMINAL_COLLAPSED_HEIGHT`. Card keeps `rounded-2xl overflow-hidden`.
- Keep `pointer-events-auto` on card + handle; `effectiveCollapsed` auto-expand
  logic in AITerminal is unchanged; ⌘K-uncollapse still works.

## Part B — Rail: collapse to icons + border + persist (`Rail.tsx`)

- **State:** add `collapsed` + toggle in `RailView` (presentational owner),
  persisted to `localStorage['pond:rail-collapsed']` (mirror TerminalDrawer's
  `readStored`/`writeStored` + one-time hydration effect; guard SSR).
- **Border:** add `border-r border-press-hair` (or the repo's hairline token) to
  the `<aside>` in both states.
- **Expanded:** current tree + width `w-[252px]`. Add a **collapse toggle** near
  the "Pond" wordmark (lucide `PanelLeftClose` / `ChevronLeft`, `aria-label="Collapse sidebar"`).
- **Collapsed:** `<aside>` width `w-14` (56px), `overflow-hidden`. Contents:
  1. An **expand toggle** at top (lucide `PanelLeft` / `ChevronRight`,
     `aria-label="Expand sidebar"`, `onClick` → expand).
  2. **One icon button per top-level area** — the depth-0 children of the Life
     root (derive from the existing `flat` rows; the top-level areas are the
     shallowest non-root rows — inspect the flat/depth shape to pick them). Map
     area **title → lucide icon**, case-insensitive, with a fallback:
     Life→`House`, Personal→`User`, Professional→`Briefcase`,
     Health→`HeartPulse`, Finances/Financial→`Wallet`, Creativity→`Palette`,
     else→`Circle`. Each button: `aria-label={area.title}`, `title={area.title}`,
     centered icon, comfortable hit target; **onClick → expand the rail AND
     navigate to that area** (reuse the row's existing open/navigate handler).
  3. Active-area emphasis if cheap (matches the current row's ancestor area).
- Keep the tree/keyboard machine intact for the expanded state; the collapsed
  strip is a separate simple render branch (no roving-tree semantics needed —
  plain buttons).
- **WorkspaceShell:** the Rail `Suspense` fallback is `w-[252px]`; leave it (a
  brief expanded-width skeleton is acceptable). No other shell change.

## Files

- `src/components/molecules/TerminalDrawer.tsx` — collapsed = input-only + expand strip; height auto.
- `src/components/molecules/TerminalDrawer.stories.tsx` — add/adjust a collapsed story + story-test (collapsed shows composer, not header; expand strip toggles).
- `src/components/organisms/Rail.tsx` — collapse state + border + collapsed icon strip + area-icon map.
- Rail stories/tests if present — add a collapsed-state story + test (icons render, expand toggle works).
- Reuse `lucide-react` (already a dependency).

## Verify

`tsc` clean · jest green (incl. new stories/tests) · live: rail collapses to a
bordered icon strip (area icons, expand toggle), clicking an icon expands +
navigates; rail border visible in both states; chat collapses to just the input
with a working expand chevron; both states survive reload; content still full
height behind the floating chat.
