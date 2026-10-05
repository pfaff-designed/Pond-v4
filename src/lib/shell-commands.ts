/**
 * Decoupled shell commands — the same shape as `terminal-focus`. The palette is
 * owned once, at the shell level, by `ShellCommands`, which listens for these
 * events; a presentational molecule (the breadcrumb) raises them and never
 * imports a modal.
 */

export const OPEN_PALETTE_EVENT = 'pond:open-palette'

/** Open the ⌘K command palette. */
export function requestCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))
}
