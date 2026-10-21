import type { Editor } from '@tiptap/react'
import { redoDepth, undoDepth } from '@tiptap/pm/history'
import { EditorState } from '@tiptap/pm/state'
import { serializeMarkdown } from './markdown'

/** Every mounted text block's editor, keyed by its block id, so a document-level surface can reach the one under a selection or one named by id. */
const editors = new Map<Editor, string>()

type RegisteredListener = (editor: Editor, blockId: string) => void
const registeredListeners = new Set<RegisteredListener>()

/**
 * Fires every time a text block's editor registers — including a remount
 * (navigating away and back re-creates the editor with fresh, empty plugin
 * state). A document-level surface that pushes state into a block's plugins
 * (e.g. reference highlights) subscribes once here instead of only reacting
 * to its own state changing, which a remount wouldn't otherwise trigger.
 */
export const onTextEditorRegistered = (listener: RegisteredListener): (() => void) => {
  registeredListeners.add(listener)
  return () => registeredListeners.delete(listener)
}

/** Called by a text block's editor on mount. Call the return to unregister on destroy. `blockId` is optional for callers (tests) that only need selection lookup. */
export const registerTextEditor = (editor: Editor, blockId = ''): (() => void) => {
  editors.set(editor, blockId)
  registeredListeners.forEach((listener) => listener(editor, blockId))
  return () => editors.delete(editor)
}

/** A `Selection`'s anchor, or a node standing in for one. */
const anchorOf = (at: Selection | Node): Node | null =>
  at instanceof Node ? at : at.anchorNode

/** The registered editor whose `view.dom` contains the selection's anchor, or null. */
export const editorForSelection = (at: Selection | Node): Editor | null => {
  const anchor = anchorOf(at)
  if (!anchor) return null
  for (const editor of editors.keys()) {
    if (editor.view.dom.contains(anchor)) return editor
  }
  return null
}

/**
 * The registered, editable text-block editor that owns a whole selection —
 * both its anchor and its focus — or null if no single registered editor
 * contains both, or the editor that does can't be written to.
 */
export const editableEditorForSelection = (sel: Selection): Editor | null => {
  const { anchorNode, focusNode } = sel
  if (!anchorNode || !focusNode) return null
  for (const editor of editors.keys()) {
    if (editor.view.dom.contains(anchorNode) && editor.view.dom.contains(focusNode)) {
      return editor.isEditable ? editor : null
    }
  }
  return null
}

/** The registered editor for a given block id, or null if that block isn't mounted. */
export const editorForBlock = (blockId: string): Editor | null => {
  for (const [editor, id] of editors) {
    if (id === blockId) return editor
  }
  return null
}

/**
 * Wipes `blockId`'s mounted editor's own undo/redo stacks (KAN-139, comment
 * 10064) — called once the page's debounced save is durable (the record is
 * logged), so a ⌘Z pressed afterward finds nothing of the field's own left to
 * undo and falls through to the shell's change-log undo instead of rewinding
 * text the save already made durable. `closeHistory` only stops a FUTURE
 * transaction from merging into the typing just saved; it leaves that typing
 * itself on the stack, still one ⌘Z away, so clearing it needs a fresh state
 * instead. Recreating the state re-inits every plugin (placeholder, reference
 * highlight, slash-line) from the current doc, same as a remount — none of
 * them hold anything that has to survive a committed save. No-op if the
 * block isn't mounted (navigated away, or not a text block).
 *
 * `savedContent`, when given, guards against the save's own round trip: if
 * the field has moved on to content other than what this save wrote (more
 * typing landed before the record finished logging), closing history now
 * would throw away the undo for THOSE keystrokes, which were never part of
 * this save. Skipped in that case — the next save's own commit will close it.
 */
export const closeBlockHistory = (blockId: string, savedContent?: string): void => {
  const editor = editorForBlock(blockId)
  if (!editor) return
  if (savedContent !== undefined && serializeMarkdown(editor.state.doc) !== savedContent) return
  const { state } = editor.view
  editor.view.updateState(
    EditorState.create({
      schema: state.schema,
      doc: state.doc,
      selection: state.selection,
      plugins: state.plugins,
    })
  )
}

/**
 * True when `element` sits inside a mounted text block's editor that has
 * nothing left on its own undo/redo stack for `direction` — the signal the
 * shell (`ShellCommands`) uses to let ⌘Z/⇧⌘Z fall through to the change-log
 * step once `closeBlockHistory` has emptied a just-committed field. False for
 * every other editable (an input, a select, a text block that still has
 * history), so their chord stays with the field.
 */
export const editorHistoryEmptyFor = (
  element: Element | null,
  direction: 'undo' | 'redo'
): boolean => {
  if (!element) return false
  const editor = editorForSelection(element)
  if (!editor) return false
  const depth = direction === 'undo' ? undoDepth(editor.state) : redoDepth(editor.state)
  return depth === 0
}
