/**
 * Decoupled "focus the terminal input" signal. The top bar (⌘K icon and the
 * global ⌘K hotkey) requests focus; the AITerminal listens and moves focus
 * into its input — the proto's free-text→Pond gesture, without the two
 * organisms knowing about each other.
 */

export const FOCUS_TERMINAL_EVENT = 'pond:focus-terminal'

export interface FocusTerminalDetail {
  /** Text to put in the composer as it takes focus — the palette's `ask pond about “q”` (#279). */
  text?: string
}

export function requestTerminalFocus(text?: string) {
  window.dispatchEvent(
    new CustomEvent<FocusTerminalDetail>(FOCUS_TERMINAL_EVENT, { detail: text ? { text } : {} })
  )
}

/**
 * "Open the thread at this message" (#97): a page's made-from chip links back
 * to the moment in the thread its prose came from. The chip asks; the terminal
 * uncollapses and scrolls that message into view if the thread still holds it.
 */
export const OPEN_THREAD_MESSAGE_EVENT = 'pond:open-thread-message'

export interface OpenThreadMessageDetail {
  messageId: string
}

export function requestThreadMessage(messageId: string) {
  window.dispatchEvent(
    new CustomEvent<OpenThreadMessageDetail>(OPEN_THREAD_MESSAGE_EVENT, { detail: { messageId } })
  )
}

/**
 * "Open or close the composer" (⌘J, `Pond 02` 2f). The shell's key owner
 * (`ShellCommands`) asks; the composer answers, so the two never import each other.
 */
export const TOGGLE_COMPOSER_EVENT = 'pond:toggle-composer'

export function requestComposerToggle() {
  window.dispatchEvent(new CustomEvent(TOGGLE_COMPOSER_EVENT))
}

/** The platform's command key for ⌘J: Cmd on Apple platforms, Ctrl everywhere else. */
export function isComposerToggleKey(e: KeyboardEvent): boolean {
  if (e.altKey || e.shiftKey || e.key.toLowerCase() !== 'j') return false
  const apple = /Mac|iPhone|iPad/.test(navigator.platform)
  return apple ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
}
