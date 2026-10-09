/**
 * react-query keys for the change log.
 *
 * Its own module for the reason `lib/pages/keys.ts` is: suites mock the change-log
 * modules with partial factories, and a key builder exported from one of them is
 * `undefined` at call time under such a mock. A pure key builder has nothing to mock.
 */

/** The root every change-log view sits under — invalidate it and they all re-read. */
export const changeLogKey = () => ['change-log'] as const
