import type { ResolvedPos } from '@tiptap/pm/model'
import { Node, Slice } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { parseMarkdown } from './markdown'

const BLOCK_SIGNAL = /^ {0,3}(#{1,6}(\s|$)|[-*] |\d+\. |> |```|~~~)/

/** Any line starting a block signal, or an inline one anywhere in the text. */
export const looksLikeMarkdown = (text: string): boolean => {
  if (text.split('\n').some((line) => BLOCK_SIGNAL.test(line))) return true
  return /\*\*[^*]+\*\*|(?<![\w*])_[^_]+_(?![\w*])|\[[^\]]+\]\([^)]+\)/.test(text)
}

/**
 * Builds the slice `markdownHandlePaste` dispatches for a markdown-looking paste: the
 * text is read through the same parser a text block's `content` loads through, so a
 * paste and a saved-then-reloaded document are identical. A code block never reads
 * pasted text as markup.
 */
export const parseMarkdownPaste = (text: string, $context: ResolvedPos): Slice | undefined => {
  if ($context.parent.type.name === 'codeBlock' || !looksLikeMarkdown(text)) {
    return undefined
  }
  // `parseMarkdown` builds nodes against its own standalone schema (`document.ts`),
  // a different instance from the live editor's — a `Slice` built straight from its
  // content won't fit this document's schema and silently replaces with nothing.
  // Round-tripping through JSON rebuilds the nodes against `$context`'s own schema.
  const parsed = Node.fromJSON($context.doc.type.schema, parseMarkdown(text).toJSON())
  const opened = Slice.maxOpen(parsed.content)
  // An open start merges the slice's first node into the caret's own block; an open
  // end merges its last node into whatever follows the caret, carrying the caret's
  // trailing text along with it. Right for inline text continuing the current line
  // on either side — wrong for a block (heading, list, blockquote, code block):
  // opening that end splices its own wrapper away, leaving its content merged into
  // the surrounding block instead of landing as its own block. Close whichever side
  // isn't a paragraph so that side splits instead of merging.
  return new Slice(
    parsed.content,
    parsed.content.firstChild?.type.name === 'paragraph' ? opened.openStart : 0,
    parsed.content.lastChild?.type.name === 'paragraph' ? opened.openEnd : 0
  )
}

/**
 * A copy from a terminal or plain-text editor often carries a `text/html` payload
 * that is just its `text/plain` wrapped in one bare element (VS Code: a styled
 * `<pre>`; some terminals: a `<div>`/`<span>`) — not real rich text. Anything with
 * its own nested markup (a heading, a list, a link) is real HTML and is left alone.
 */
const isPlainTextWrapper = (html: string, text: string): boolean => {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  const wrapper = body.firstElementChild
  if (body.children.length !== 1 || !wrapper) return false
  if (!['PRE', 'DIV', 'SPAN'].includes(wrapper.tagName)) return false
  if (wrapper.querySelector('*')) return false
  return wrapper.textContent === text
}

/**
 * PM tracks Shift held during a native paste on this field (there is no public API
 * for it, and a `ClipboardEvent` never carries modifier keys) — prosemirror-view's
 * own keydown/keyup handler sets `view.input.shiftKey` from the DOM event.
 */
const shiftHeld = (view: EditorView): boolean =>
  (view as unknown as { input: { shiftKey: boolean } }).input.shiftKey

/**
 * `editorProps.handlePaste`: the one path for a markdown paste, text/plain-only or
 * html-wrapper-only — `clipboardTextParser` itself can't own this, because
 * ProseMirror's own paste command dispatches whatever slice it produced, parser or
 * not, tagged `uiEvent: 'paste'`; Tiptap's paste-rule plugin reruns every enabled
 * mark's paste rule (Link) over any transaction carrying that tag, which relinks a
 * parsed `[text](url)` run by its visible text (@tiptap/core dist index.js ~5272).
 * Dispatching here instead, untagged, keeps the parsed slice final. Real rich HTML,
 * text that doesn't look like markdown, and a shift-held (literal) paste all return
 * `false` and fall through to ProseMirror's own built-in plain-text parse — which
 * still runs Link's paste rule, so a bare URL pasted there still links.
 */
export const markdownHandlePaste = (view: EditorView, event: ClipboardEvent): boolean => {
  if (shiftHeld(view)) return false
  const data = event.clipboardData
  const text = data?.getData('text/plain')
  if (!text) return false
  const html = data?.getData('text/html')
  if (html && !isPlainTextWrapper(html, text)) return false
  const parsed = parseMarkdownPaste(text, view.state.selection.$from)
  if (!parsed) return false
  view.dispatch(view.state.tr.replaceSelection(parsed).scrollIntoView())
  return true
}
