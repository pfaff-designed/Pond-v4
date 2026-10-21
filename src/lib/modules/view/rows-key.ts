/**
 * react-query key for a collection's row children (`use-collection-rows.ts`).
 *
 * Its own module, not an export of `use-collection-rows.ts` — mirroring
 * `@/lib/pages/keys`'s own reasoning: eight suites mock that hook with a
 * partial factory, so a key export living there would read `undefined` at
 * call time for any other caller (`applyUndoOutcome`'s own invalidation).
 */

export const rowsKey = (collectionId: string) => ['rows', collectionId] as const
