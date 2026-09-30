# Pond-v4 — Build-vs-Rebuild Evaluation

_Generated 2026-09-29 via a 15-agent workflow: 7 spec sections each mapped & scored (Sonnet), adversarially verified (Opus), then synthesized (Opus). ~50 surfaces scored against `wayfinder/design_handoff_pond/` + `GAP-ANALYSIS.md`. Each surface's GAP-ANALYSIS label was independently re-checked against real code; every rebuild-favorable or inaccurate verdict was challenged by a skeptic whose job was to overturn it._

## Verdict

**CONTINUE — do not rebuild. High confidence.** The adversarial pass confirms the prior session's qualitative call with hard numbers: across all 7 sections and ~50 challenged surfaces, **zero surfaces earned a full "rebuild" (throw-it-out) verdict.** The strongest adverse verdicts are four `rebuild-surface` calls (durable trash, unified session-undo, threads-as-a-database, deep-research), and every one of them rebuilds a _surface on top of a retained backbone_ — not the app. The expensive, hard-to-rebuild core (unified pages tree, the 8-type field engine with relations/rollups/coerce, the streaming AI composer, and the persisted propose→accept resolutions envelope) is real, value-correct, and would have to be fully re-paid on any rebuild. The verdict is not sunk-cost bias: it survived a pass whose explicit job was to overturn it, and the pass raised several continue-day estimates (guarding against underestimation) without flipping a single verdict.

## The numbers

