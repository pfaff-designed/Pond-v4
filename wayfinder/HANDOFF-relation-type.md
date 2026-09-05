# Handoff — `relation` property type (#20 slice, forward-only)

**Repo:** `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`
**Branch:** `feat/relation-type` (off `origin/main` `7110eda`). Slices 1–5 + 2b done; **ahead of
`origin/feat/relation-type` by 7 local commits, all green, NOT pushed.** Slices 6–7 remain.
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
- **Slice 3 (`4911435`)** — atom `RelationChip` (`src/components/atoms/RelationChip.tsx` + story).
  Present link → `<button>` (title, `onOpen(id)`); `missing` → faded inert `<span>`. In slice 4 it
  gained an optional remove `×` (title-open + × are sibling buttons in a container span — no nesting).
- **Slice 4 (`7390c31`)** — molecule `RelationValue` (`src/components/molecules/RelationValue.tsx` +
  story) + pure `addLink`/`removeLink` (`src/lib/modules/view/relation-value-ops.ts`, jest-tested).
  Presentational (`value`/`titles`/`candidates`/`single`/`editable`/`onChange`/`onOpen`); bespoke
  picker (raw useState/refs/role, not shadcn) filters candidates, excludes already-linked, `single`
  replaces-on-select. Picker is filter+click+Escape (NO arrow-key nav yet) and an inline absolute
  panel (not portaled — may clip in a table cell; revisit if slice-6 live-verify shows it).
- **Slice 5 (`4ac0884`)** — hook `useRelationTitles(ids, targetId?)` → `{ titles, candidates }`
  (`src/lib/modules/view/use-relation-titles.ts` + `.test.tsx`). Targeted → `['rows', targetId]`
  (titles + candidates); untargeted → per-id `['page', id]` titles + global `['pages',ws,'full']`
  list (minus rows) as candidates. Partial map; off-target/unresolved omitted. No `isLoading` flag —
  during load an unresolved id briefly shows as missing (accepted per leniency; add a flag in slice 6
  if the flash is bad in live-verify).
- **Full suite: jest 1055 / 77 suites green.** tsc + eslint clean (pre-commit enforced).

## Remaining slices (TDD, commit each green: tsc · eslint · jest · stories)

**6 — wire the two surfaces.** Replace inert relation render with the connected `RelationValue`:

- `src/lib/modules/view/view.tsx` — `Cell` `relation` case (currently `{ids.length} linked`, line ~750;
  ALSO the read-only branch ~681-690 which falls through to `displayValue` — handle relation there too).
- `src/components/molecules/PropertyInspector.tsx:152` — relation case (inert id chips today).
  Update/extend `view.stories.tsx` + `PropertyInspector.stories.tsx` play tests to show chips + edit.
  Editable path writes via existing `setValue`/`onEdit` (array). Read-only host → chips, no picker.

  **DESIGN FINDING (resolve first — this is the crux of slice 6):** `Cell`/`CollectionView` and
  `PropertyInspector` are **strictly presentational** — static schema/rows/values, NO Supabase, and
  their stories render them with fixtures and NO `QueryClientProvider`. `RelationValue` is also
  presentational (good), but it needs `titles`/`candidates` from `useRelationTitles` (which fetches).
  So the fetch boundary must be decided. Recommended approach (keeps presentational purity + testable
  stories):
  1. Build a thin **connected** component, e.g. `src/components/molecules/RelationValueField.tsx`
     (or organisms/), that takes `def, value, editable, onChange` — calls
     `useRelationTitles(ids, def.target)`, derives `onOpen` from `useRouter()` +
     `workspaceHref({ id, title, type: 'page' }, workspaceBasePath(useWorkspace()))` (NOTE: the
     workspace panel loads content purely from `?nodeId` — `DocumentPanel` `getPage(nodeId)` — so a
     `type:'page'` fallback in the href is harmless; nodeType/nodeName are only rail/breadcrumb
     hints), and renders `<RelationValue single={def.single} … />`. `single` is on the relation
     `PropertyDef` — confirm the field name in `schema.ts` before use.
  2. Render `RelationValueField` inside each relation case (view `Cell` editable + read-only, and
     PropertyInspector). This introduces a data hook into the relation _branch_ only; the rest of
     `Cell`/`PropertyInspector` stays presentational. This is the pragmatic reading of the handoff's
     "thin connected wrapper does the fetching."
  3. **Stories:** the relation stories/play-tests that exercise the connected field need a
     `QueryClientProvider` decorator + the same `@/lib/pages/client` + `@/lib/supabase/client` +
     `@/lib/workspace/context` mocks used in `use-relation-titles.test.tsx` (Storybook supports
     module mocks via `sb.mock`, or add a decorator that seeds the query cache with rows). Simpler
     alt: keep view/inspector story coverage on the PRESENTATIONAL `RelationValue` (already fully
     covered in `RelationValue.stories.tsx`) and give `RelationValueField` its OWN story with a
     QueryClient decorator + seeded cache — avoids retrofitting the big view/inspector fixtures.
     `Cell` currently receives `def, value, editable, onChange` — `def` carries `target`/`single`, and
     `onChange(array)` already exists (writes via `onEdit`/`setValue`). So no new plumbing through
     `View→CollectionTable→Cell` beyond swapping the relation branch to render `RelationValueField`.

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
