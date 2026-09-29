# Pond-v4 ⇄ design_handoff_pond — Gap Analysis

_Generated 2026-09-26. Maps every section of `wayfinder/design_handoff_pond/` against the current Pond-v4 codebase._

**Decisions this doc assumes** (from the user, 2026-09-26):

1. The handoff's **Make Noise** design language **supersedes** the shipped "Press / Clearing" aesthetic. It is now the single source of visual truth.
2. First working step is this gap matrix, before any building.

**Status key:** `Exists` = built & broadly matches intent · `Partial` = built but incomplete or conflicts with the Make Noise spec · `Net-new` = no backing code. **Size** = rough build effort (S/M/L).

---

## Executive read

Pond-v4 is **not greenfield and not close to done** against this spec. Two truths:

- **The functional backbone is real.** The unified `pages` tree, typed collections/records/fields, relations, rollups, views, backlinks, page-kind, the AI composer with streaming threads, and the propose→accept proposal-card engine all exist and largely match the concepts. The core "Pond proposes, you accept" spine is built.
- **Everything else is either a reskin or a net-new subsystem.**

Two cross-cutting forces dominate the work:

1. **A total visual reskin.** Every existing component sits on the Press/Clearing token layer (Inter/Fraunces/Instrument Serif fonts, `press-*` colours). Make Noise mandates PP Neue Montreal / PP Neue Montreal Mono / PP Editorial New + the paper·ink·signal·area palette. This is an **L that rides on top of nearly every component row** — the single biggest reason the numbers below skew "Partial."
2. **The governance & persistence layer is missing.** Diffs today are ephemeral tool-parts in a chat transcript envelope. The spec's durable, only-grows **change log**, **memory store**, **threads-as-a-database**, **multi-pond + roles/sharing**, **template system**, and **external source connections** have essentially zero backing data model.

**Roughly:** design system + component library ≈ _reskin-heavy_ (structure mostly there). Storyboards 01–10 ≈ _half built, half net-new_. Storyboards 11–20 ≈ _~80% net-new_. Edges + Sources ≈ _~90% net-new_.

### Load-bearing foundations (block the most downstream work)

| Foundation                                        | Why it blocks                                                                              | Size |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---- |
| **Make Noise token + font layer** (§01)           | Every component reskin and every new surface depends on it. Do first.                      | M    |
| **Durable change-log / diff store** (§03, 6c, 6o) | Underpins the diff model, statuses, undo→revert, working-together, agents-as-proposers.    | L    |
| **Multi-pond + roles data model** (§03, 6m, 6n)   | Blocks all of sharing (6n/6p), per-pond agents/skills/memory/templates, the pond switcher. | L    |
| **Template system** (§03, 5, 6f/6h/6i/6l)         | Blocks 4 storyboards + shell empty states + slash-menu template group.                     | M–L  |
| **External source connection layer** (§03, §08)   | Blocks onboarding step 4, sources, read-only external DBs, sync.                           | L    |

---

## §01 Design System — _reskin, not rebuild_

**Headline:** Current tokens are a _different selection off the same shared Make Noise palette_. Tailwind v4 `@theme inline` is in place and the **motion ladder already matches MN 1:1** (90/150/280/460/560 + `cubic-bezier(.22,.8,.2,1)`). Gaps are concrete: wrong raw hexes, wrong fonts entirely, a bespoke `--press-*` naming scheme, no signal/area colour roles, no glyph-mask icons, and one theme where MN wants eight.