- **Continue-path total: ~104 eng-days.** Sum of corrected `continueDays` across all surfaces — this includes the net-new work that is unavoidable on either path (icon glyph-mask system, template store, multi-pond/roles, change-log, mobile shell, deep-research UI, etc.), because those get built regardless.
- **Rebuild-path total: ~136 eng-days.** Sum of `rebuildDays` across _all_ surfaces. A rebuild re-pays for everything, including the working backbone that continue keeps for free.
- **Delta: rebuild costs ~32 more eng-days (~31% more) and buys nothing continue can't reach.** The delta is concentrated exactly where the backbone is expensive and correct: the shell (rebuild 8 vs continue 3), PondRail (6 vs 3), record-pages/data-model (5 vs 3), diff-card (6 vs 4). Every extra rebuild-day is re-paying for code that already works and already matches the spec's values. The net-new surfaces cost roughly the same either way (that's why several show `rebuildDays == continueDays`), so the entire delta is pure waste on the rebuild side.
- **Credibility check — GAP-ANALYSIS was found INACCURATE (claimAccurate=false) on 9 surfaces, and every correction pointed _toward more existing value or clearer scope_, never toward rebuild:** §01 palette/ink/signals/areas/type were labeled "Net-new/Partial" but verified as done; §02 PondRail and Breadcrumb were labeled "Exists" but are Partial (missing pond-name/switcher, presence/access/⌘K props); §03 record-pages and page-kind were "Exists" but are Partial (8 not 9 field types; `kind` write-only-at-create); §04/05 dark-theme was "Net-new" but is a complete MN-correct `.dark` layer, and the three-keys row conflated a net-new _screen_ with existing ⌘K/slash _mechanics_; §06.03 diff-card was "Exists" but is Partial (3-status not 8-status). The GAP doc's errors were consistently _pessimistic about existing code_ — which means the true continue position is if anything slightly stronger than even this matrix shows.

## Scored matrix

| Section                      | # surfaces                | continue-days | rebuild-days | reuse-weighted verdict                   | rebuild-surface flags              |
| ---------------------------- | ------------------------- | ------------- | ------------ | ---------------------------------------- | ---------------------------------- |
| §01 Design System            | 16                        | 10.0          | 14.0         | continue (reskin-heavy)                  | none                               |
| §02 Component Library        | 5 challenged (+4 net-new) | 11            | 18           | mixed → continue/reskin lean             | PondPicker, Selection bar (C6)     |
| §03 Concepts + Data Model    | 6                         | 18            | 19           | continue (backbone) + net-new governance | Threads-as-a-database              |
| §04 Onboarding + §05 Shell   | 7                         | 19            | 27           | continue/reskin                          | First run (6d), Mobile             |
| §06.01–06.10 core journeys   | 6                         | 19            | 26           | mixed → continue                         | none                               |
| §06.11–06.20 advanced/collab | 2 challenged (+8 net-new) | 8             | 9            | net-new slice on kept backbone           | Deep research (06.18)              |
| §07 Edges + §08 Sources      | 4                         | 19            | 23           | rebuild-_surface_ + net-new              | Trash/tombstones, Session undo     |
| **TOTAL**                    | ~50 scored                | **~104**      | **~136**     | **CONTINUE**                             | **7 surfaces, all surface-scoped** |

## Surfaces where rebuild actually wins

There are **zero full-rebuild ("scrap the app") verdicts.** Seven surfaces are `rebuild-surface` — meaning rebuild _that surface's layer_ while keeping the backbone beneath it. None argues against continuing the codebase:

1. **§02 PondPicker (source picker)** — continue 3 / rebuild 4. No 3-step caret source→type→new picker exists; `SourceList` is citation-only, `LinkRecordsProposalCard` is an AI diff card. Reusable: SlashMenu portal/keyboard-nav scaffolding.
2. **§02 Selection bar (C6)** — continue 2 / rebuild 3. `TextSelectionPopover` is a single "ask pond" pill; the spec is a 10-action formatting toolbar. Reusable: the ~60-line selectionchange/positioning logic.
3. **§03 Threads-as-a-database** — continue 4 / rebuild 4. `conversations.transcript jsonb` is a per-session blob _outside_ the pages tree; the spec wants threads-as-records-in-a-database. Structurally incompatible persistence shape. Reusable: the resolutions/transcript payload-shaping.
4. **§04/05 First run (guided shell entry)** — continue 3 / rebuild 4. `LifeOverviewPanel` is a thin structural shell, not the guided suggestion-card/proposal flow. Reusable: the shell + working create_page proposal card.
5. **§04/05 Mobile** — continue 6 / rebuild 7. Shell carries no breakpoint handling; TopBar is fixed desktop chrome. ~20% reuse from shared data/logic.
6. **§06.18 Deep research** — continue 5 / rebuild 6. `web-search.ts` is always-on provider search; spec wants an off-by-default per-question toggle plus a plan/standards/cross-check/source-card layer (~80% net-new). Reusable: provider search plumbing + SourceList shell.
7. **§07 Trash/tombstones + Session undo** — continue 5/5 and 8/8. No `deleted_at` column in any of 9 migrations; `deferred-commit.ts` is a single-shot timer, not a durable trash model or a cross-surface history stack. Both need a real DB schema + new store. Reusable: the undo-toast/blast-radius UX scaffold (~30%).

The fact that even the _worst_ surfaces top out at "rebuild this layer, keep the engine" — with continue ≈ rebuild days because there's simply nothing to continue from on those specific surfaces — is the strongest possible evidence _for_ continuing the app.

## The two model tensions

Both are **bounded migrations on the continue path.** Neither argues for a rebuild.

**1. `type='area'` → area-as-page (§03 / #108).** This is the more invasive of the two because area is a hard type in ~8 places that must all change: the DB CHECK constraint (migrations 0003 + 0006), the `NodeType` union (types.ts:13), three AI tool enums (chat/route.ts:53, chat/tools.ts:33, save-extract/route.ts:21), the load-bearing content-page-counting rule (overview.ts:66 `row.type !== 'area'`), plus Rail/tree/create/DocumentPanel render sites. Removing the hard type means redefining "content page vs organising folder" (currently keyed entirely off `type==='area'`) and shipping one migration. **Cost: ~4 eng-days as a migration/refactor** (§03 raised this from 3→4 to price the constraint + enum + counting-rule surgery). It is _not_ a rebuild trigger — the tree, rail-folder rendering, and counting machinery are all reused; a greenfield model would simply never introduce the hard type (rebuild 3), so the fork is "pay 4 to migrate" vs "re-pay ~everything to avoid paying 4." Migrate.

**2. Ephemeral transcript diffs → durable only-grows change-log (§03 6c/6o / #110/#102).** Today decisions live in a `{messages, resolutions}` envelope stamped onto the transcript blob (ProposalActions 3-status; resolutions.ts accepted/rejected only). The spec wants a durable, only-grows change-log backing the 8-status diff model, revert-from-log, and 30-day borrowed-value freeze. This is **new-store work regardless of path** — it's why Trash (5d), Session undo (8d), diff-card 8-status (part of the 4d continue), and deleted-record freeze (4d) all gate on it. **Cost: the change-log/deleted_at store is ~5–8 eng-days of net-new persistence, unavoidable on either path.** It does _not_ argue for rebuild: it's additive (a new append-only table + revert path), the existing resolutions envelope and diff-card backbone ride on top of it, and a rebuild would have to build the identical store _plus_ re-pay for the diff engine that already exists. Build it as a phase-3 slice, gated as the reconcile notes already sequence (#110/#102/#103/#104/#105).

## Recommendation

**Proceed continue/reskin. The phased queue in the memory record still holds.** Dependency-ordered next steps:

1. **Phase 0 — mechanical token debt (unblocks everything visual).** The #92 `press-*` → `color-*` rename across ~300+ references (§01, 2d), plus the token _adoption_ pass (spacing-mn-/spacing-mnl- have zero consumers, text-mn-_/.voice-_ nearly zero — §01). These are pure reskin, no logic risk, and every downstream reskin rides on them.
2. **Phase 1 — the two model tensions, in order.** First `type='area'` → area-as-page (#108, ~4d migration) because it's contained and unblocks the rail/overview reskins and the databases-root net-new view. Then stand up the **durable change-log / `deleted_at` store** (#110/#102, ~5–8d) — this is the single highest-leverage net-new investment because it unblocks §07 trash, unified session-undo, deleted-record freeze, and the 8-status diff model all at once.
3. **Phase 2 — reskin the retained backbone.** Shell/Rail/Breadcrumb/TopBar adopt MN utilities + add pond-name/switcher and presence/access/⌘K props (§02/§04/§05, all `continue`); diff-card grows to 8-status on the now-durable log (§06.03).
4. **Phase 3 — net-new surfaces on kept engines.** Icon glyph-mask system (§01, 2d), template store (blocks §06.06/08/09), source picker + C6 selection toolbar (§02), deep-research mode (§06.18), multi-pond/roles, mobile shell. These are net-new either way and cost the same on both paths — build them on the existing tree/composer/registry, don't rebuild those to get them.

**Scrap nothing. Keep:** the pages tree, the 8-type field engine (relations/rollups/coerce/zod-single-source), the streaming useChat composer + tool-calling route, the module registry + serialization facets, the resolutions/transcript envelope, the WAI-ARIA rail tree with DnD reparent, the working `.dark` role-reassignment token architecture, and the OTP auth spine. Every one of those is evidence-confirmed as value-correct and would cost more to rebuild than to keep.
