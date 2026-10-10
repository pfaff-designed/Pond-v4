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
