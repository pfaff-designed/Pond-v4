/**
 * The persisted light/dark choice, re-applied before first paint. A plain module
 * (no `'use client'`) because the server-rendered root layout inlines the script:
 * a client module's exports reach a server component as references, not strings.
 */

export const MODE_KEY = 'pond:mode'

/** Inlined in the root layout's `<head>`; runs before the body parses. */
export const MODE_BOOT_SCRIPT = `(function(){try{if(localStorage.getItem('${MODE_KEY}')==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`
