/**
 * Decoupled shell commands (#96) — the same shape as `terminal-focus`.
 *
 * The visible affordance lives where the handoff puts it: ⌘K in the breadcrumb
 * pill (`Pond 02` 2t). The palette and the New-page dialog themselves are owned
 * once, at the shell level, by `ShellCommands`, which listens for these events —
 * so the breadcrumb (a presentational molecule) never imports a modal.
 */

export const OPEN_PALETTE_EVENT = 'pond:open-palette'
export const CREATE_PAGE_EVENT = 'pond:create-page'

/** Open the ⌘K command palette. */
export function requestCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))
}

/** Open the New page dialog (ticket-26's name-first flow). */
export function requestCreatePage() {
  window.dispatchEvent(new Event(CREATE_PAGE_EVENT))
}
