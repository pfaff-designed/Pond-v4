import { useSyncExternalStore } from 'react'

import { isApplePlatform } from '@/lib/platform'
import { formatChord } from '@/lib/shell-commands'

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
  /** Arm deep research for the next question — the palette's `deep research` row (KAN-182). */
  research?: boolean
}

// A request can beat AITerminal's own listener to mount — the cover's `?ask=`
// carry fires from DocumentPanel's effect, which runs before AITerminal's in
// tree order (KAN-195). The dispatch still fires for an already-mounted
// listener; a request with text also waits here for a late listener to claim.
let pendingText: string | undefined
let pendingResearch: boolean | undefined

export function requestTerminalFocus(text?: string, opts?: { research?: boolean }) {
  if (text) pendingText = text
  if (opts?.research) pendingResearch = true
  const detail: FocusTerminalDetail = {}
  if (text) detail.text = text
  if (opts?.research) detail.research = true
  window.dispatchEvent(new CustomEvent<FocusTerminalDetail>(FOCUS_TERMINAL_EVENT, { detail }))
}

/** Claim and clear the last request's text, for a listener that attaches after the dispatch. */
export function takePendingTerminalText(): string | undefined {
  const text = pendingText
  pendingText = undefined
  return text
}

/** Claim and clear the last request's research flag, same shape as `takePendingTerminalText`. */
export function takePendingTerminalResearch(): boolean | undefined {
  const research = pendingResearch
  pendingResearch = undefined
  return research
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
  const apple = isApplePlatform()
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
 * "Is the composer open" (zen's pill, KAN-186). `AITerminal` broadcasts its
 * own open/closed state; a listener outside it (the pill) reads that state
 * without importing `AITerminal` — the same decoupling as the other events
 * here, but through a module-level store rather than a `window` event, since
 * every reader here is in-process (`useSyncExternalStore`, not `addEventListener`).
 */
// A module-level snapshot, not a per-hook useState: AITerminal's mount effect
// broadcasts before ZenComposerChrome and ZenPill ever subscribe (host order),
// so a listener that only started from its own mount would read the pre-mount
// 'closed' default and never catch up to an already-open composer.
let composerOpenSnapshot = false
const composerOpenListeners = new Set<() => void>()

export function notifyComposerOpenChange(open: boolean) {
  composerOpenSnapshot = open
  composerOpenListeners.forEach((listener) => listener())
}

/** Track the composer's open/closed state from outside `AITerminal`. False on the server. */
export function useComposerOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      composerOpenListeners.add(listener)
      return () => composerOpenListeners.delete(listener)
    },
    () => composerOpenSnapshot,
    () => false
  )
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

/**
 * "Show the undo/redo notice" (KAN-139, board `Pond 06.15` s6o5). The shell's
 * ⌘Z/⇧⌘Z handler knows which page it opened and what the step did; the
 * notice panel owns the only place to show it — same decoupling as
 * `requestTerminalFocus`. A module-level snapshot plus a listener set, like
 * `notifyComposerOpenChange`/`useComposerOpen`, not a `window` event: a
 * notice can be requested before any reader (the panel, `undo-strike.ts`)
 * mounts, and a plain event would only reach a listener already attached —
 * the snapshot must already hold it once one does.
 */
export interface UndoNotice {
  direction: 'undo' | 'redo'
  /** What the record did, past tense — e.g. "removed chickpeas, harissa". */
  pastTense: string
  /** The page the step navigated to, when it changed page. Omitted ⇒ the
   *  head's "opened {page}" clause doesn't show. */
  openedPageTitle?: string | null
  previousPageTitle: string
}

let undoNoticeSnapshot: UndoNotice | null = null
const undoNoticeListeners = new Set<() => void>()

function setUndoNoticeSnapshot(notice: UndoNotice | null) {
  undoNoticeSnapshot = notice
  undoNoticeListeners.forEach((listener) => listener())
}

export function requestUndoNotice(notice: UndoNotice) {
  setUndoNoticeSnapshot(notice)
}

export function clearUndoNotice() {
  setUndoNoticeSnapshot(null)
}

/** The current undo/redo notice, for a non-React reader (`undo-strike.ts`). */
export function getUndoNoticeSnapshot(): UndoNotice | null {
  return undoNoticeSnapshot
}

