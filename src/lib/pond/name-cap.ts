/**
 * A pond name's length cap (KAN-492). Its own leaf module, with no import of
 * `./context` or `./client`: `client.ts`'s `updatePond` needs the cap, and
 * `context.tsx` imports `client.ts`, so the cap living in `./name` (which
 * imports `usePond` from `./context`) would close a context.tsx -> client.ts ->
 * name.ts -> context.tsx cycle.
 */

/** No board value exists; a pond's name renders in the rail head and the switcher
 *  menu, so a generous title length rather than the field's own cap. `PAGE_NAME_MAX`
 *  (`page-proposals.ts`) caps a proposed page's name, a different fact. */
export const POND_NAME_MAX = 80

/** `v.slice(0, n)` cuts UTF-16 code units, splitting a surrogate pair (an emoji)
 *  in two and storing the lone leading half. Clamp by code point instead. */
export const clampPondName = (v: string) => Array.from(v).slice(0, POND_NAME_MAX).join('')