| Item                                | Status     | Current code                                 | Gap / conflict                                                                                                     | Size |
| ----------------------------------- | ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---- |
| Palette raw values                  | Partial    | `globals.css:122-136`                        | `--press-paper #efeae0`/`--press-ink #211f1b` ≠ MN `#FAF9EF`/`#1B1D14`; adopt `_ds/mn/tokens/colors.css` wholesale | M    |
| Ink text tiers                      | Partial    | `--press-body/muted/faint`                   | MN = exactly 3 (100/80/68); current has 4 on wrong base                                                            | S    |
| Signal colours (one job each)       | Net-new    | —                                            | burnt-orange `#D96629`, wheat `#FFEFAE`, red `#C55347` have no roles in code                                       | M    |
| Area colours (marks only)           | Net-new    | `--press-accent` (wrong-value sage, misused) | sage/mist/navy for glyphs+kind-dots only, navy→mist on dark                                                        | S    |
| Type — families & faces             | Net-new    | `layout.tsx:2,9-28` (4 Google fonts)         | full swap to 3 licensed PP faces via `next/font/local`                                                             | M    |
| Serif weight discipline (never 400) | Net-new    | Fraunces/Instrument (400-capable)            | enforce 200/800 only via voice tokens                                                                              | S    |
| Type — voice tokens + UI scale      | Net-new    | ad-hoc per-component sizing                  | add 8 voice tokens + 8-step ladder (11–46) + prose 17.5/1.75 58ch                                                  | M    |
| Card radius & shadow                | Partial    | `--radius 0.625rem` base                     | MN cards = radius 20 (current base is MN's _row_ value)                                                            | S    |
| Floating glass                      | Exists     | `globals.css:430-443 .press-glass`           | near-exact; tint tweak only                                                                                        | S    |
| Spacing scales                      | Partial    | Tailwind defaults                            | add 2 hard-separated scales (4–32, 48–320)                                                                         | S    |
| Motion                              | **Exists** | `globals.css:50-61`                          | already exact match; rename to MN token names at most                                                              | S    |
| Icons — glyph mask                  | Net-new    | lucide (`components.json`)                   | 182-glyph CSS-mask-over-currentColor system for areas/pages                                                        | M    |
| Icons — functional SVG              | Partial    | ~30 files inline SVG; lucide in 2            | remove lucide; standardise stroke 1.4 round caps                                                                   | S    |
| Eight themes                        | Net-new    | one `.theme-press`; unrelated `.dark`        | 8 presets reassigning `--color-*` roles only                                                                       | L    |
| Token architecture / naming         | Partial    | `--press-*` + shadcn + `@theme inline`       | re-base on MN `--raw-*`→`--color-*` contract                                                                       | M    |

---

## §02 Component Library — _~70% structurally present, 100% needs reskin_

**Headline:** Family shapes mostly exist (Rail, composer, breadcrumb, ⌘K palette, / menu, source list, selection popover, 5-of-13 charts, most block kinds). Every one rides the Press token layer → **all ~14 families inherit an L-sized reskin**. True net-new: the 12 templates, zen pill + ink surface, comment card, review-list/change-log surface.

| Pond component             | Status      | Current code                                | Gap / conflict                                                                 | Size |
| -------------------------- | ----------- | ------------------------------------------- | ------------------------------------------------------------------------------ | ---- |
| PondAtom                   | Partial     | scattered `atoms/*`                         | no unified 24-kind × 9-state atom; consolidate + reskin                        | L    |
| PondControl                | Partial     | `ui/button.tsx`, `ProposalActions`          | no unified variants/states; extract field/toggle/checkbox                      | M    |
| PondMolecule               | Partial     | `TreeRow`, `OverviewCard`, `RelationValue`… | no named family; missing provenance/notice/reminder/entry/task-card            | L    |
| PondBlock                  | Partial     | `modules/*` via `registry.ts`               | audit gallery/log/properties kinds + `deleted`/`broken` states                 | M    |
| PondChart                  | Partial     | `charts/*` (line/area/bar/ring/heatmap)     | 5 of 13 kinds; missing composed/net/gauge/radar/scatter/sankey/sunburst/funnel | L    |
| PondPicker — / menu        | Exists      | `SlashMenu.tsx`                             | add templates group; C21 skills-vs-blocks; reskin                              | M    |
| PondPicker — source picker | Partial     | `SourceList.tsx` + proposal cards           | no unified 3-step (source→type→new) caret picker                               | M    |
| PondPicker — ⌘K palette    | Exists      | `CommandPalette.tsx` + `TopBar.tsx`         | missing scoped/records/`>`-actions/no-dead-end empty                           | M    |
| PondRail                   | Exists      | `Rail.tsx` + `TreeRow`                      | missing pond switcher, area-colour marks, roles state, databases section       | M    |
| PondComposer               | Exists      | `AITerminal.tsx` + `TerminalDrawer`         | best-covered; add research toggle, @-mention chip; reskin                      | M    |
| PondTemplate (12 layouts)  | **Net-new** | —                                           | entire layer: 12 layouts + empty/filled + save/edit/apply                      | L    |
| Selection bar (2t)         | Partial     | `TextSelectionPopover.tsx` (ask-only)       | needs full 9-action bar (C6)                                                   | M    |
| Zen pill + ink surface     | Net-new     | —                                           | freeform ink page + zen pill organism                                          | L    |
| Comment card (2t)          | Net-new     | —                                           | margin card + @pond reply + resolve                                            | M    |
| Review list (2t)           | Net-new     | —                                           | change-log "proposed" list surface                                             | M    |
| Breadcrumb                 | Exists      | `Breadcrumb.tsx`                            | add presence + access states + ⌘K affordance                                   | S    |

---

## §03 Concepts + Data Model — _strong backbone, missing governance layer_

**Headline:** Notion-style backbone largely built (pages tree, collections/records/fields, relations, rollups, views, page-kind, ephemeral diffs). The persistence/governance layer is almost entirely net-new: no durable change log, no memory, no threads-as-DB, no agents/skills/tools, no templates, no card-layout config, no "databases" second root, no sharing/roles.

| Concept                        | Status  | Current code                                  | Gap / conflict                                                           | Size |
| ------------------------------ | ------- | --------------------------------------------- | ------------------------------------------------------------------------ | ---- |
| Pages tree                     | Exists  | `0003_unified_pages.sql`, `pages/tree.ts`     | matches "only container" model                                           | S    |
| Areas                          | Partial | `type='area'` rows                            | spec: area = just a page with children; code hard-codes it as a type     | M    |
| Two roots (life + databases)   | Net-new | one root per user (`0006`)                    | no second "databases" root surface (can be a virtual view)               | M    |
| Block model                    | Partial | `pages.blocks` jsonb + `modules/*`            | missing section (group), highlight, sources, `pond—update`, file blocks  | M    |
| Database / table               | Exists  | `props._schema` (`0007`), `promote_table`     | strong; no databases-root surface                                        | S    |
| Record pages + fields          | Exists  | `type='row'` + `_schema`                      | no field-as-block placement (3e); missing money/tag/link/image types     | M    |
| Relations                      | Exists  | `relation` type, `link-records.ts`            | borrow-not-copy matches; chaining not modeled                            | S    |
| Rollups                        | Exists  | `rollup` type, `compute-rollup.ts`            | rollup-over-backlink is the known weak spot                              | S    |
| Views                          | Exists  | `view` module (table/board/cal/gallery/gantt) | chart/big-number are blocks not view-modes                               | S    |
| Card layout                    | Net-new | gallery = titles only                         | no saved reusable card layout; no image field type                       | M    |
| Sources-as-read-only-DB        | Net-new | CSV only (`lib/csv`)                          | no source records/sync/read-only/provenance                              | L    |
| Threads-as-a-database          | Partial | `conversations` table (not a page)            | threads live outside unified model; no context-fill warn/compact         | M    |
| **Change-log persistence**     | Net-new | ephemeral transcript (`resolutions.ts`)       | biggest gap: durable only-grows log, 8 statuses, revert-as-diff          | L    |
| Diff model (statuses/outdated) | Partial | proposal cards + `edits.ts`                   | missing request-changes, outdated detection, durable status, human↔human | M    |
| Memory                         | Net-new | embeddings (retrieval only)                   | auto-recorded sourced notes store, editable/deletable                    | L    |
| Agents / skills / tools        | Net-new | single built-in AI + fixed tools              | no agent/skill records, per-agent tools, triggers                        | L    |
| Templates                      | Net-new | —                                             | 12 premade + user-saved, apply-leaves-no-tie                             | M    |
| Page kind                      | Exists  | `props.kind`                                  | matches; editing kind after create not surfaced                          | S    |
| Multi-pond + sharing/roles     | Net-new | `workspace` = main/sandbox toggle only        | no pond table, members, roles, access, shares                            | L    |

---

## §04 Onboarding + §05 Shell — _auth skeleton only; wizard/settings/templates/dark net-new_

**Headline:** Only a single-field magic-link sign-in + callback exist. The shell itself is mature (Rail/TopBar/DocumentPanel/AITerminal/⌘K, seed-on-first-login) but Press-skinned and hard-seeded, not onboarding-driven. The wizard, cover, settings, 12 templates, and dark theme are net-new.

| Item                   | Status                                 | Current code                                          | Gap / conflict                                                                   | Size |
| ---------------------- | -------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- | ---- |
| Magic-link sign-in     | Partial                                | `sign-in/page.tsx`, `auth/callback/route.ts`          | works, but generic-styled; callback bypasses any onboarding gate                 | S    |
| Name-pond step         | Net-new                                | —                                                     | no naming UI; pond name not surfaced in shell                                    | M    |
| Pick-areas step        | Net-new                                | seeding hard-coded (`Rail.tsx:613`)                   | onboarding must drive which areas seed; area word = **Finances** (resolved #107) | M    |
| Connect-sources step   | Net-new                                | —                                                     | no OAuth/integration layer at all                                                | L    |
| Three-keys teach       | Net-new (screen) / Partial (mechanics) | `CommandPalette`, `SlashMenu`, deletion-undo          | teach screen new; real ⌘Z undo is deletion-only today                            | M    |
| First run              | Partial                                | `DocumentPanel`, `OverviewSurface`                    | areas seeded structurally, but guided first-run flow net-new                     | M    |
| Shell layout           | Exists                                 | `WorkspaceShell/Rail/TopBar/DocumentPanel/AITerminal` | solid; needs Make Noise reskin + pond-switcher header                            | M    |
| Cover                  | Net-new                                | —                                                     | ASCII-pond cover + ink/dark flip                                                 | M    |
| Empty states           | Partial                                | `Rail.tsx:521`, `emptyBlockForType`                   | missing "Pond offers to start it" + empty-collection shape                       | M    |
| 12 premade templates   | Net-new                                | registry has module kinds only                        | full template system (see §03)                                                   | L    |
| Machine surface        | Partial                                | mono in composer                                      | not codified as a token/role                                                     | S    |
| Settings               | Net-new                                | —                                                     | no settings surface; must host sources/templates/ponds/people                    | L    |
| Mobile                 | Partial                                | some responsive bits                                  | onboarding/first-run/keyboard-bar/settings mobile net-new                        | M    |
| Dark theme             | Net-new                                | 6× scattered `dark:`                                  | no theme system; dark is first-class + per-pond themes                           | L    |
| Create additional pond | Net-new                                | —                                                     | no switcher/wizard/multi-pond model                                              | L    |

---

## Storyboards §06.01–06.10 — _half built, half net-new_

**Headline:** The diff engine + AI proposal cards (create_page, promote_table, add_row, define_schema, module_diff, configure_view, link_records) are built and persisted, so the core spine (03, and create-page half of 01/04/05) exists. Two biggest holes: **no template system** (06/08/09) and **no capture→filing pipeline** (02). User-initiated conversions (make-this-a-page from an answer, block-handle "turn into") also don't exist yet.

| Storyboard                        | Status  | Current code                                    | Gap                                                              | Size |
| --------------------------------- | ------- | ----------------------------------------------- | ---------------------------------------------------------------- | ---- |
| 01 ask→answer→thread              | Exists  | `AITerminal.tsx`                                | streaming thread works                                           | S    |
| 01 make-this-a-page (from answer) | Partial | `CreatePageProposalCard`, `create-page.ts`      | no user action to turn a streamed answer into a page             | M    |
| 02 capture (mobile)               | Net-new | —                                               | entire capture screen + offline queue                            | L    |
| 02 filing-as-diffs                | Net-new | —                                               | filing engine + "from your phone" report                         | L    |
| 03 propose→accept (diff card)     | Exists  | `ModuleDiffCard`, `conversation/*`, `accept.ts` | missing request-changes flow, outdated state, show-original      | M    |
| 04 first run                      | Partial | AITerminal empty state                          | draft must arrive as make-page proposal (C2/S7); cover/cards new | M    |
| 05 reference→new page             | Partial | `TextSelectionPopover`, `link-records.ts`       | toolbar ask-only; no "new page from this" / linked quote         | M    |
| 06 blank→recipe via template      | Net-new | slash menu block-only                           | whole template feature                                           | L    |
| 07 add a block mid-page           | Partial | `SlashMenu`, `BlockCanvas.insertBlockAt`        | chart inserts empty; no auto-bind to nearest table (6g)          | M    |
| 08 Pond proposes a template       | Partial | `ModuleDiffCard`, `ai-composition.ts`           | block-diff exists but no template to match / kind label          | M    |
| 09 save as a template             | Net-new | —                                               | ⌘K save-as-template + scope + store                              | L    |
| 10 list→table (user gesture)      | Net-new | block handle drag/delete only                   | no "turn into › table" gesture                                   | M    |
| 10 list→table (into a database)   | Partial | `promote-table.ts`                              | engine exists; only reachable via AI proposal, no user entry     | S    |

---

## Storyboards §06.11–06.20 — _~80% net-new_

**Headline:** Eight of ten have zero backing code (share/invite, change log, comments, zen, freeform canvas, agents/skills, create-a-pond, edit-a-template). Pond today is single-user, no roles, no persisted log, no collaboration, no templates, no drawing surface. Only two have a foothold: nest-from-block (leans on create_page/page-link) and deep research (leans on shipped `web_search`).

| Storyboard                  | Status  | Current code                               | Gap                                                            | Size |
| --------------------------- | ------- | ------------------------------------------ | -------------------------------------------------------------- | ---- |
| 11 nest a page from a block | Partial | `page-link/resolve.ts`, `create-page.ts`   | no handle-driven "move section → child page + leave page-link" | M    |
| 12 edit a template          | Net-new | —                                          | no template store / settings / provenance                      | M    |
| 13 create a pond            | Net-new | `workspace/context.tsx` (main/sandbox)     | multi-pond model + wizard + switcher + settings›ponds          | L    |
| 14 share & invite           | Net-new | —                                          | roles/access/invite/members — entire access substrate          | L    |
| 15 change log               | Net-new | ephemeral transcript                       | persistent growing log + 8 statuses + revert                   | L    |
| 16 working together         | Net-new | —                                          | comments/@mentions/presence/per-block diffs (needs roles+log)  | L    |
| 17 writing & zen            | Net-new | `terminal-focus.ts` (unrelated)            | zen surface + editor role + zen typography                     | M    |
| 18 deep research            | Partial | `web-search.ts`, `models.ts` (`deep` tier) | has sync web search; no run/plan/background/source-cards       | M    |
| 19 freeform page            | Net-new | "freeform **table** block" only            | drawing canvas + pen tools + ink storage/read                  | L    |
| 20 agents & skills          | Net-new | tool-calling infra only                    | user agents + skills + per-agent tools + triggers              | L    |

---

## §07 Edges + §08 Sources + cross-cutting — _~90% net-new_

**Headline:** Deletion is a 6s client-side deferred-commit undo — explicitly NOT the durable trash/`deleted_at`/tombstone model the spec now needs (the code says so). CSV is one-shot client-side; no external source connection/sync/read-only DB, no reminders/notifications/offline queue/frozen-links. The rail already matches 7f (one recursive scrolling tree).

| Item                        | Status              | Current code                     | Gap                                                                | Size |
| --------------------------- | ------------------- | -------------------------------- | ------------------------------------------------------------------ | ---- |
| Trash / tombstones          | Partial (undo only) | `deletion/*`, `UndoToast.tsx`    | 6s undo only; no durable soft-delete/30-day/tombstone block        | L    |
| Deleted-record frozen link  | Net-new             | `RelationValue.tsx` (faded chip) | no struck frozen chip, per-link decide menu, borrowed-value freeze | L    |
| Reminders                   | Net-new             | mock only                        | date-field reminder, floating note, snooze, bell, burnt-orange     | L    |
| Session undo (unified ⌘Z)   | Partial             | `deferred-commit.ts`             | deletion-only; no history spanning text/blocks/pages/diffs         | L    |
| Revert from change log      | Net-new             | —                                | revert-as-new-diff                                                 | M    |
| Rail as one scrolling tree  | Exists              | `Rail.tsx`, `rail/tree.ts`       | matches; verify K2 arrow keys + bell slot                          | S    |
| Mobile insert (＋ sheet)    | Net-new             | slash menu exists                | keyboard-bar ＋ sheet with tabs, 44px rows                         | M    |
| Fixtures ledger             | Net-new             | —                                | design-time tooling; likely Storybook not app                      | S    |
| Connect a Google Sheet      | Net-new             | `csv/parse-csv.ts`               | OAuth + tab picker + preview → connect                             | L    |
| Source sync                 | Net-new             | —                                | scheduler + metadata + "sync now"                                  | L    |
| Source-break handling       | Net-new             | —                                | keep-last-copy + reconnect/disconnect                              | M    |
| Read-only external database | Net-new             | `RelationValue` read-only mode   | no source-backed read-only DB type                                 | M    |
| Offline queue               | Net-new             | —                                | queue + reconnect sync + "needs a connection"                      | L    |
| Notifications policy        | Net-new             | `notify` = transient toast       | only invite email + reminders; rest → proposed view                | M    |
| Shortcuts (unified keymap)  | Partial             | scattered handlers               | no single enforced keymap; K1–K4 unresolved                        | M    |

---

## Open reconciliations (spec vs current code)

These are contradictions to resolve before/at build time, not pure gaps:

1. ~~**Area names:** spec onboarding says Money; current code seeds Finances.~~ **RESOLVED 2026-09-29 (#107): keep `Finances`** — adopt the shipped code word (Option B); onboarding pick-areas seeds `Finances`, and any spec/onboarding copy naming "Money" defers to this. The `.dc.html` mockups are illustrative here; this decision wins per AGENTS.md.
2. **Area as a type vs a page:** spec says an area is just a page with children (a glyph/colour convention); code hard-codes `type='area'`. Reconcile toward the spec model.
3. **Undo scope:** spec C1 = session undo then revert-from-log; some current copy/code implies "until next edit" and undo is deletion-only. Rebuild toward C1.
4. **Diff durability:** spec = a growing change-log DB; code = ephemeral transcript envelope (ticket-19/24). Migrating to durable diffs is the pivotal architecture change.
5. **Views vs blocks:** spec lists chart + big-number as _view modes_; code models them as separate blocks. Decide whether to unify.
6. **`workspace` column:** currently a main/sandbox dev toggle, not a pond. The multi-pond model must not overload it.

---

## Recommended build order (dependency-aware)

**Phase 0 — Rules & foundation (do first, unblocks everything)**

1. Fold `PROJECT_RULES.md` + AUDIT "Decided, 26 sep" into `AGENTS.md`/`CLAUDE.md`.
2. **Make Noise token + font layer** (§01) — tokens, 3 PP fonts, signal/area roles, glyph-mask icons, remove lucide. Motion is already done.

**Phase 1 — Reskin the built spine to Make Noise** (§02 + shell) 3. Reskin core components (Rail, composer, palette, / menu, breadcrumb, proposal/diff cards, blocks, charts) family by family onto the new tokens. 4. Reskin the shell (WorkspaceShell/DocumentPanel/OverviewSurface) + pond-name/switcher header.

**Phase 2 — Core journeys (storyboards 01–05, 07, 10)** — mostly polish/complete on existing engine 5. make-this-a-page from an answer (01); request-changes + outdated (03); reference→new page toolbar (05); block auto-bind (07); user-gesture list→table (10).

**Phase 3 — Pivotal architecture: durable change log + diff model** (§03, 6o/6c) 6. Persisted only-grows change log, 8 statuses, revert-as-diff, session undo→revert. Unblocks working-together, agents-as-proposers.

**Phase 4 — Template system** (§03/§05, 6f/6h/6i/6l) — 12 premade + save/edit/apply.

**Phase 5 — Onboarding wizard + settings + dark/themes** (§04/§05) — wizard drives seeding; settings-as-a-page; 8 themes.

**Phase 6 — External sources** (§08) — Google Sheets connect, sync, read-only DB, break handling. Feeds onboarding step 4.

**Phase 7 — Collaboration & multi-pond** (6m/6n/6p) — pond table, roles, sharing, comments, presence.

**Phase 8 — Advanced surfaces** — deep-research runs (18), zen (17), freeform ink (19), agents/skills (20), reminders/offline/notifications (07/G).

_Each storyboard slice: grill → spec → build → verify via the `ship-issue` orchestrator, resolving the relevant AUDIT p2/p3 items inside the slice._
