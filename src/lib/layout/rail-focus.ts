/**
 * Decoupled "focus the open row in the rail" signal (KAN-476). ShellCommands'
 * rail-focus chord asks; Rail listens and moves focus to the open page's row —
 * the same ask/answer shape as `terminal-focus.ts`'s `requestTerminalFocus`/
 * `FOCUS_TERMINAL_EVENT`, so the two organisms don't import each other.
 */

export const FOCUS_RAIL_ROW_EVENT = 'pond:focus-rail-row'

export function requestRailRowFocus() {
  window.dispatchEvent(new CustomEvent(FOCUS_RAIL_ROW_EVENT))
}
