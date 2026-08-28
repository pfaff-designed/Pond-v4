---
id: 26
label: ux-audit:finding
status: resolved
blocked-by: []
blocks: []
---

# ＋ New page is a dead end

## Problem

Clicking the top-right ＋ instantly creates an "Untitled" node at the root —
no name prompt, no destination choice — and it lands typed as an **area**, so
the user gets the empty overview surface ("0 — nothing inside yet — add a
page, or ask Pond") with **no editor to type into and no rename affordance**
(`~/ux-07-new-page.png`). The very first creation act a new user tries stalls
completely; the only way forward is the delete ×.

Notes for the fix: a `NodeCreationModal` organism already exists in
`src/components/organisms/` — reconcile why ＋ bypasses it (or retire one of
the two paths). The overview-not-editor half of this is the same type-switch
question as ticket-22.

## Direction (not yet designed)

- ＋ opens a blank **page** editor with the title field focused (name-first or
  name-inline — decide), defaulting the parent to the current context with an
  easy override (the SavePicker's 3-tier labels already solved destination
  disambiguation for the AI path — reuse).
- Rename must be possible from every surface a page can render as (the
  overview header currently shows the title as a static label).

## Origin

Hands-on UX audit, 2026-08-27. Reproduce: click ＋ from any leaf page.

## Resolution (2026-08-27)

The ＋ dead end is fixed. ＋ no longer instant-creates an untitled top-level
`area` on an empty overview — it opens a **name-first creation dialog**
(`CreatePageModal`), then lands the user in the editor.

**Creation flow — name-first modal (why).** Of the two allowed directions, the
name-first modal was chosen over name-inline because the _destination picker_
(the ticket's required 3-tier `toParentOptions` override) has a natural home in
a create form, and putting it there avoids inventing a separate reparent write
path just to make the destination changeable after landing. The dialog is built
on base-ui's `Dialog` and styled to match the existing `ConfirmDialog`
(deletion), so it reads as the same calm, deliberate Press gesture rather than a
foreign popup. It gathers exactly what the AI `create_page` card gathers — a
title and a destination — then hands off.

- **Lands in the editor, never the dead overview.** The created node is typed
  `page` (never `area`) with no blocks, so per the ticket-22 type-switch the
  editor renders with the title pre-filled and "+ Add text" available — a real
  place to type.
- **Parent defaults to context, with override.** The destination defaults to
  the page currently in view (`?nodeId`), falling back to "Life · top level" at
  the root, and can be overridden via a "Save to" `<select>` populated by the
  same `toParentOptions` 3-tier disambiguated labels the AI save path uses.
- **Rename from every surface.** The `AreaOverviewPanel` header title (a static
  label before) is now an inline click-to-rename field, saving via the same
  `updateTitle` path the editor uses and invalidating `['pages']` (rail label)
  and `['page', id]`. Escape reverts, Enter/blur commits, empty is refused.

**NodeCreationModal reconciliation — retired.** `NodeCreationModal` was an
AI-mini-chat creation flow with **no runtime entry point** (nothing rendered it;
only tests + a route referenced it) and the wrong shape for a name+destination
form. Rather than leave two competing creation paths, it was deleted along with
its dead scaffolding: the component, its stories, `/api/node-chat/route.ts`, the
`createNodeChatTransport` transport, and `lib/pages/create-top.ts` (the old
instant-create helper). Its test blocks were dropped; the surviving TopBar +
AITerminal tests moved to `create-page-flow-ui.test.tsx`, rewritten for the new
modal behavior.

**Files changed**

- `src/components/organisms/CreatePageModal.tsx` — new organism (view/container split)
- `src/components/organisms/CreatePageModal.stories.tsx` — new stories + story tests
- `src/components/organisms/TopBar.tsx` — ＋ opens the modal; passes current `?nodeId` as default parent
- `src/components/organisms/OverviewSurface.tsx` — editable kicker (`onRenameKicker`); `AreaOverviewPanel` wires rename via `updateTitle`
- `src/components/organisms/OverviewSurface.stories.tsx` — added `EditableTitle` story
- `src/components/organisms/AITerminal.tsx`, `src/lib/conversation/transcript.ts` — stale-comment updates
- `src/lib/ai/transports.ts` — removed `createNodeChatTransport`
- `src/__tests__/create-page-flow-ui.test.tsx` — replaces `node-creation-modal-ui.test.tsx`
- deleted: `NodeCreationModal.tsx`, `NodeCreationModal.stories.tsx`, `app/api/node-chat/route.ts`, `lib/pages/create-top.ts`

**Rail note:** the rail's own `+` add-sub-page already created a `type:'page'`
under the row and navigated into the editor (never the dead overview), so it was
left as-is per the ticket-25 boundary — no change needed there.

**Validation:** `npm run typecheck` clean; `npm test` 350/350; `npm run
test-storybook` 78/78; touched files lint-clean. Live browser verify against
real data (dev server on a scratch port): ＋ opened the dialog with the title
auto-focused and destination defaulted; created a `page` nested under the chosen
parent and landed in the editor with "+ Add text"; the area-overview inline
rename propagated to the rail; 0 console errors. Test mutations reverted.

**Review fixes (2026-08-28):**

- Escape in the kicker rename now truly reverts (the Escape-triggered blur fired
  its commit synchronously with the stale edited draft — a `reverting` ref flags
  that blur; regression story test added: type, Escape, assert no rename).
- Scrubbed dangling `createNodeChatTransport`/node-chat mocks and the
  NodeCreationModal comment from `save-picker-modal.test.tsx`,
  `handoff-terminal.test.tsx`, `transcript-sanitize.test.ts`.
- Modal title focus is now base-ui's `initialFocus` on the Popup (no hand-rolled
  setTimeout) and is asserted by a story test.
- Empty-title create writes `'Untitled'` to the DB (jest-covered) instead of
  `''` — display fallbacks no longer mask an empty row.
- Dropped `TopBarView`'s dead `busy` prop (modal owns in-flight state).
- Dialog backdrop/popup chrome extracted to `atoms/dialog-chrome.ts` (class
  consts), shared by ConfirmDialog + CreatePageModal.
- Workspace URL building consolidated into `lib/pages/nav.ts` `workspaceHref()`,
  used by Rail, overview cards, the modal, and the AI create_page accept path.
  ⚠️ Merge note: ticket-25 lands its own nav helper for the same URL —
  reconcile the two modules to one when the branches meet.
- **Documented divergence:** the kicker rename _refuses_ an empty title
  (reverts) while the editor's title input allows clearing to empty (placeholder
  shows "Untitled", DB stores `''`). Left as-is: a rename gesture abandoning to
  empty reads as a mistake; in-editor clearing is a transient editing state.
