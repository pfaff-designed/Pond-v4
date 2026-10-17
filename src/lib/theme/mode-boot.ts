/**
 * The persisted light/dark choice, re-applied before first paint. A plain module
 * (no `'use client'`) because the server-rendered root layout inlines the script:
 * a client module's exports reach a server component as references, not strings.
 */

export const MODE_KEY = 'pond:mode'

/** What can be stored: an explicit choice, or `system` (unset/garbage reads as this too). */
export type StoredMode = 'light' | 'dark' | 'system'

/** The one media query every boot/follow path checks; `mode.ts` imports this rather than its own copy. */
export const MEDIA_QUERY = '(prefers-color-scheme: dark)'

/**
 * Inlined in the root layout's `<head>`; runs before the body parses. Stored
 * `dark` wins outright; stored `light` wins outright; anything else (`system`,
 * absent, or a read that throws) falls through to the OS's own preference.
 * Storage and matchMedia are each read once, in their own try, so a storage
 * read that throws still reaches the OS check.
 */
export const MODE_BOOT_SCRIPT = `(function(){var m=null;try{m=localStorage.getItem('${MODE_KEY}')}catch(e){}if(m==='dark'){document.documentElement.classList.add('dark');return}if(m==='light')return;try{if(matchMedia('${MEDIA_QUERY}').matches)document.documentElement.classList.add('dark')}catch(e2){}})()`
