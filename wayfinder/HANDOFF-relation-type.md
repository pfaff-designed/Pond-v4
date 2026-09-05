# Handoff — `relation` property type (#20 slice, forward-only)

**Repo:** `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`
**Branch:** `feat/relation-type` (off `origin/main` `7110eda`). **2 commits, all green, NOT pushed.**
**Spec (authoritative):** `wayfinder/SPEC-relation-type.md` — all 8 decisions + 3 assumptions user-confirmed.
**Build via `/tdd`**, seams confirmed (presentational `RelationValue` split like `ViewView`/`CollectionView`).

## Done & green (do NOT re-derive)

- **Slice 1 (`10cd973`)** — `target?: string` added to `propertyDefSchema` + `aiPropertyDefSchema`
  (`src/lib/properties/schema.ts`). Tests in `src/__tests__/property-schema.test.ts`.
- **Slice 2 (`3450db0`)** — `hydratePropertySchema(defs, mintId, resolveCollectionName?)` resolves a
  relation's `target` NAME→collection id on accept; unresolvable/no-resolver drops it (lenient);
  target is relation-only. Threaded through `defineSchemaFromProposal`. Tests in
  `src/__tests__/define-schema-from-proposal.test.ts`.
- **Slice 2b (`a8e23ef`)** — accept-site resolver wired. `collectionNameResolver(pages)` (pure, in
  `src/lib/pages/create-page.ts`) builds the `resolveCollectionName` closure; `acceptDefineSchema`
  feeds it `allPages` (the `['pages', workspace, 'full']` cache — the one WITH `props`) and passes it
  as the 4th arg to `defineSchemaFromProposal`. DIVERGED from the original plan: it filters to
  **collections** (`isCollection`, first title match wins) rather than "all non-row pages" — the
  full cache carries `props`, and a relation target IS a collection (spec decision 1). Lenient:
  unmatched → untargeted. Tests in `src/__tests__/define-schema-from-proposal.test.ts`
  (`collectionNameResolver` describe); UI-mock updated in `define-schema-flow-ui.test.tsx`.
- **Full suite: jest 1042 / 74 suites green.** tsc + eslint clean (pre-commit enforced).

## Remaining slices (TDD, commit each green: tsc · eslint · jest · stories)

**3 — atom `RelationChip`** — `src/components/atoms/RelationChip.tsx` + story. One chip: page title,
clickable → open page (`onOpen(id)`); `missing` variant faded. Mirror `QuoteChip`/`CsvAttachmentPill`
(atoms) + Press aesthetic. Seam = story play (renders title; click fires; missing faded).

**4 — molecule `RelationValue`** — `src/components/molecules/RelationValue.tsx` + story. **Presentational**
(injected `candidates: {id,title}[]`, `titles: Map<id,title>`, `value: string[]`, `single`, `editable`,
`onChange`). Renders `RelationChip`s + a **bespoke** picker (mirror `SlashMenu`'s from-scratch pattern —
raw useState/refs/`role`, NOT a shadcn wrapper): title-filter the candidates, click adds; `single` →
replace-on-select; chip `×` removes; emit new `string[]`. Missing ids (not in `titles`) → missing chip.
Story exercises add / remove / single-replace / missing. A thin **connected wrapper** (see slice 6) does
the fetching. Pure list ops (add/remove/single-replace) can be a tiny tested helper.

**5 — hook `useRelationTitles`** — `src/lib/modules/view/use-relation-titles.ts` + `.test.tsx`
(`renderHook` + `QueryClientProvider`; precedent `src/__tests__/use-cross-page-metric.test.tsx`).
`useRelationTitles(ids, targetId?) → Map<id,title>`: targeted reuses `['rows', targetId]` (shape via
`getCollectionRows` → `PondPage[]`), else per-id `['page', id]`/`getPage`. Partial map; unresolved omitted
(caller renders missing). Also provides the picker's `candidates` (target collection rows) — connected
wrapper composes this + `RelationValue`.

**6 — wire the two surfaces.** Replace inert relation render with the connected `RelationValue`:

- `src/lib/modules/view/view.tsx` — `Cell` `relation` case (currently `{ids.length} linked`).
- `src/components/molecules/PropertyInspector.tsx:152` — relation case (inert id chips today).
  Update/extend `view.stories.tsx` + `PropertyInspector.stories.tsx` play tests to show chips + edit.
  Editable path writes via existing `setValue`/`onEdit` (array). Read-only host → chips, no picker.

**7 — tool copy.** `src/app/api/chat/tools.ts` (`define_schema` desc) + `prompt.ts`: a `relation`
property may name an optional `target` collection by NAME (omit = unscoped); ids never invented. One
sentence, existing voice. (Schema already accepts `target` from slice 1 — copy only.)

## Verify at the end

- Full `npx jest`, `npm run typecheck`, `npx eslint src`, `npx vitest --project=storybook run` (storybook bg on :6006).
- Live `/verify` on :3000: author a relation prop via chat (target by name), link rows via picker,
  reload persists, open a linked page via a chip.
- Then `/code-review`, then ask user before push/PR.

## Out of scope (this slice)

Rollups + their re-grill; reverse-lookup/backlinks; AI link-authoring tool; AI serialize enrichment;
linked-view (#12) unstub; two-way relations.

## Env notes

Supabase free-tier may auto-pause (~1wk idle) → NXDOMAIN; restore via mgmt API
`POST /v1/projects/ifhahsvgqedvygpdeaix/restore` (token in keychain "Supabase CLI"), ~4 min.
Also open: **PR #33** (gantt drag-reschedule) awaiting user merge — separate branch.
