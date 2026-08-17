---
id: 19
label: verify:finding
status: open
blocked-by: []
blocks: []
---

# Resolved proposal cards re-arm after reload (data-loss path)

## Problem

Accept/Dismiss state on chat-history proposal cards is client-only. After a
reload, every historical card renders live buttons again:

- **"Proposed new page" cards** for pages that were already created → one click
  away from a duplicate page.
- **Wholesale table-edit cards** → re-accepting an old card overwrites the table
  with its stale snapshot, silently reverting any manual cell edits made since.
  This is the data-loss path: the card's payload is a full-state `edit`, so an
  old accept clobbers newer content with no diff shown against current state.

Reproduced live during the 2026-08-17 /verify pass against `52926d6` (camera
gear inventory scenario).

## Related symptom (same dangling-proposal class)

Immediately after a page was created via its card, the model's next response
proposed a _duplicate_ new-page card alongside the correct table-edit card — it
had no signal that the earlier card was already actioned. Persisted resolution
state is likely the same fix surface: whatever records "this proposal was
accepted/dismissed" should also feed the injected context so the model stops
re-proposing.

## Direction (not yet designed)

Persist proposal resolution (accepted / dismissed, when, by which action) with
the chat history, and render resolved cards inert (badge, no buttons). Consider
staleness guards on accept as a second layer: a wholesale edit whose `before`
no longer matches the current block should at minimum re-confirm.

## Origin

/verify session 2026-08-17 (`/private/tmp/handoff-pond-fastfollows.md`), found
while verifying the AI page-creation arc + serialization-facet refactor.
