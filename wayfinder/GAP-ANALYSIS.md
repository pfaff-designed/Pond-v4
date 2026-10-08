# Pond-v4 ⇄ design_handoff_pond — Gap Analysis

_Generated 2026-09-26. Maps every section of `wayfinder/design_handoff_pond/` against the current Pond-v4 codebase._

> **Corrected 2026-09-30. Read this first.**
>
> This doc is **orientation, not truth about what exists** (`AGENTS.md`). It was wrong on 9 surfaces
> when `BUILD-VS-REBUILD-EVAL.md` re-checked every row against real code, and **every error was
> pessimistic about the existing code** — things labelled Net-new or Partial were already done.
> Those 9 are corrected below and marked **✅ shipped**, as is everything merged since, with the
> issue number that landed it.
>
> It will go stale again. **Shipped state lives in `git log` and Done Jira tickets** — if a row matters
> to a decision, verify it against the code before believing it.

**Decisions this doc assumes** (from the user, 2026-09-26):

1. The handoff's **Make Noise** design language **supersedes** the shipped "Press / Clearing" aesthetic. It is now the single source of visual truth.
2. First working step is this gap matrix, before any building.

**Status key:** `Exists` = built & broadly matches intent · `Partial` = built but incomplete or conflicts with the Make Noise spec · `Net-new` = no backing code. **Size** = rough build effort (S/M/L).

---

## Executive read

Pond-v4 is **not greenfield and not close to done** against this spec. Two truths:

- **The functional backbone is real.** The unified `pages` tree, typed collections/records/fields, relations, rollups, views, backlinks, page-kind, the AI composer with streaming threads, and the propose→accept proposal-card engine all exist and largely match the concepts. The core "Pond proposes, you accept" spine is built.
- **Everything else is either a reskin or a net-new subsystem.**

Two cross-cutting forces dominated the work. **Both have since moved** — this paragraph is kept for
the record, with what actually happened:

