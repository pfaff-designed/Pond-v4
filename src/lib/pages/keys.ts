/**
 * react-query keys for the page tree (#312).
 *
 * Deliberately its OWN module, not an export of `./tree`. Fourteen suites mock
 * `@/lib/pages/tree` with a partial factory, so an added export there is
 * `undefined` at call time — which is exactly how this helper first landed and
 * broke 88 tests. A pure key builder has nothing to mock, so it lives apart.
 */

/**
 * The pond is appended ONLY when there is one, so an unscoped read keeps a stable
 * `['pages']` key. Several suites seed the cache, and changing the key silently
 * turned a seeded render into a permanent loading state.
 *
 * `workspace` is gone from the key with the column (0020) — the sandbox is a pond
 * (#315), so the pond is the only scope there is.
 */
export function pagesKey(pondId?: string | null) {
  return pondId ? (['pages', pondId] as const) : (['pages'] as const)
}

/**
 * The pond's root page — the home row `DocumentPanel` resolves for every page,
 * whose title is the breadcrumb's root word. One root per pond. The one key
 * for it: the query, the rename that writes it, and every reader build it here.
 */
export function homeQueryKey(pondId: string | null) {
  return ['home', pondId] as const
}

/**
 * The page whose `blocks` jsonb carries the structural `page-link` row for a
 * given parent — the client-side twin of `private.page_link_parent_id`
 * (migration 0031): a non-null `parentId` names the row directly, `null`
 * resolves to the pond's home row. One home for the rule (AGENTS.md DRY) so
 * `Rail.tsx`'s own move and `undo-outcome.ts`'s undo/redo of one don't each
 * spell `parentId ?? home.id` on their own. `undefined` when there's no home
 * row to resolve to (not yet fetched, or none created) — the same tolerance
 * `page_link_parent_id` has for a missing home row. Lives here, not in
 * `./home`, for the reason this module itself already gives above: dozens of
 * suites mock `@/lib/pages/home` with a partial factory, so an export added
 * there reads as `undefined` at call time.
 */
export function resolveLinkParentId(
  parentId: string | null,
  homeId: string | undefined
): string | undefined {
  return parentId ?? homeId
}
