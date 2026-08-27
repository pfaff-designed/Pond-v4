/**
 * Decoupled "focus the terminal input" signal. The top bar (⌘K icon and the
 * global ⌘K hotkey) requests focus; the AITerminal listens and moves focus
 * into its input — the proto's free-text→Pond gesture, without the two
 * organisms knowing about each other.
 */

export const FOCUS_TERMINAL_EVENT = 'pond:focus-terminal'

export function requestTerminalFocus() {
  window.dispatchEvent(new Event(FOCUS_TERMINAL_EVENT))
}
