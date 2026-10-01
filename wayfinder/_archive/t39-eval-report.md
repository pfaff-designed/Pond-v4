# Ticket-39 routing-eval report (2026-08-29)

`scripts/eval-routing.mts --runs 2` · model `claude-sonnet-4-6` · 22 cases × 2 runs.
Re-run required by the spec after the prompt refactor (the prompt had grown through
t21/t29/t30/t31/t38 without a check, and t39 added persona + lifecycle +
correspondence + brief sections).

## Final result (after the DESTINATION SURFACE fix)

**44/44 case-executions passed across 2 full runs — every case 2/2.**

## Deltas, run by run

| eval run                   | prompt under test                       | result                                                                           | failing case                                                                                                |
| -------------------------- | --------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| pre-t39 baseline (t30-era) | monolithic slab                         | last known green (t30 shipped; t30 itself flagged the eval was not re-run since) | —                                                                                                           |
| t39 first pass             | refactored sections + persona/lifecycle | **42/44**                                                                        | `"add a recipe" while on an index page` — expected `propose_changes`, saw `create_page`, **0/2 consistent** |
| t39 after review fix       | + DESTINATION SURFACE routing rule      | **44/44**                                                                        | none                                                                                                        |

## The regression and its fix

The M2-tightened case pins exactly this class of prompt-growth drift: "add a
recipe" while ON a Recipes index page must be read as _edit that page_ (append to
the index), not _mint a new recipe page_. After the t39 prompt rework the model
chose `create_page` on both runs — the persona framing ("substantive collaborator")
plausibly nudged it toward the more substantial interpretation.

Fix: one new sub-rule in the ROUTING section (`DESTINATION SURFACE`): when the
user's request names or implies an EXISTING page as the surface the content should
land on — especially adding an item while ON a page that indexes/lists such items —
prefer `propose_changes` on that page; `create_page` only for content genuinely
separate from every surface the user pointed at, or an explicit separate/new-page
ask. The rule's presence is jest-pinned in `prompt-sections.test.ts`.

Verified no collateral: the explicit-"separate" case, both placement-inference
cases, the top-level guard, and all steward/persona cases (musing → no tool,
venting → chat, explicit → act) stayed **2/2** after the fix.

## Notes

- The steward persona survived the t39 persona layer intact in BOTH eval passes —
  the 42/44 first pass already had every steward case at 2/2; the persona
  additions never made Pond over-eager.
- Cost: 2 eval passes × 44 single-step calls ≈ 88 sonnet calls, modest.
