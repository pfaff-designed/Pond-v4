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
