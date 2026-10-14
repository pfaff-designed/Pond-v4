/** Apple platform check — the one detection `isComposerToggleKey` (`terminal-focus.ts`)
 *  and the page-changes panel (`page-changes.ts`) both need, kept in one place
 *  rather than two regexes drifting apart. */
export function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform)
}
