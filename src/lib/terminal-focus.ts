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

// A request can beat AITerminal's own listener to mount — the cover's `?ask=`
// carry fires from DocumentPanel's effect, which runs before AITerminal's in
// tree order (KAN-195). The dispatch still fires for an already-mounted
// listener; a request with text also waits here for a late listener to claim.
let pendingText: string | undefined

export function requestTerminalFocus(text?: string) {
  if (text) pendingText = text
  window.dispatchEvent(
    new CustomEvent<FocusTerminalDetail>(FOCUS_TERMINAL_EVENT, { detail: text ? { text } : {} })
  )
}

/** Claim and clear the last request's text, for a listener that attaches after the dispatch. */
export function takePendingTerminalText(): string | undefined {
  const text = pendingText
  pendingText = undefined
  return text
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

/**
 * "Show one notice line in the composer" (KAN-93). The shell's ⌘Z/⇧⌘Z
 * handler knows a chord was stale/blocked/refused and the composer owns the
 * only notice line to show it in — same decoupling as `requestTerminalFocus`,
 * so neither organism imports the other.
 */
export const COMPOSER_NOTICE_EVENT = 'pond:composer-notice'

export interface ComposerNoticeDetail {
  text: string
}

export function requestComposerNotice(text: string) {
  window.dispatchEvent(
    new CustomEvent<ComposerNoticeDetail>(COMPOSER_NOTICE_EVENT, { detail: { text } })
  )
}

/**
 * "Open the html import file chooser" (KAN-251). ⌘K's `import a page` asks;
 * the composer owns the hidden `<input type="file">` and answers — the same
 * decoupling as `requestTerminalFocus`, so a future door (zen's ＋, KAN-186/
 * KAN-193) can dispatch this unchanged with no change to the composer.
 */
export const HTML_IMPORT_PICKER_EVENT = 'pond:html-import-picker'

export function requestHtmlImportPicker() {
  window.dispatchEvent(new CustomEvent(HTML_IMPORT_PICKER_EVENT))
}

/**
 * "Request changes on a diff with no mounted thread" (KAN-96). The proposed
 * view's card asks; the composer owns `sendRequestChanges` and answers — the
 * same decoupling as `requestTerminalFocus`, since the proposed view has no
 * `useChat` of its own to post the note through.
 */
export const REQUEST_CHANGES_EVENT = 'pond:request-changes'

export interface RequestChangesDetail {
  toolCallId: string
  note: string
  reason: 'note' | 'outdated'
  /** The batch's size, when the dispatcher knows it (a live thread's multi-
   *  change card). Omitted — resolved as a single decision — by the proposed
   *  view, which always dispatches for one change-log record. */
  count?: number
  /** The record's own target page, carried by the proposed view so the
   *  revised diff lands on that page rather than whatever node the person
   *  happens to be viewing (the change log page itself, `CHANGE_LOG_NODE_ID`).
   *  Omitted by a thread-originated card, which is already on its page. */
  targetPageId?: string | null
}

export function requestChanges(detail: RequestChangesDetail) {
  window.dispatchEvent(new CustomEvent<RequestChangesDetail>(REQUEST_CHANGES_EVENT, { detail }))
}
