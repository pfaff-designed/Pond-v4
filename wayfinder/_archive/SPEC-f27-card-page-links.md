# SPEC — F27: Kanban cards linkable to pages (issue #10)

_Status: DRAFT, awaiting sign-off. Grilled 2026-09-01. Repo: `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`._

## 1. What this is

Kanban cards can point at a page. Click a linked card → navigate to that page
(same panel, like the rail). A card action can **mint a new child page and link
it**, or **link an existing page**. This is the first taste of "views over pages"
— a down-payment on the Database Primitive epic, deliberately kept small.

### Roadmap-premise correction (verified against code)

The roadmap frames F27 as "closing the AI-scaffolds-but-UI-can't-honor gap"
("Pond already scaffolds card→page links and has to warn the user they don't
work"). **That scaffolding does not exist in the code** — there is no
`linkedPageId`/`pageId` on cards, the AI never emits one, and there is no warning
string. F27 is therefore a **net-new feature**, not the repair of a live bug.
Nothing user-facing has to be preserved.

## 2. Decisions locked in the grill

| #           | Decision                                              | Choice                                                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link model  | What is a linked card?                                | **Card-as-page semantics via a hybrid store.** The page is the source of truth for a linked card's title.                                                                                                               |
| Coexistence | Free-text cards (existing boards + AI) vs page-backed | **Hybrid.** Card always carries a denormalized `title` (fast render, AI unchanged, no migration). `pageId` optional. Linked ⇒ page owns title (synced on load; write-through on edit). Unlinked ⇒ plain free-text card. |
| AI scope    | Does the AI author links this cycle?                  | **No.** AI composition untouched; `pageId` is stripped from the AI-facing schema so the model never emits it. Deferred to the database epic.                                                                            |
| Link UX     | How does a card get linked?                           | **Both** mint-new-child + link-existing, plus unlink. `+ Add card` stays a quick free-text card; page-backing is an opt-in second action.                                                                               |
| Navigation  | Where does a linked card open?                        | **Same panel** via `router.push(workspaceUrl(...))`, matching the rail.                                                                                                                                                 |

## 3. Data model

`src/lib/modules/kanban/schema.ts` — add one optional field to `kanbanCardSchema`:

```ts
export const kanbanCardSchema = z.object({
  id: z.string(),
  title: z.string(), // denormalized cache; page owns it when linked
  note: z.string().optional(),
  pageId: z.string().optional(), // F27: linked page (a reference, NOT a minted id)
})
```

- **No migration.** Optional field; existing boards parse unchanged.
- **`nestedIdPaths` unchanged** (`['columns','columns.cards']`). `pageId` is a
  _reference_ to an existing page, never minted — the hydrate/preview id-walkers
  must not touch it (they only mint `card.id`). Confirm `mintNestedIds` leaves it
  alone (it only stamps the `id` key).
- **AI-facing schema** (`src/lib/modules/ai-composition.ts`, the `kanbanData`
  omit chain, ~lines 109–114): omit `pageId` alongside `id` so the model can
  neither read nor emit links this cycle.
- **`serialize`/`preview`** (kanban descriptor): unchanged this cycle — cards
  serialize by `title` as today. (When the AI learns links later, serialize will
  append the linked page's title; out of scope now.)

## 4. The capability seam — `PageLinkProvider` (React context)

`ModuleViewProps` is intentionally minimal (`{ data, editable?, onChange? }`) and
the codebase's idiom for ambient capabilities is context (`SiblingBlocksProvider`,
the cross-page-metric context) — **not** prop-threading through
`BlockCanvas → ModuleView → view`. F27 follows that idiom.

**New file:** `src/lib/modules/page-link/context.tsx`

```ts
export interface PageLinkCapabilities {
  /** Resolve a linked page's live title/type from the already-loaded pages cache. */
  resolvePage(pageId: string): { id: string; title: string; type: string } | null
  /** Navigate to a page in the current panel. */
  navigateToPage(ref: { id: string; title: string; type: string }): void
  /** Mint a child page under the containing page and return its id. */
  createLinkedPage(title: string): Promise<{ id: string; title: string; type: string }>
  /** Rename a linked page (write-through from a card title edit). */
  renamePage(pageId: string, title: string): Promise<void>
  /** Candidate pages for the "link existing" picker (already-loaded rows). */
  searchPages(query: string): Array<{ id: string; title: string; type: string }>
}
// Provider + `usePageLinks(): PageLinkCapabilities | null` hook.
// Returns null when no provider is mounted (AI terminal reference render,
// Storybook) → the view degrades to today's behavior (no link actions).
```

**Mount point:** `DocumentPanel` (`src/components/organisms/DocumentPanel.tsx`),
wrapping `<BlockCanvas>`. It already holds everything the capabilities need:
`supabase`, `workspace`, `queryClient`, the containing `page.id`, and the
`['pages', workspace]` `rows` cache (line 72). Implementations:

- `resolvePage` / `searchPages` → lookup/filter over `rows` (zero new fetches).
- `navigateToPage` → `useRouter().push(workspaceUrl(ref))` (add `useRouter`).
- `createLinkedPage(title)` → `createPage(supabase, userId, { title, parentId: page.id, type: 'page', workspace, blocks: [] })` (match the exact `createPage` signature in `src/lib/pages/client.ts`), then invalidate `['pages', workspace]` so the new child shows in rail + is resolvable. Returns the new node ref.
- `renamePage(pageId, title)` → `updateTitle(supabase, pageId, title)` then invalidate `['pages', workspace]` and `['page', pageId]`.

> The provider is generic (`page-link`, not kanban-specific) so future
> view-over-pages modules reuse it. Only `KanbanView` consumes it in F27.

## 5. View changes — `src/lib/modules/kanban/view.tsx`

`KanbanView` calls `const links = usePageLinks()`.

**Linked-card title = page title (source of truth).** For a card with `pageId`,
prefer `links?.resolvePage(pageId)?.title` for display, falling back to the cached
`card.title` (covers the loading frame and the orphan case). `CardBody` gains a
`resolvedTitle?: string` and a `linkState: 'none' | 'linked' | 'missing'`.

**Read-only mode** (AI terminal reference, `editable=false`):

- Linked card → title rendered as a button that calls `navigateToPage` on click
  (subtle link affordance). No menu.
- No provider → plain text as today.

**Editable mode:**

- Card gains a small **⋯ action menu** (or inline affordance consistent with the
  Press language — reuse an existing menu atom if one exists; otherwise a minimal
  popover). Items are provider-gated (hidden if `links` is null):
  - **Open** — only when linked; `navigateToPage`.
  - **Create page & link** — `const p = await links.createLinkedPage(card.title || 'Untitled'); emit(patchCard(data, card.id, { pageId: p.id, title: p.title }))`.
  - **Link existing page…** — opens the picker (§6); on pick `emit(patchCard(data, card.id, { pageId, title: pickedTitle }))`.
  - **Unlink** — only when linked; `emit(patchCard(data, card.id, { pageId: undefined }))`. Card reverts to free-text keeping its last title.
- **Linked-card title editing = write-through.** When linked, the title input's
  `onTitle(v)` does both: `emit(patchCard(data, card.id, { title: v }))` (cache) and
  `links.renamePage(pageId, v)` (page = source of truth). Debounce not required —
  the existing debounced block save covers the cache; `renamePage` can fire on
  blur/enter to avoid a write per keystroke.
  - _Simplification available if you'd rather cut write-through:_ make a linked
    card's title read-only (rename by opening the page). Flag at sign-off.
- **Orphan** (`pageId` set, `resolvePage` returns null): render cached `card.title`
  with a faint "linked page missing" affordance; **Open** is disabled; menu offers
  **Unlink** / **Link existing**. Never hard-fail.

**Affordance:** a linked card shows a quiet link glyph/underline (Press-muted) so
the link is legible without a hover. Reduced-motion safe; no new dep.

## 6. "Link existing" picker

Reuse the existing page search rather than build a data layer. `CommandPalette`
(`src/components/molecules/CommandPalette.tsx`, F18) already searches pages over
the same `rows`. Options, cheapest first:

1. A minimal inline combobox in the card menu that calls `links.searchPages(q)`
   and lists matches (title + breadcrumb-ish type). **Preferred for F27.**
2. Extract `CommandPalette`'s page-filter into a shared helper if it isn't already
   one, and reuse it, to avoid two divergent page-search UXs.

Same-workspace only (the picker lists `rows`, which are already workspace-scoped).

## 7. Move/mutation logic — `src/lib/modules/kanban/move.ts`

No new functions required. `patchCard`'s signature is
`Partial<Omit<KanbanCard,'id'>>`, so `{ pageId }` and `{ pageId: undefined }` flow
through once the schema field exists. (Optionally add thin `linkCard`/`unlinkCard`
wrappers for test readability — nice-to-have, not required.)

## 8. Persistence

Nothing new. `pageId` rides in the `pages.blocks` JSONB via the existing
full-state-replace save (`commitLocalEdit → scheduleSave → commitBlocks →
saveBlocks`). Survives refresh by construction.

## 9. Test plan (jest — pure logic + schema; live for DnD/nav)

**Pure / jest:**

- `kanban/schema` accepts a card with `pageId` and one without (back-comseat).
- `patchCard` sets and clears `pageId`; leaves other cards untouched.
- `ai-composition`: `kanbanData` **rejects/strips** `pageId` (the model can't emit
  it) — mirror the existing id-omission test.
- `mintNestedIds` on a kanban block does not invent or alter `pageId`.
- `page-link` capabilities: `resolvePage`/`searchPages` against a fixture `rows`
  array (pure functions extracted from the provider so they're testable without React).

**Live `/verify` (real app, `:3000`, `DEV_AUTOLOGIN=1`):**

- Create page & link → card shows page title, link glyph; refresh persists.
- Click linked card → navigates to that page in-panel.
- Link existing → picker filters, pick binds, title shows.
- Rename linked card title → page title updates (rail + page header) [if write-through kept].
- Unlink → reverts to free-text, keeps last title, persists.
- Orphan → delete the linked page, board still loads, card shows "missing", Open disabled.
- AI proposes a kanban → no `pageId` leaks into the proposal.

## 10. Slices (small, independently landable)

1. **Schema + AI-omit + tests.** `pageId` on the card; strip from AI schema;
   jest green (schema, patchCard, ai-composition, hydrate). No UI yet.
2. **`PageLinkProvider` + mount in DocumentPanel.** Capabilities backed by cache +
   router + createPage/updateTitle. Pure resolve/search helpers unit-tested.
3. **View: navigate + linked-title display + orphan.** Consume `usePageLinks`;
   click-to-open; resolved title; missing-page affordance. (No creation UI yet.)
4. **View: card menu — Create page & link, Unlink, write-through title.**
5. **View: Link existing picker.**
6. **Live `/verify` + docs + PR** (closes #10).

## 11. Out of scope (explicit)

- AI authoring of links (database epic).
- Board-as-view-over-a-collection; property schemas; filter/sort/group.
- Within-column reordering (already out of scope in the base module).
- Multi-page links per card, backlinks from the page to the card.
- Bulk migration of existing free-text cards to pages.

## 12. Open items to confirm at sign-off

1. **Write-through vs read-only linked title** (§5) — keep write-through, or cut
   it and rename-by-opening? (Recommend keep; it's cheap via `patchCard` + `renamePage`.)
2. **Card menu affordance** — is there an existing menu/popover atom to reuse, or
   build a minimal one? (Slice 4 will confirm before building.)
3. **`createPage` exact signature/parent field** — verify `parentId` vs
   `parentRef` and whether `userId` is needed at the call site in DocumentPanel.
