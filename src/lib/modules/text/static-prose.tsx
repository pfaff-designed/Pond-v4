import { Fragment, type ReactNode } from 'react'
import type { Mark, Node as ProseNode } from '@tiptap/pm/model'
import { parseMarkdown } from './markdown'
import { TEXT_PROSE_CLASS } from './prose'

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

const renderMark = (mark: Mark, children: ReactNode[], key: number): ReactNode => {
  switch (mark.type.name) {
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
          href={mark.attrs.href ?? undefined}
          title={mark.attrs.title ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      )
    default:
      return <Fragment key={key}>{children}</Fragment>
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

const renderBlock = (node: ProseNode, key: number, placeholder: string | null): ReactNode => {
  const renderChildren = () =>
    node.content.content.map((child, index) => renderBlock(child, index, null))
  switch (node.type.name) {
    case 'paragraph': {
      if (placeholder === null || node.childCount > 0) {
        return <p key={key}>{renderTextblock(node)}</p>
      }
      return (
        <p key={key} className="is-empty is-editor-empty" data-placeholder={placeholder}>
          {renderTextblock(node)}
        </p>
      )
    }
    case 'heading': {
      const Heading = HEADING_TAGS[node.attrs.level - 1] ?? 'h1'
      return <Heading key={key}>{renderTextblock(node)}</Heading>
    }
    case 'bulletList':
      return <ul key={key}>{renderChildren()}</ul>
    case 'orderedList':
      return (
        <ol key={key} start={node.attrs.start === 1 ? undefined : node.attrs.start}>
          {renderChildren()}
        </ol>
      )
    case 'listItem':
      return <li key={key}>{renderChildren()}</li>
    case 'blockquote':
      return <blockquote key={key}>{renderChildren()}</blockquote>
    case 'codeBlock':
      return (
        <pre key={key}>
          <code className={node.attrs.language ? `language-${node.attrs.language}` : undefined}>
            {node.textContent}
          </code>
        </pre>
      )
    case 'horizontalRule':
      return <hr key={key} />
    default:
      return null
  }
}

const isBlank = (doc: ProseNode): boolean =>
  doc.childCount === 1 &&
  doc.firstChild?.type.name === 'paragraph' &&
  doc.firstChild.childCount === 0

/**
 * A text block's markdown, drawn from the same parsed document the editor edits,
 * with no editor: it renders on the server and paints at once. `placeholder` marks
 * a blank block's line the way the editor's placeholder does.
 */
export const StaticProse = ({
  content,
  className = TEXT_PROSE_CLASS,
  placeholder,
}: {
  content: string
  className?: string
  placeholder?: string
}) => {
  const doc = parseMarkdown(content)
  const blankLine = placeholder !== undefined && isBlank(doc) ? placeholder : null
  return (
    <div className="w-full">
      <div data-text-prose className={className}>
        {doc.content.content.map((block, index) => renderBlock(block, index, blankLine))}
      </div>
    </div>
  )
}