/** Subscribe to every undo-notice change, for a non-React reader
 *  (`undo-strike.ts`'s struck-row map) that must react to a clear with no
 *  panel mounted to re-render. */
export function subscribeUndoNotice(listener: () => void): () => void {
  undoNoticeListeners.add(listener)
  return () => undoNoticeListeners.delete(listener)
}

/** Track the showing undo/redo notice from outside the panel. Null on the server. */
export function useUndoNotice(): UndoNotice | null {
  return useSyncExternalStore(subscribeUndoNotice, getUndoNoticeSnapshot, () => null)
}

export interface UndoNoticeLines {
  headLeft: string
  /** Null when the notice didn't navigate — the head shows no right clause. */
  headRight: string | null
  body: string
  footLeft: string
  /** Null when the notice didn't navigate — the foot shows no separator or
   *  right clause. The board only draws the cross-page case; a same-page
   *  step has no "previous page" worth naming, and ⌘[ (browser back) would
   *  go somewhere else entirely, so "back to {page}" would mislead. */
  footRight: string | null
}

/** The notice panel's four strings, computed from the data alone — so the
 *  "no opened clause" rule is testable without rendering the panel. `apple`
 *  defaults to a live read; a render-time caller should pass `useApplePlatform()`'s
 *  value instead, for the same hydration reason as `formatChord`. */
export function toNoticeLines(
  notice: UndoNotice,
  apple: boolean = isApplePlatform()
): UndoNoticeLines {
  const undoing = notice.direction === 'undo'
  const navigated = Boolean(notice.openedPageTitle)
  const undo = formatChord('mod+z', apple)
  const redo = formatChord('mod+shift+z', apple)
  return {
    headLeft: undoing ? `undo · ${undo}` : `redo · ${redo}`,
    headRight: navigated ? `opened ${notice.openedPageTitle}` : null,
    body: navigated
      ? `${notice.pastTense}. you were on ${notice.previousPageTitle}.`
      : `${notice.pastTense}.`,
    footLeft: undoing ? `redo ${redo}` : `undo ${undo}`,
    footRight: navigated
      ? `back to ${notice.previousPageTitle} ${formatChord('mod+[', apple)}`
      : null,
  }
}

/**
 * "Raise a record's card in the composer" (KAN-152, board `Pond 06.15`
 * s6o4's f4) — the record page's revert button asks; the composer owns the
 * only mounted thread to show the card in, so this stays the same
 * decoupling as `requestTerminalFocus` rather than the record page reaching
 * into `AITerminal`. Carries the RECORD's own id (e.g. the revert
 * `proposeRevert` just raised), not a tool call — the card fetches and
 * renders that record directly.
 */
export const RAISE_RECORD_CARD_EVENT = 'pond:raise-record-card'

export interface RaiseRecordCardDetail {
  recordId: string
}

export function raiseRecordCard(recordId: string) {
  window.dispatchEvent(
    new CustomEvent<RaiseRecordCardDetail>(RAISE_RECORD_CARD_EVENT, { detail: { recordId } })
  )
}

/**
 * "Open the selection bar's link field from ⌘K" (KAN-465). `ShellCommands`
 * asks when ⌘K fires over a live text selection; `SelectionBar` owns the
 * only mounted link field and answers — the same decoupling as
 * `requestComposerToggle`, so `ShellCommands` never imports `SelectionBar`.
 */
export const SELECTION_LINK_EVENT = 'pond:selection-link'

export function requestSelectionLink() {
  window.dispatchEvent(new CustomEvent(SELECTION_LINK_EVENT))
}

/**
 * "Open the pages picker for one block's `move to…`" (KAN-479). The block
 * menu's row asks; `ShellCommands` owns the only mounted `PondCommand` and
 * answers by opening it in block-pick mode — the same decoupling as
 * `requestComposerToggle`, so `BlockCanvas` never imports the shell.
 */
export const BLOCK_MOVE_PICK_EVENT = 'pond:block-move-pick'

export interface BlockMovePickDetail {
  blockId: string
  sourcePageId: string
  /** The block's own eyebrow/kind name, for the picker's `move <label> to…` placeholder. */
  label: string
}

export function requestBlockMovePick(detail: BlockMovePickDetail) {
  window.dispatchEvent(new CustomEvent<BlockMovePickDetail>(BLOCK_MOVE_PICK_EVENT, { detail }))
}
