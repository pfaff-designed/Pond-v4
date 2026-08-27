---
id: 24
label: ux-audit:finding
status: resolved
blocked-by: []
blocks: []
---

# Terminal drawer fights the content — worst at the moment of decision

## Problem

The AI terminal is a fixed-height, always-open bottom drawer (~40% of
viewport). Observed effects (UX audit 2026-08-27):

- **Covers content**: on the Life overview the Creativity card is clipped
  behind the drawer (`~/ux-01-life-overview.png`).
- **Proposal review is cramped**: the create-page proposal card — the moment
  the user must judge what they're approving — rendered mostly clipped inside
  the drawer, requiring inner scrolling to see the preview, the Save-to picker,
  and the buttons together (`~/ux-05-create-proposal.png`).
- **Stale transcript everywhere**: the previous conversation stays pinned in
  the drawer across every context switch; `/clear` exists only as placeholder
  text (`/clear · /handoff · /save`) — no visible affordance, no discovery
  path besides reading the placeholder.
- **⌘K keyboard shortcut didn't fire** in testing (the ⌘K button works, but it
  only focuses the same input). Verify the key handler; also note there are
  three ask entry points ("ask Pond →", ⌘K button, the input itself) that all
  do the same thing.

## Direction (not yet designed)

- Collapsible + user-resizable drawer; remember height.
- Auto-grow (or overlay) when a proposal card arrives, so review needs no
  inner scroll — proposal moments deserve the space.
- Visible transcript controls (clear/collapse); consider whether the transcript
  should auto-collapse to the last exchange on context switch.
- Fix or remove the ⌘K key binding; decide if "ask Pond →" earns its place.

## Build notes

`AITerminal` organism (currently no Storybook story — add one, per front-end
workflow). Drawer behavior states belong in stories.

## Origin

Hands-on UX audit, 2026-08-27.

## Resolution (2026-08-27)

Drawer ergonomics rebuilt around a new presentational molecule and wired into
the `AITerminal` organism. The drawer is (and was) a **flex sibling** of the
main panel, not an overlay — so collapse/resize reclaim space for the content
above instead of covering it; the audit's "clipped Creativity card" was the
drawer's fixed 18rem height squeezing `main`, which resizing/collapsing now
relieves. No layout, OverviewSurface, or DocumentPanel change was needed.

- **`molecules/TerminalDrawer`** (new, with story + story tests): the drawer
  shell — collapse toggle, drag-to-resize handle (pointer on `window` so the
  drag survives the cursor leaving the 6px strip; ↑/↓ keyboard resize for a11y),
  min/max clamp (160–640px, default 288 = the incumbent 18rem), and a **visible
  `Clear` control** (disabled when the transcript is empty) beside the context
  label — no longer placeholder-text-only.
- **Height + collapse remembered** in `localStorage`
  (`pond:terminal-height` / `pond:terminal-collapsed`), hydrated client-side to
  avoid SSR skew.
- **Auto-grow on proposal**: while any create-page/diff card is _unresolved_,
  the drawer grows to ≥460px (never shrinking a taller user) and force-uncollapses
  (both **derived**, not persisted), so the preview + save-picker + buttons show
  without inner scroll; it returns to the remembered height once resolved.
- **⌘K root cause + fix**: the handler always worked (proven with synthetic
  events), but two real-world failure modes were hardened away: (1) the listener
  is now registered in the **capture phase on `document`** so a focused editor or
  a browser default can't swallow ⌘K before it reaches us; (2) a _collapsed_
  terminal unmounts its textarea, so a synchronous `focus()` found nothing — the
  focus request now uncollapses and sets a pending-focus flag that an effect
  fulfils once the input mounts. Verified live: ⌘K from a collapsed drawer both
  expands it and focuses the input.

Files: `src/components/molecules/TerminalDrawer.tsx` (+ `.stories.tsx`),
`src/components/organisms/AITerminal.tsx`, `src/components/organisms/TopBar.tsx`.

Validation: `typecheck` clean, `jest` 315/315, `test-storybook` 66/66, touched
files lint clean. Live-verified on the worktree dev server (collapse frees space
to `main`; resize + persistence across reload; ⌘K uncollapse+focus).

### Code-review fixes (same day)

- Drag hardened: pointer capture on the handle + pointerId matching +
  `pointercancel` handling — an interrupted drag can no longer leave the page
  stuck in `ns-resize`/no-select or resume on a stray move; commits the last
  height the user saw.
- Drag vs auto-grow: **drag wins.** Resizing while the 460px floor pins the
  drawer records an override for that proposal set — the drag is live from the
  visible height (no dead zone, no silently-persisted unseen heights); a new
  proposal re-arms the floor.
- Auto-grow is **session-scoped**: proposals re-seeded from a prior session's
  transcript (whose pending state is never persisted, ticket-19) no longer pin
  the drawer on every mount — only proposals arriving this session count
  (`initialMessageIds` recorded at conversation load; derivation extracted to
  `lib/conversation/proposals.ts`, jest-covered incl. the mount case).
- pendingFocus leak closed: a ⌘K attempt on a mounted-but-disabled input
  consumes the request instead of stealing focus later.
- `CreatePageProposalCard` preview is height-bounded (200px, internal scroll)
  so title + preview + Save-to + actions always fit in the grown drawer.
- Height persists on gesture end only; localStorage access deduped into
  `readStored`/`writeStored`; KeyboardResize story asserts the rendered height;
  clamp/derivation moved to jest (`terminal-drawer-ergonomics.test.ts`).
