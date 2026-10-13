import type { MouseEventHandler, ReactNode } from 'react'
import type { Mark, Node as ProseNode } from '@tiptap/pm/model'
import { isProseMarkName, numberAttr, stringAttr } from './document'
import { parseMarkdown } from './markdown'
import { TEXT_PROSE_CLASS, textPlaceholderFor } from './prose'

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

const renderMark = (mark: Mark, children: ReactNode[], key: number): ReactNode => {
  const { name } = mark.type
  if (!isProseMarkName(name)) throw new Error(`a text block has no \`${name}\` mark`)
  switch (name) {
    case 'bold':
      return <strong key={key}>{children}</strong>
    case 'italic':
      return <em key={key}>{children}</em>
    case 'strike':
      return <s key={key}>{children}</s>
    case 'code':
      return <code key={key}>{children}</code>
    case 'link':
      return (
        <a
          key={key}
          href={stringAttr(mark.attrs, 'href') ?? undefined}
          title={stringAttr(mark.attrs, 'title') ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      )
    default: {
      const unhandled: never = name
      return unhandled
    }
  }
}

/**
 * Inline content with each mark drawn once across the run of nodes that share it
 * (a link over bold and plain text is one anchor), outermost mark first — the
 * nesting the editor's own DOM has.
 */
const renderInline = (nodes: readonly ProseNode[], depth = 0): ReactNode[] => {
  const rendered: ReactNode[] = []
  let start = 0
  while (start < nodes.length) {
    const node = nodes[start]
    const mark = node.marks[depth]
    if (!mark) {
      rendered.push(node.isText ? node.text : <br key={start} />)
      start += 1
      continue
    }
    let end = start + 1
    while (end < nodes.length && nodes[end].marks[depth]?.eq(mark)) end += 1
    rendered.push(renderMark(mark, renderInline(nodes.slice(start, end), depth + 1), start))
    start = end
  }
  return rendered
}

/** An empty line keeps its height, as the editor's trailing break does. */
const renderTextblock = (node: ProseNode): ReactNode =>
  node.childCount === 0 ? <br /> : renderInline(node.content.content)

/** The editor's placeholder decoration on a blank block's line, drawn the same. */
const placeholderProps = (placeholder: string | null) =>
  placeholder === null
    ? {}
    : { className: 'is-empty is-editor-empty', 'data-placeholder': placeholder }

const renderBlock = (node: ProseNode, key: number, placeholder: string | null): ReactNode => {
  const renderChildren = () =>
    node.content.content.map((child, index) => renderBlock(child, index, null))
  switch (node.type.name) {
    case 'paragraph':
      return (
        <p key={key} {...placeholderProps(placeholder)}>
          {renderTextblock(node)}
        </p>
      )
    case 'heading': {
      const Heading = HEADING_TAGS[(numberAttr(node.attrs, 'level') ?? 1) - 1] ?? 'h1'
      return (
        <Heading key={key} {...placeholderProps(placeholder)}>
          {renderTextblock(node)}
        </Heading>
      )
    }
    case 'bulletList':
      return <ul key={key}>{renderChildren()}</ul>
    case 'orderedList': {
      const start = numberAttr(node.attrs, 'start') ?? 1
      return (
        <ol key={key} start={start === 1 ? undefined : start}>
          {renderChildren()}
        </ol>
      )
    }
    case 'listItem':
      return <li key={key}>{renderChildren()}</li>
    case 'blockquote':
      return <blockquote key={key}>{renderChildren()}</blockquote>
    case 'codeBlock': {
      const language = stringAttr(node.attrs, 'language')
      return (
        <pre key={key}>
          <code className={language ? `language-${language}` : undefined}>{node.textContent}</code>
        </pre>
      )
    }
    case 'horizontalRule':
      return <hr key={key} />
    default:
      return null
  }
}

/** Empty as the editor judges a document: no text and no leaf anywhere in it. */
const isBlank = (node: ProseNode): boolean =>
  node.isText ? !node.text : !node.isLeaf && node.content.content.every(isBlank)

/**
 * The editor marks the line its caret is on, and a blank block opens with the
 * caret in its first line — when that is a line, not a list or a quote.
 */
const placeholderOf = (doc: ProseNode, placeholder?: string | null): string | null => {
  const line = doc.firstChild
  if (!line?.isTextblock || !isBlank(doc)) return null
  return textPlaceholderFor(line.type.name, placeholder)
}

/**
 * A text block's markdown, drawn from the same parsed document the editor edits,
 * with no editor: it renders on the server and paints at once. `showPlaceholder`
 * draws a blank block's line the way the editor's placeholder does — `placeholder`
 * is the block's own copy, falling back to the line's generic empty copy when the
 * block carries none.
 */
export const StaticProse = ({
  content,
  className = TEXT_PROSE_CLASS,
  showPlaceholder = false,
  placeholder,
  onMouseDown,
}: {
  content: string
  className?: string
  showPlaceholder?: boolean
  placeholder?: string | null
  onMouseDown?: MouseEventHandler
}) => {
  const doc = parseMarkdown(content)
  const firstLine = showPlaceholder ? placeholderOf(doc, placeholder) : null
  return (
    <div className="w-full" onMouseDown={onMouseDown}>
      <div data-text-prose className={className}>
        {doc.content.content.map((block, index) =>
          renderBlock(block, index, index === 0 ? firstLine : null)
        )}
      </div>
    </div>
  )
}
