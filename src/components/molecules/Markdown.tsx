'use client'

/**
 * Markdown — a composer answer, typeset. Turns the answer's markdown source into
 * the thread's answer voice so no answer shows literal `##`, `**bold**`, `---`, or
 * pipe tables. react-markdown never emits raw HTML (no rehype-raw is wired), so
 * the output is XSS-safe by construction — arbitrary HTML in the source renders as
 * inert text, not markup.
 *
 * A text block is not rendered here: it is its own typeset document
 * (`lib/modules/text`), read by one parse on the page and in the diff card alike.
 *
 * Element styling is supplied via `components` (Tailwind classes on the mapped tags)
 * rather than a global `.prose` sheet, so the molecule is self-contained and testable.
 * Memoized: the composer re-renders the whole thread on every streamed token,
 * and only the growing message's source should re-parse.
 */

import { memo } from 'react'
import ReactMarkdown, { type Components, type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { answerComponents } from './markdown-answer'

/** The composer answer voice — the sans at 15px / 1.6, never the serif.
 *  Defined in markdown-answer.tsx; re-exported so the molecule stays the one import. */
export { ANSWER_PROSE_CLASS } from './markdown-answer'

/** The structure the answer voice is laid over: emphasis, links, code, rules, tables. */
const STRUCTURE_COMPONENTS: Components = {
  em: ({ children }) => <em className="italic">{children}</em>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-mn-text underline decoration-mn-line underline-offset-2 hover:decoration-mn-text"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="font-mono text-[0.8em] bg-mn-wash text-foreground rounded-mn-chrome px-1 py-0.5">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="font-mono text-xs bg-mn-wash text-foreground rounded-mn-row p-2.5 my-2 overflow-x-auto">
      {children}
    </pre>
  ),
  hr: () => <hr className="border-0 border-t border-mn-line my-3" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-left font-sans text-[0.875rem]">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-mn-line py-1.5 pr-3 text-xs font-medium text-mn-text-secondary">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-mn-hair py-1.5 pr-3 text-mn-text-meta">{children}</td>
  ),
}

const COMPONENTS = answerComponents(STRUCTURE_COMPONENTS)

const REMARK_PLUGINS: Options['remarkPlugins'] = [remarkGfm]

export const Markdown = memo(function Markdown({
  children,
  className = '',
}: {
  children: string
  className?: string
}) {
  return (
    <div className={className} data-variant="answer">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  )
})

/**
 * Inline-only markdown renderer (Fix-4 / F8) — renders bold, italic, inline
 * code, and links without any block elements (no `<p>`, `<h1>`, lists, etc.).
 *
 * Use for surfaces where content is a single line or short fragment: todo item
 * labels, table cell display text. Block-level constructs (headings, paragraphs,
 * fences) degrade gracefully — the block wrapper is stripped and the text content
 * survives, so a stray `##` heading in a cell shows as plain text rather than a
 * `<h1>` breaking layout.
 *
 * Not memoized by default (the caller usually does that in a list render); wrap
 * with React.memo at the call site if needed.
 */
const INLINE_COMPONENTS: Components = {
  // Strip block wrappers — render their children inline so headings, blockquotes,
  // and paragraph wrappers don't introduce block-level DOM nodes.
  p: ({ children }) => <>{children}</>,
  h1: ({ children }) => <>{children}</>,
  h2: ({ children }) => <>{children}</>,
  h3: ({ children }) => <>{children}</>,
  h4: ({ children }) => <>{children}</>,
  h5: ({ children }) => <>{children}</>,
  h6: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => <>{children}</>,
  ul: ({ children }) => <>{children}</>,
  ol: ({ children }) => <>{children}</>,
  li: ({ children }) => <>{children}</>,
  hr: () => null,
  pre: ({ children }) => <>{children}</>,
  // Keep inline emphasis as styled spans.
  strong: ({ children }) => <strong className="font-extrabold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="font-mono text-[0.85em] bg-mn-wash text-foreground rounded-mn-chrome px-1 py-0.5">
      {children}
    </code>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-mn-text underline decoration-mn-line underline-offset-2 hover:decoration-mn-text"
    >
      {children}
    </a>
  ),
}

export function MarkdownInline({
  children,
  className = '',
}: {
  children: string
  className?: string
}) {
  return (
    <span className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={INLINE_COMPONENTS}>
        {children}
      </ReactMarkdown>
    </span>
  )
}
