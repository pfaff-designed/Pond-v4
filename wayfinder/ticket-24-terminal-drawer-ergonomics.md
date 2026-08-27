---
id: 24
label: ux-audit:finding
status: open
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
