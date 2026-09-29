# Build Brief — Input-only chat bar with floating peek/expand transcript

**Status:** specced + signed off 2026-09-13. Branch `feat/terminal-input-only-peek` off `main`.

## Why

Today the AI terminal is a fixed ~288px (→500px for proposals, 640px max) drawer
pinned to the bottom as a flex sibling — it reserves a big block of vertical
space even when empty, and its tan top edge slices page content. The user wants
the chat to **rest as just the input bar** (the white composer), and for the
transcript to **float over the page** (page never moves) — peeking the latest
exchange after a reply, expandable to full history.

## Resolved product decisions (from grilling)

1. **Reply behavior:** transcript floats _over_ the page as an overlay; the page
   underneath does not move.
2. **Rest chrome:** the `Context: … · Clear` strip is **dropped** from the resting
   bar — rest is the pure composer. Context + Clear relocate into the overlay header.
3. **Visibility:** **peek latest, expand for more.** After a reply the overlay shows
   only the latest exchange (a peek); it collapses back to input on the next send;
   an expand control opens full scrollable history.
4. **Cards:** two separate floating cards (overlay + composer) with a small gap —
   a clean "floating" read, no conditional corner logic. (Adjustable after live view.)

## State machine

| State        | Shows                                                                                                                                | Enter when                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **rest**     | composer only (textarea + Send/voice/attach); no context strip, no transcript                                                        | no messages, OR peek dismissed and not streaming, AND no unresolved proposal                 |
| **peek**     | floating overlay above the composer with the **latest exchange** (tail from the last user message → end), capped ≈`45vh`, scrollable | a reply is streaming or just completed, and not dismissed                                    |
| **expanded** | floating overlay with **full scrollable history**, capped ≈`72vh`                                                                    | user clicks expand; **forced** whenever an unresolved proposal card from this session exists |

- **On send:** the peek resets to the new turn (old peek clears → "collapses on next send"); the reply streams into the peek.
- **Overlay header controls:** context label (left) · **⤢ expand/collapse** toggle · **Clear** · **× close** (→ rest). Close is overridden while a proposal is unresolved.
- **Re-open from rest:** a small **history chevron** on the composer, shown only when messages exist, opens the overlay to peek.

## Layout / positioning

- `TerminalDrawer` `<section>` becomes `relative`; height = **composer only**
  (`flex-shrink-0`, auto). `<main>` reclaims the freed space.
- Transcript overlay: `absolute bottom-full inset-x-0`, centered `mx-auto max-w-2xl`,
  `z-40`, `bg-card rounded-2xl`, own `max-height` + `overflow-y-auto`, small gap
  above the composer. Composer stays `bg-card rounded-2xl` in normal flow.
- Light Press motion (opacity + translate-y ease-in; reduced-motion snaps).

## Removed (the fixed-height/resize model is now incoherent)

- Drag/keyboard resize handle + all pointer/keyboard resize handlers.
- Props `height` / `onHeightChange` / `onHeightCommit`; exports
  `TERMINAL_MIN/MAX/DEFAULT/COLLAPSED_HEIGHT`, `clampTerminalHeight`, `RAIL_WIDTH_PX`.
- AITerminal ergonomics block: `drawerHeight`, localStorage height persist,
  `PROPOSAL_MIN_HEIGHT` auto-grow, `growOverride*`, `effectiveHeight`.

## New TerminalDrawer contract

```
contextLabel: string
mode: 'rest' | 'peek' | 'expanded'
onExpandToggle: () => void   // peek ⇄ expanded
onClose: () => void          // → rest
onReopen: () => void         // rest → peek (composer chevron)
onClear: () => void
canClear?: boolean
hasHistory: boolean          // gates the composer re-open chevron
children: ReactNode          // the transcript (peek shows a clamped tail; expanded shows all)
footer: ReactNode            // the composer
```

The transcript content (peek tail vs full) is chosen by AITerminal and passed as
`children`; the drawer only owns the overlay chrome, max-height per mode, and
positioning. `localStorage` still remembers the last non-rest mode preference is
NOT persisted (session-scoped) — a fresh mount starts at rest.

## Files touched

- `src/components/molecules/TerminalDrawer.tsx` — redesign.
- `src/components/organisms/AITerminal.tsx` — replace ergonomics with peek/expand/dismiss; compute `peekMessages`; force-expand on unresolved proposals.
- `src/components/molecules/TerminalDrawer.stories.tsx` — rewrite stories + story-tests (rest/peek/expanded, expand toggle, clear, close, reopen).
- `src/__tests__/terminal-drawer-ergonomics.test.ts` — drop `clampTerminalHeight` tests; keep `unresolvedProposalIds`/`changeStatus`.
- `src/__tests__/chat-command-menu.test.tsx` — update the `TerminalDrawer` mock.

## Verify

`tsc` clean · TerminalDrawer story-tests + jest green · live: rest = input-only &
page reclaims space; send → peek floats over a fixed page; expand → full history;
unresolved proposal force-opens; Clear/close/reopen work.