1. ~~**A total visual reskin.**~~ **✅ the token layer shipped (#85–#92).** Every component sat on the
   Press/Clearing token layer (Inter/Fraunces/Instrument Serif, `press-*` colours). The paper·ink·
   signal·area palette, the three licensed PP faces, the glyph-mask icons and the `--raw-*`→`--color-*`
   contract are all in `globals.css` / `layout.tsx` now, and lucide is retired. What remains is
   per-component adoption, not a reskin of the foundation.
2. **The governance & persistence layer was missing. Half of it now exists.** **✅ the durable,
   only-grows change log shipped (#102/#103, migrations 0011–0014)** — eight statuses constrained in
   the DB, with revert-as-a-new-diff. Still net-new: the **memory store** (#105),
   **threads-as-a-database** (#106), **multi-pond + roles/sharing** (#120, scope undecided),
   the **template system** (#117), and **external source connections** (#119).

**Roughly:** design system + component library ≈ _reskin-heavy_ (structure mostly there). Storyboards 01–10 ≈ _half built, half net-new_. Storyboards 11–20 ≈ _~80% net-new_. Edges + Sources ≈ _~90% net-new_.

### Load-bearing foundations (block the most downstream work)

| Foundation                                      | Why it blocks                                                                               | Size |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- | ---- |
| ~~**Make Noise token + font layer** (§01)~~     | **✅ shipped #85–#92.** Tokens, 3 PP faces, signal/area roles, glyph masks, lucide retired. | M    |
| ~~**Durable change-log / diff store**~~ (§03)   | **✅ shipped #102/#103** (0011–0014, the eight statuses). The _views_ over it are #147.     | L    |
| **Multi-pond + roles data model** (§03, 6m, 6n) | Blocks all of sharing (6n/6p), per-pond agents/skills/memory/templates, the pond switcher.  | L    |
| **Template system** (§03, 5, 6f/6h/6i/6l)       | Blocks 4 storyboards + shell empty states + slash-menu template group.                      | M–L  |
| **External source connection layer** (§03, §08) | Blocks onboarding step 4, sources, read-only external DBs, sync.                            | L    |

---

## §01 Design System — _reskin, not rebuild_

**Headline — rewritten 2026-09-30. This section is essentially done.** Every gap this section
originally named except the eight themes has shipped (#85–#92, #139). The raw hexes, the three PP
faces, the signal and area roles, the glyph-mask icon system, the `--raw-*`→`--color-*` contract, the
MN radius and spacing scales and the voice tokens are all in the code; the motion ladder already
matched MN 1:1 and still does. **The original version of this section was the single largest source
of pessimism in the doc** — it labelled the palette, ink tiers, signals, area colours and type as
Net-new or Partial when the eval found them done. What is genuinely left: the other 6 themes, and
the _adoption_ of the type/spacing scales at ~190 off-scale call sites, which is blocked on a ruling
(`OPEN-QUESTIONS.md` §2), not on work.

| Item                                | Status                  | Current code                                       | Gap / conflict                                                                                                         | Size |
| ----------------------------------- | ----------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---- |
| Palette raw values                  | **✅ Exists** (#92)     | `globals.css:266-277` (`--raw-paper #faf9ef`)      | ~~wrong hexes~~ — MN `colors.css` adopted wholesale. _Was labelled Partial; eval overturned it._                       | M    |
| Ink text tiers                      | **✅ Exists** (#92)     | `--color-ink-*` (3 tiers)                          | ~~4 tiers on the wrong base~~ — exactly 3 (100/80/68). _Was Partial; overturned._                                      | S    |
| Signal colours (one job each)       | **✅ Exists** (#92)     | `--raw-burnt-orange/wheat/red`                     | ~~no roles in code~~ — all three carry one job each. _Was Net-new; overturned._                                        | M    |
| Area colours (marks only)           | **✅ Exists** (#91/#92) | `--raw-sage/mist/navy`, `rail/area-glyph.ts`       | ~~no area roles~~ — marks only, navy→mist on dark. _Was Net-new; overturned._                                          | S    |
| Type — families & faces             | **✅ Exists** (#88)     | `layout.tsx:12-40` (3 PP faces, `next/font/local`) | ~~4 Google fonts~~ — self-hosted PP set. _Was Net-new; overturned._                                                    | M    |
| Serif weight discipline (never 400) | **✅ Exists** (#88)     | serif ships only 200/800 (+italics)                | ~~Fraunces is 400-capable~~ — 400 is not shipped, so it cannot be used. _Was Net-new; overturned._                     | S    |
| Type — voice tokens + UI scale      | Partial (#139)          | `--voice-*` tokens, 8-step ladder, `text-mn-*`     | tokens exist; **adoption** does not — `text-xs` (113 sites) + `text-sm` (77) are off-scale, blocked on a ruling (OQ§2) | M    |
| Card radius & shadow                | **✅ Exists** (#139)    | `--radius-mn-card/inner/row/chrome/hair/pill`      | real radius ladder, not derived from one base                                                                          | S    |
| Floating glass                      | **✅ Exists** (#92)     | `globals.css:625 .mn-glass`                        | renamed off `press-*`; MN dark tint in place                                                                           | S    |
| Spacing scales                      | Partial (#90)           | `--spacing-mn-*` + `--spacing-mnl-*`               | both scales defined; **zero clean adoption candidates** — needs the rem-vs-px ruling (OQ§2)                            | S    |
| Motion                              | **✅ Exists**           | the 90/150/280/460/560 ladder + `--ease-*`         | exact MN match; inventory in `_archive/ticket-41-motion-system.md`                                                     | S    |
| Icons — glyph mask                  | **✅ Exists** (#91)     | `rail/glyph-library.ts`, `area-glyph.ts`           | ~~net-new~~ — CSS-mask-over-`currentColor` system shipped. _Was Net-new; overturned._                                  | M    |
| Icons — functional SVG              | **✅ Exists** (#92)     | inline SVG; **zero** lucide imports                | lucide retired; test guards assert its absence                                                                         | S    |
| Eight themes                        | Partial                 | light + a complete MN-correct `.dark` role layer   | **the one real §01 gap left.** 2 of 8; the other 6 presets + per-pond themes are net-new                               | L    |
| Token architecture / naming         | **✅ Exists** (#92)     | `--raw-*` → `--color-*` + `@theme inline`          | ~~bespoke `--press-*`~~ — re-based on the MN contract across ~300 refs. _Was Partial._                                 | M    |

---

## §02 Component Library — _~70% structurally present, 100% needs reskin_

**Headline:** Family shapes mostly exist (Rail, composer, breadcrumb, ⌘K palette, / menu, source list, selection popover, 5-of-13 charts, most block kinds). Every one rides the Press token layer → **all ~14 families inherit an L-sized reskin**. True net-new: the 12 templates, zen pill + ink surface, comment card, review-list/change-log surface.

| Pond component             | Status      | Current code                                | Gap / conflict                                                                                                                                          | Size |
| -------------------------- | ----------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| PondAtom                   | Partial     | scattered `atoms/*`                         | no unified 24-kind × 9-state atom; consolidate + reskin                                                                                                 | L    |
| PondControl                | Partial     | `ui/button.tsx`, `ProposalActions`          | no unified variants/states; extract field/toggle/checkbox. **No `controls/` layer exists** and the layer law does not name one (OQ§3)                   | M    |
| PondMolecule               | Partial     | `TreeRow`, `OverviewCard`, `RelationValue`… | no named family; missing provenance/notice/reminder/entry/task-card                                                                                     | L    |
| PondBlock                  | Partial     | `modules/*` via `registry.ts`               | audit gallery/log/properties kinds + `deleted`/`broken` states                                                                                          | M    |
| PondChart                  | Partial     | `charts/*` (line/area/bar/ring/heatmap)     | 5 of 13 kinds; charts are now **view modes** of a database, not blocks (#111). The 8 missing kinds + MN retint = **#94**                                | L    |
| PondPicker — / menu        | Exists      | `SlashMenu.tsx`                             | add templates group; C21 skills-vs-blocks; reskin                                                                                                       | M    |
| PondPicker — source picker | Partial     | `SourceList.tsx` + proposal cards           | no unified 3-step (source→type→new) caret picker                                                                                                        | M    |
| PondPicker — ⌘K palette    | Exists      | `CommandPalette.tsx` + `TopBar.tsx`         | missing scoped/records/`>`-actions/no-dead-end empty                                                                                                    | M    |
| PondRail                   | **Partial** | `Rail.tsx` + `TreeRow`                      | _eval correction: was "Exists."_ Area marks shipped (#91/#134); still missing pond-name/switcher, presence/access/⌘K props, databases section — **#96** | M    |
| PondComposer               | Exists      | `AITerminal.tsx` + `TerminalDrawer`         | best-covered; add research toggle, @-mention chip; reskin                                                                                               | M    |
| PondTemplate (12 layouts)  | **Net-new** | —                                           | entire layer: 12 layouts + empty/filled + save/edit/apply                                                                                               | L    |
| Selection bar (2t)         | Partial     | `TextSelectionPopover.tsx` (ask-only)       | needs full 9-action bar (C6)                                                                                                                            | M    |
| Zen pill + ink surface     | Net-new     | —                                           | freeform ink page + zen pill organism                                                                                                                   | L    |
| Comment card (2t)          | Net-new     | —                                           | margin card + @pond reply + resolve                                                                                                                     | M    |
| Review list (2t)           | Net-new     | —                                           | change-log "proposed" list surface                                                                                                                      | M    |
| Breadcrumb                 | **Partial** | `Breadcrumb.tsx`                            | _eval correction: was "Exists."_ Needs presence + access states + ⌘K affordance — **#96**                                                               | S    |

---

## §03 Concepts + Data Model — _strong backbone, missing governance layer_

**Headline:** Notion-style backbone largely built (pages tree, collections/records/fields, relations, rollups, views, page-kind, ephemeral diffs). The persistence/governance layer is almost entirely net-new: no durable change log, no memory, no threads-as-DB, no agents/skills/tools, no templates, no card-layout config, no "databases" second root, no sharing/roles.

| Concept                        | Status                    | Current code                                  | Gap / conflict                                                                                                                                                                                                                                                         | Size |
| ------------------------------ | ------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Pages tree                     | Exists                    | `0003_unified_pages.sql`, `pages/tree.ts`     | matches "only container" model                                                                                                                                                                                                                                         | S    |
| Areas                          | **✅ Exists** (#108)      | page with children, `0010_drop_area_type.sql` | ~~code hard-codes `type='area'`~~ — the hard type is gone; an area is a page with children. Side effect: `isContent = !hasChildren`, so an empty intended-as-area page counts as content (OQ§5)                                                                        | M    |
| Two roots (life + databases)   | Net-new                   | one root per user (`0006`)                    | no second "databases" root surface (can be a virtual view)                                                                                                                                                                                                             | M    |
| Block model                    | Partial                   | `pages.blocks` jsonb + `modules/*`            | missing section (group), highlight, sources, `pond—update`, file blocks                                                                                                                                                                                                | M    |
| Database / table               | Exists                    | `props._schema` (`0007`), `promote_table`     | strong; no databases-root surface                                                                                                                                                                                                                                      | S    |
| Record pages + fields          | **Partial**               | `type='row'` + `properties/schema.ts`         | _eval correction: was "Exists."_ **8** property types, not 9 — missing money/tag/link/image, and no field-as-block placement (3e)                                                                                                                                      | M    |
| Relations                      | Exists                    | `relation` type, `link-records.ts`            | borrow-not-copy matches; chaining not modeled                                                                                                                                                                                                                          | S    |
| Rollups                        | Exists                    | `rollup` type, `compute-rollup.ts`            | rollup-over-backlink is the known weak spot                                                                                                                                                                                                                            | S    |
| Views                          | **✅ Exists** (#111)      | `view` module + chart/figure view modes       | ~~chart/big-number are blocks~~ — they are view modes now. Cost: a freeform page can no longer show a single figure at all (OQ§5)                                                                                                                                      | S    |
| Card layout                    | Net-new                   | gallery = titles only                         | no saved reusable card layout; no image field type                                                                                                                                                                                                                     | M    |
| Sources-as-read-only-DB        | Net-new                   | CSV only (`lib/csv`)                          | no source records/sync/read-only/provenance                                                                                                                                                                                                                            | L    |
| Threads-as-a-database          | Partial                   | `conversations` table (not a page)            | threads live outside the unified model; no context-fill warn/compact — **#106**. The eval flags this as the one _structurally incompatible_ persistence shape                                                                                                          | M    |
| **Change-log persistence**     | **✅ Exists** (#102/#103) | `change_log` (0011–0014) + `accept.ts`        | ~~biggest gap~~ — durable only-grows log, **the eight statuses constrained in the DB**, append-only transition audit with a trigger floor, revert-as-a-new-diff. Downstream wiring = **#146**; the views over it = **#147**                                            | L    |
| Diff model (statuses/outdated) | Partial                   | proposal cards + `edits.ts` + `change_log`    | _eval correction: the card was labelled "Exists" at §06.03 but is 3-status._ The **store** now holds all 8; the **UI** surfaces `accepted`/`rejected` only (`resolutions.ts:47`). Missing request-changes + outdated + show-original = **#98**; human↔human needs #120 | M    |
| Memory                         | Net-new                   | embeddings (retrieval only)                   | sourced notes store, written on request (8 oct), editable/deletable                                                                                                                                                                                                    | L    |
| Agents / skills / tools        | Net-new                   | single built-in AI + fixed tools              | no agent/skill records, per-agent tools, triggers                                                                                                                                                                                                                      | L    |
| Templates                      | Net-new                   | —                                             | 12 premade + user-saved, apply-leaves-no-tie                                                                                                                                                                                                                           | M    |
| Page kind                      | **Partial**               | `props.kind`, `pages/mark.ts`                 | _eval correction: was "Exists."_ `kind` is write-only-at-create; #134 shipped the per-page **mark** picker, not kind editing                                                                                                                                           | S    |
| Multi-pond + sharing/roles     | Net-new                   | `workspace` = main/sandbox toggle only        | no pond table, members, roles, access, shares                                                                                                                                                                                                                          | L    |

---

## §04 Onboarding + §05 Shell — _auth skeleton only; wizard/settings/templates/dark net-new_

**Headline:** Only a single-field magic-link sign-in + callback exist. The shell itself is mature (Rail/TopBar/DocumentPanel/AITerminal/⌘K, seed-on-first-login) but Press-skinned and hard-seeded, not onboarding-driven. The wizard, cover, settings, 12 templates, and dark theme are net-new.

| Item                   | Status                                 | Current code                                          | Gap / conflict                                                                                                                                                              | Size |
| ---------------------- | -------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Magic-link sign-in     | Partial                                | `sign-in/page.tsx`, `auth/callback/route.ts`          | works, but generic-styled; callback bypasses any onboarding gate                                                                                                            | S    |
| Name-pond step         | Net-new                                | —                                                     | no naming UI; pond name not surfaced in shell                                                                                                                               | M    |
| Pick-areas step        | Net-new                                | seeding hard-coded (`Rail.tsx:613`)                   | onboarding must drive which areas seed; area word = **Finances** (resolved #107)                                                                                            | M    |
| Connect-sources step   | Net-new                                | —                                                     | no OAuth/integration layer at all                                                                                                                                           | L    |
| Three-keys teach       | Net-new (screen) / Partial (mechanics) | `CommandPalette`, `SlashMenu`, deletion-undo          | _eval note: do not read this row as "the keys are missing."_ ⌘K and `/` mechanics ship and work; only the **teach screen** is net-new. ⌘Z is still deletion-only — **#104** | M    |
| First run              | Partial                                | `DocumentPanel`, `OverviewSurface`                    | areas seeded structurally, but guided first-run flow net-new                                                                                                                | M    |
| Shell layout           | Exists                                 | `WorkspaceShell/Rail/TopBar/DocumentPanel/AITerminal` | solid; needs the MN reskin + pond-name/switcher header — **#96**, no longer gated (#108 landed)                                                                             | M    |
| Cover                  | Net-new                                | —                                                     | ASCII-pond cover + ink/dark flip                                                                                                                                            | M    |
| Empty states           | Partial                                | `Rail.tsx:521`, `emptyBlockForType`                   | missing "Pond offers to start it" + empty-collection shape                                                                                                                  | M    |
| 12 premade templates   | Net-new                                | registry has module kinds only                        | full template system (see §03)                                                                                                                                              | L    |
| Machine surface        | Partial                                | mono in composer                                      | not codified as a token/role                                                                                                                                                | S    |
| Settings               | Net-new                                | —                                                     | no settings surface; must host sources/templates/ponds/people                                                                                                               | L    |
| Mobile                 | Partial                                | some responsive bits                                  | onboarding/first-run/keyboard-bar/settings mobile net-new                                                                                                                   | M    |
| Dark theme             | **✅ Exists** (role layer)             | a complete MN-correct `.dark` role-reassignment layer | ~~6× scattered `dark:`~~ — _eval correction: was "Net-new."_ Dark is a first-class role layer. Still net-new: the other 6 presets + per-pond themes                         | L    |
| Create additional pond | Net-new                                | —                                                     | no switcher/wizard/multi-pond model                                                                                                                                         | L    |

---

## Storyboards §06.01–06.10 — _half built, half net-new_

**Headline:** The diff engine + AI proposal cards (create_page, promote_table, add_row, define_schema, module_diff, configure_view, link_records) are built and persisted, so the core spine (03, and create-page half of 01/04/05) exists. Two biggest holes: **no template system** (06/08/09) and **no capture→filing pipeline** (02). User-initiated conversions (make-this-a-page from an answer, block-handle "turn into") also don't exist yet.

| Storyboard                        | Status      | Current code                                    | Gap                                                                                                                                      | Size |
| --------------------------------- | ----------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 01 ask→answer→thread              | Exists      | `AITerminal.tsx`                                | streaming thread works                                                                                                                   | S    |
| 01 make-this-a-page (from answer) | Partial     | `CreatePageProposalCard`, `create-page.ts`      | no user action to turn a streamed answer into a page — **#97**                                                                           | M    |
| 02 capture (mobile)               | Net-new     | —                                               | entire capture screen + offline queue                                                                                                    | L    |
| 02 filing-as-diffs                | Net-new     | —                                               | filing engine + "from your phone" report                                                                                                 | L    |
| 03 propose→accept (diff card)     | **Partial** | `ModuleDiffCard`, `conversation/*`, `accept.ts` | _eval correction: was "Exists."_ The card is **3-status against an 8-status spec**. Request-changes + outdated + show-original = **#98** | M    |
| 04 first run                      | Partial     | AITerminal empty state                          | draft must arrive as make-page proposal (C2/S7); cover/cards new                                                                         | M    |
| 05 reference→new page             | Partial     | `TextSelectionPopover`, `link-records.ts`       | toolbar ask-only; no "new page from this" / linked quote — **#99**                                                                       | M    |
| 06 blank→recipe via template      | Net-new     | slash menu block-only                           | whole template feature                                                                                                                   | L    |
| 07 add a block mid-page           | Partial     | `SlashMenu`, `BlockCanvas.insertBlockAt`        | chart inserts empty; no auto-bind to nearest table (6g) — **#100**                                                                       | M    |
| 08 Pond proposes a template       | Partial     | `ModuleDiffCard`, `ai-composition.ts`           | block-diff exists but no template to match / kind label                                                                                  | M    |
| 09 save as a template             | Net-new     | —                                               | ⌘K save-as-template + scope + store                                                                                                      | L    |
| 10 list→table (user gesture)      | Net-new     | block handle drag/delete only                   | no "turn into › table" gesture — **#101**                                                                                                | M    |
| 10 list→table (into a database)   | Partial     | `promote-table.ts`                              | engine exists; only reachable via AI proposal, no user entry                                                                             | S    |

---

## Storyboards §06.11–06.20 — _~80% net-new_

**Headline:** Eight of ten have zero backing code (share/invite, change log, comments, zen, freeform canvas, agents/skills, create-a-pond, edit-a-template). Pond today is single-user, no roles, no persisted log, no collaboration, no templates, no drawing surface. Only two have a foothold: nest-from-block (leans on create_page/page-link) and deep research (leans on shipped `web_search`).

| Storyboard                  | Status      | Current code                               | Gap                                                                                                                                 | Size |
| --------------------------- | ----------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 11 nest a page from a block | Partial     | `page-link/resolve.ts`, `create-page.ts`   | no handle-driven "move section → child page + leave page-link"                                                                      | M    |
| 12 edit a template          | Net-new     | —                                          | no template store / settings / provenance                                                                                           | M    |
| 13 create a pond            | Net-new     | `workspace/context.tsx` (main/sandbox)     | multi-pond model + wizard + switcher + settings›ponds                                                                               | L    |
| 14 share & invite           | Net-new     | —                                          | roles/access/invite/members — entire access substrate                                                                               | L    |
| 15 change log               | **Partial** | `change_log` (0011–0014), `accept.ts`      | **✅ the store shipped (#102/#103)** — growing log, 8 statuses, revert-as-diff. Net-new: the log **views** + record page — **#147** | L    |
| 16 working together         | Net-new     | —                                          | comments/@mentions/presence/per-block diffs (needs roles+log)                                                                       | L    |
| 17 writing & zen            | Net-new     | `terminal-focus.ts` (unrelated)            | zen surface + editor role + zen typography                                                                                          | M    |
| 18 deep research            | Partial     | `web-search.ts`, `models.ts` (`deep` tier) | has sync web search; no run/plan/background/source-cards                                                                            | M    |
| 19 freeform page            | Net-new     | "freeform **table** block" only            | drawing canvas + pen tools + ink storage/read                                                                                       | L    |
| 20 agents & skills          | Net-new     | tool-calling infra only                    | user agents + skills + per-agent tools + triggers                                                                                   | L    |

---

## §07 Edges + §08 Sources + cross-cutting — _~90% net-new_

**Headline:** Deletion is a 6s client-side deferred-commit undo — explicitly NOT the durable trash/`deleted_at`/tombstone model the spec now needs (the code says so). CSV is one-shot client-side; no external source connection/sync/read-only DB, no reminders/notifications/offline queue/frozen-links. The rail already matches 7f (one recursive scrolling tree).

| Item                        | Status               | Current code                     | Gap                                                                                                                                 | Size |
| --------------------------- | -------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Trash / tombstones          | Partial (undo only)  | `deletion/*`, `UndoToast.tsx`    | 6s undo only. **No `deleted_at` column exists in any of the 15 migrations** — durable soft-delete/30-day/tombstone is still net-new | L    |
| Deleted-record frozen link  | Net-new              | `RelationValue.tsx` (faded chip) | no struck frozen chip, per-link decide menu, borrowed-value freeze                                                                  | L    |
| Reminders                   | Net-new              | mock only                        | date-field reminder, floating note, snooze, bell, burnt-orange                                                                      | L    |
| Session undo (unified ⌘Z)   | Partial              | `deferred-commit.ts`             | deletion-only; no history spanning text/blocks/pages/diffs — **#104**, now unblocked by the change-log                              | L    |
| Revert from change log      | **✅ Exists** (#103) | `accept.ts`, `0013`/`0014`       | revert lands as a **new proposed diff**, guarded at the DB level                                                                    | M    |
| Rail as one scrolling tree  | Exists               | `Rail.tsx`, `rail/tree.ts`       | matches; verify K2 arrow keys + bell slot                                                                                           | S    |
| Mobile insert (＋ sheet)    | Net-new              | slash menu exists                | keyboard-bar ＋ sheet with tabs, 44px rows                                                                                          | M    |
| Fixtures ledger             | Net-new              | —                                | design-time tooling; likely Storybook not app                                                                                       | S    |
| Connect a Google Sheet      | Net-new              | `csv/parse-csv.ts`               | OAuth + tab picker + preview → connect                                                                                              | L    |
| Source sync                 | Net-new              | —                                | scheduler + metadata + "sync now"                                                                                                   | L    |
| Source-break handling       | Net-new              | —                                | keep-last-copy + reconnect/disconnect                                                                                               | M    |
| Read-only external database | Net-new              | `RelationValue` read-only mode   | no source-backed read-only DB type                                                                                                  | M    |
| Offline queue               | Net-new              | —                                | queue + reconnect sync + "needs a connection"                                                                                       | L    |
| Notifications policy        | Net-new              | `notify` = transient toast       | only invite email + reminders; rest → proposed view                                                                                 | M    |
| Shortcuts (unified keymap)  | Partial              | scattered handlers               | no single enforced keymap; K1–K4 unresolved                                                                                         | M    |

---

## Open reconciliations (spec vs current code)

These are contradictions to resolve before/at build time, not pure gaps:

1. ~~**Area names:** spec onboarding says Money; current code seeds Finances.~~ **RESOLVED 2026-09-29 (#107): keep `Finances`** — adopt the shipped code word (Option B); onboarding pick-areas seeds `Finances`, and any spec/onboarding copy naming "Money" defers to this. The `.dc.html` mockups are illustrative here; this decision wins per AGENTS.md.
2. ~~**Area as a type vs a page.**~~ **RESOLVED + SHIPPED 2026-09-30 (#108, migration `0010`):** the hard `type='area'` is gone; an area is a page with children. Watch the side effect — `isContent = !hasChildren` (OQ§5).
3. **Undo scope:** spec C1 = session undo then revert-from-log; current undo is deletion-only. **Specced in #109, built as #104** (now unblocked — the change-log landed).
4. ~~**Diff durability.**~~ **RESOLVED + SHIPPED (#102/#103, migrations `0011`–`0014`):** the durable only-grows change-log with the eight statuses and revert-as-a-new-diff. Spec lived in #110. The pivotal architecture change is **banked.** Downstream wiring #146, views #147.
5. ~~**Views vs blocks.**~~ **RESOLVED + SHIPPED (#111):** chart + big-number are view modes of a database. Accepted cost: a freeform page can no longer show a single figure (OQ§5).
6. **`workspace` column:** currently a main/sandbox dev toggle, not a pond. **#112** — and it is really the Phase 7 scope question (`OPEN-QUESTIONS.md` §1), not an implementation detail.

---

## Recommended build order (dependency-aware)

_Phases below are the original plan, annotated 2026-09-30 with where the queue actually stands. The
dependency edges still hold; the completion marks are the part that was wrong._

**~~Phase 0 — Rules & foundation~~ ✅ COMPLETE** (epic #113)

1. ~~Fold `PROJECT_RULES.md` + AUDIT "Decided, 26 sep" into `AGENTS.md`.~~ Done.
2. ~~**Make Noise token + font layer** (§01).~~ Done — #85–#92 plus the #139 adoption pass. Motion
   already matched. **Remaining §01 work is the other 6 themes and the scale rulings in OQ§2.**

**Phase 1 — Reskin the built spine** (epic #114) — **2 issues left, both ungated.**
**#96** shell reskin + pond-name/switcher (no longer gated — #108 landed) → then **#94** the 8
missing chart kinds + MN retint. Everything else in this phase shipped (#91, #128, #134, #139).

**Phase 2 — Core journeys** (epic #115) — **5 issues, all ungated, files disjoint → parallelisable.**
**#97** make-this-a-page · **#98** request-changes + outdated + show-original · **#99** reference→new
page · **#100** block auto-bind · **#101** list→table gesture.

**~~Phase 3 — Pivotal architecture: durable change log~~ ✅ the STORE is COMPLETE** (epic #116).
#102 (log) and #103 (revert-from-log) shipped; migrations 0011–0014 are the eight statuses with an
append-only transition audit. **Left in phase 3:** #146 downstream wiring · #147 log views + record
page · #104 unified session undo · #105 memory store · #106 threads-as-a-database.

**Phase 4 — Template system** (§03/§05, 6f/6h/6i/6l, epic #117) — 12 premade + save/edit/apply. **Zero issues filed.**

**Phase 5 — Onboarding wizard + settings + dark/themes** (§04/§05, epic #118) — wizard drives seeding; settings-as-a-page. **The dark role layer already exists**, so this is the other 6 presets plus per-pond themes, not dark from scratch. **Zero issues filed.**

**Phase 6 — External sources** (§08, epic #119) — Google Sheets connect, sync, read-only DB, break handling. Feeds onboarding step 4. **Zero issues filed; in scope undecided — `OPEN-QUESTIONS.md` §1.**

**Phase 7 — Collaboration & multi-pond** (6m/6n/6p, epic #120) — pond table, roles, sharing, comments, presence. **Zero issues filed; in scope undecided — `OPEN-QUESTIONS.md` §1.** If the AI is the collaborator rather than other people, this phase closes and #112 resolves with it.

**Phase 8 — Advanced surfaces** (epic #121) — deep-research runs (18), zen (17), freeform ink (19), agents/skills (20), reminders/offline/notifications (07/G). **Zero issues filed.**

_Each storyboard slice: grill → spec → build → verify via the `ship-issue` orchestrator, resolving the relevant AUDIT p2/p3 items inside the slice._
