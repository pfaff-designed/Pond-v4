interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: { platform: string }
}

const APPLE_PLATFORM = /mac|iphone|ipad|ipod/i

/** Apple platform check — the one detection every command-key chord, the breadcrumb/zen
 *  chip and the page-changes panel need, kept in one place rather than regexes drifting
 *  apart (KAN-278, KAN-396). Read at call time, not import time: the platform is a fact
 *  of the browser, not of the module. */
export function isApplePlatform(): boolean {
  const nav = navigator as NavigatorWithUserAgentData
  return APPLE_PLATFORM.test(nav.userAgentData?.platform ?? nav.platform)
}
