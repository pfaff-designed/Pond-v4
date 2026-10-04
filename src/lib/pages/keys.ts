/**
 * react-query keys for the page tree (#312).
 *
 * Deliberately its OWN module, not an export of `./tree`. Fourteen suites mock
 * `@/lib/pages/tree` with a partial factory, so an added export there is
 * `undefined` at call time — which is exactly how this helper first landed and
 * broke 88 tests. A pure key builder has nothing to mock, so it lives apart.
 */

import type { WorkspaceScope } from '@/lib/workspace/context'

/**
 * The pond is appended ONLY when there is one, so an unscoped read keeps the
 * historical `['pages', workspace]` key. Several suites seed the cache under that
 * key, and changing it silently turned a seeded render into a permanent loading
 * state.
 */
export function pagesKey(workspace: WorkspaceScope, pondId?: string | null) {
  return pondId ? (['pages', workspace, pondId] as const) : (['pages', workspace] as const)
}
