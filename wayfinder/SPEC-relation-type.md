# SPEC — `relation` property type, end-to-end (forward-only)

**Issue:** #20 (DB Primitive 4/4), **first half only.** Rollups, reverse-lookup/backlinks, AI
serialize-context enrichment, and the linked-view unstub are **explicitly deferred to a separate
re-grill + brief** (per `wayfinder/BUILD-BRIEF-database-primitive.md` §#20 and the #20 issue comment).
**Grilled 2026-09-05** — all decisions below user-confirmed.

## Goal

Make the `relation` property type — today _defined_ but inert — usable end-to-end: a relation
property can name a target collection, hold links to pages in it, be edited through a manual
picker, and render its links as page-title chips. One-way (forward) only; the reverse side stays a
future query.

## Settled by the earlier data-model grill (2026-09-01 — do NOT re-open)

- Relation value = **array of page-ids**, `string[]`; canonical empty `[]`.
- **One-way**; the reverse side ("pages that link to me") is a _query_, not a synced field.
- Leniency (#17/#18 decision 9): missing → empty; unknown/off-target tolerated; orphaned values
  preserved, never hard-rejected.

## Decisions (this grill)

1. **Target is optional.** Add `target?: string` (a collection page-id) to the relation
   `PropertyDef`. Set → scopes candidate rows + enables self-relation (target = own collection);
   unset → "link any page." Membership is lenient — a stored id outside the target is tolerated.
2. **Property authoring** rides existing `define_schema`: the model names the target by **collection
   NAME**, resolved name→id **on accept** (mirroring `configure_view`). An unresolvable name leaves
   the relation **untargeted** (lenient) — never a hard fail.
3. **Value authoring = a manual scoped picker.** Clicking a relation value opens a title-search
   dropdown over the target collection's rows (`getCollectionRows`); selecting adds a chip, the
   chip `×` removes; every change writes **optimistically** through the existing `setValue` →
   `setProperty` array path. Unset target → a global title search (`matchPages`/`listPages`).
   **AI link-authoring is deferred** (no `link_rows`/`set_relation` tool this slice).
4. **`single` cap = UI-enforced, lenient read.** When `single` is true the picker replaces-on-select
   (radio behavior); read never clamps — >1 stored id renders all chips.
5. **Chip titles = client-side resolution.** A hook resolves id→title: reuse the shared
   `['rows', targetId]` react-query cache when targeted (the same cache the picker loads), else
   per-id `['page', id]` / `getPage`. An id that resolves to nothing renders as a **faded "missing"
   chip**. AI serialize-context enrichment (showing Pond titles instead of ids) deferred.
6. **Chips are clickable** → open the linked page. Read-only hosts render chips but no picker.
7. **Integrity = tolerate.** A deleted target leaves its id in the array; the chip renders missing;
   the user drops it via `×`. No prune on read/write, no delete-time cascade (there is no reverse
   index to cascade through — reverse is a query).
8. **`define_schema` proposal card** previews a relation property's resolved target collection, so
   the user can correct it before accept (consistent with other property previews).

## Approach

### Data model — `src/lib/properties/schema.ts`

- Add `target: z.string().optional()` to `propertyDefSchema` **and** `aiPropertyDefSchema`
  (the AI proposes it as a collection NAME; the strict def stores the resolved id).
- No change to `valueSchemaFor`/`coerceValue`/`emptyValue` (already `z.array(z.string())` / `[]`).
- No `single` clamp anywhere (decision 4).

### Accept path — target name→id — `src/lib/pages/create-page.ts` (`hydratePropertySchema`)

- After minting ids, resolve each relation def's `target` **NAME** against the **workspace outline**
  (the collection list `configure_view` already uses), case-insensitive, first match wins;
  unresolved → drop `target` (untargeted), mirroring `configure-view.ts`'s lenient clause-drop.
- The workspace outline isn't available inside the pure `hydratePropertySchema`, so pass a
  `resolveCollectionName?: (name: string) => string | undefined` resolver from the accept site
  (`DefineSchemaProposalCard`, which has workspace context) — same seam shape as configure_view.

### Shared render+edit component (atomic design + Storybook)

- **Atom** `src/components/atoms/RelationChip.tsx` — one link chip: page title, clickable → open the
  page; a `missing` variant renders faded (mirrors `QuoteChip`/`CsvAttachmentPill`). Own story.
- **Molecule** `src/components/molecules/RelationValue.tsx` — `RelationValue({ def, value, editable,
onChange })`: renders `RelationChip`s and, when `editable`, a **bespoke** picker (Press aesthetic,
  mirroring `SlashMenu`'s from-scratch pattern — NOT a shadcn wrapper): title search scoped to
  `def.target` via `getCollectionRows`, else global (`matchPages`/`listPages`); `single` →
  replace-on-select; `×` removes; emits the new `string[]` to `onChange`. Own story.
- Shared by both the view `Cell` and `PropertyInspector` (no stray component outside molecules).

### Title resolution hook — new `src/lib/modules/view/use-relation-titles.ts`

- `useRelationTitles(ids, targetId?)` → `Map<id, title>`; targeted path reuses `['rows', targetId]`,
  else per-id `['page', id]`. Returns partial map; callers render unresolved as missing.

### Wire the two existing surfaces

- `src/lib/modules/view/view.tsx` — `Cell` `relation` case (today "N linked" inert) → `RelationValue`.
- `src/components/molecules/PropertyInspector.tsx:152` — relation case (today inert id chips) →
  `RelationValue`. This is the page's own-property surface (DocumentPanel).

### AI tool copy — `src/app/api/chat/tools.ts` + `prompt.ts`

- `define_schema` description: a `relation` property may name a `target` collection by NAME
  (optional; omit for an unscoped link); ids never invented. Keep it one sentence, in the existing
  voice.

## Verification (each commit green: tsc · eslint · jest · stories)

- **jest:** `hydratePropertySchema` resolves/drops a relation `target` name (targeted + unresolvable
  cases); the picker's `single` replace-on-select and multi append/remove logic (pure helper);
  id→title mapping incl. a missing id.
- **storybook:** a collection with a relation column — chips render (incl. a missing one); the
  picker adds/removes a link; a `single` relation replaces; read-only host shows chips, no picker.
- **live `/verify` on :3000:** author a relation property via chat (target by name), link rows via
  the picker, reload persists; open a linked page via a chip.

## Out of scope (this slice)

Rollups (count/sum/min-max/rollup-of-prop) and their re-grill; reverse-lookup query + backlinks UI;
AI link-authoring tool; AI serialize-context enrichment of linked titles; unstubbing the linked-view
path (#12); two-way/synced relations.
