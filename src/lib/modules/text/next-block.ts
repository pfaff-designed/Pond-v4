import type { Node as ProseNode, ResolvedPos } from '@tiptap/pm/model'
import { NodeSelection, Selection, type EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { serializeMarkdown } from './markdown'

/** The depth of the nearest ancestor (caret outward) of type `typeName`, or null. */
const ancestorDepth = ($pos: ResolvedPos, typeName: string): number | null => {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if ($pos.node(depth).type.name === typeName) return depth
  }
  return null
}

/**
 * Whether `node` holds no leaf content at all: an empty textblock, or a
 * wrapper (blockquote, list, …) whose every descendant is itself such an
 * empty textblock. A leaf like a horizontal rule has empty `textContent` too
 * but is real content, never this.
 */
const isCutArtifact = (node: ProseNode): boolean => {
  if (node.isTextblock) return node.content.size === 0
  if (node.isLeaf || node.childCount === 0) return false
  let allArtifacts = true
  node.forEach((child) => {
    if (!isCutArtifact(child)) allArtifacts = false
  })
  return allArtifacts
}

/**
 * `doc` with the boundary artifact `Node.cut` leaves at `edge` dropped: cutting
 * exactly at a block's own edge severs it into an otherwise-empty shell of its
 * original type — an empty textblock, or a wrapper around nothing but empty
 * textblocks — sitting next to the real content. Only ever one such node, so
 * only the outermost child is checked.
 */
const trimCutArtifact = (doc: ProseNode, edge: 'leading' | 'trailing'): ProseNode => {
  const child = edge === 'leading' ? doc.firstChild : doc.lastChild
  if (!child || !isCutArtifact(child)) return doc
  const content =
    edge === 'leading'
      ? doc.content.cut(child.nodeSize)
      : doc.content.cut(0, doc.content.size - child.nodeSize)
  return doc.copy(content)
}

/**
 * What a plain Enter does to a text block's doc at the caret, as the markdown
 * either side of it. `'own'` lets ProseMirror's own Enter handling run instead
 * (a code block's newline, the next item in a non-empty list, a selected node
 * like a horizontal rule); `'stay'` does nothing (an empty, unwrapped block —
 * one write, not two. This holds even for a labelled empty block, matching
 * KAN-345's one-empty-line rule). `'lift'` turns a lone empty quote or list
 * item back to plain prose, as Notion does (KAN-462): the doc has no text
 * anywhere and the caret's textblock sits inside a blockquote or listItem, so
 * there is nothing to split and no reason to trap the person inside it.
 */
export const enterSplit = (
  state: EditorState
): { before: string; after: string } | 'own' | 'stay' | 'lift' => {
  const { doc, selection } = state
  const { $from, from, to } = selection
  if (selection instanceof NodeSelection) return 'own'
  if (ancestorDepth($from, 'codeBlock') !== null) return 'own'
  const listItemDepth = ancestorDepth($from, 'listItem')
  if (listItemDepth !== null) {
    if ($from.node(listItemDepth).textContent !== '') return 'own'
    const beforeDoc = doc.cut(0, $from.before(listItemDepth))
    const afterDoc = doc.cut($from.after(listItemDepth))
    if (beforeDoc.textContent === '' && afterDoc.textContent === '') return 'lift'
    return {
      before: serializeMarkdown(beforeDoc),
      after: serializeMarkdown(afterDoc),
    }
  }
  if (doc.textContent === '')
    return ancestorDepth($from, 'blockquote') !== null ? 'lift' : 'stay'
  return {
    before: serializeMarkdown(trimCutArtifact(doc.cut(0, from), 'trailing')),
    after: serializeMarkdown(trimCutArtifact(doc.cut(to), 'leading')),
  }
}

/**
 * Whether ArrowUp at the caret should leave the block upward to the page
 * title (KAN-464), rather than move within it: the caret's textblock is the
 * doc's very first textblock — every ancestor index along `$from` is 0, so a
 * list item 2, a quote's second paragraph, and so on all stay inside the
 * block even though they share the doc's top-level index 0 — AND
 * ProseMirror's own layout says there is no visual line above it.
 */
export const leavesUpToTitle = (view: EditorView): boolean => {
  const { selection } = view.state
  if (!selection.empty) return false
  return (
    selection.$from.start() === Selection.atStart(view.state.doc).$from.start() &&
    view.endOfTextblock('up')
  )
}
