/**
 * The ⌘K chord, read the same way by its one owner (`ShellCommands`) wherever
 * it is pressed.
 */

interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: { platform: string }
}

const APPLE_PLATFORM = /mac|iphone|ipad|ipod/i

/** Read at press time, not import time: the platform is a fact of the browser, not of the module. */
const onApplePlatform = () => {
  const nav = navigator as NavigatorWithUserAgentData
  return APPLE_PLATFORM.test(nav.userAgentData?.platform ?? nav.platform)
}

/** ⌘K on a Mac, Ctrl+K everywhere else (AUDIT K3) — never both on one platform. */
export const isPaletteChord = (e: KeyboardEvent) => {
  if (e.altKey || e.key.toLowerCase() !== 'k') return false
  return onApplePlatform() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
}
