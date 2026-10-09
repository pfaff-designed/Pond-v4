'use client'

/**
 * Markdown — the one rendered-reading primitive (ticket-20). Turns markdown source
 * into typeset output so no surface shows literal `##`, `**bold**`, `---`, or pipe
 * tables again. react-markdown never emits raw HTML (no rehype-raw is wired), so
 * the output is XSS-safe by construction — arbitrary HTML in the source renders as
 * inert text, not markup.
 *
 * Two variants:
 *   - `terminal` (default) — compact serif treatment for diff bodies and the
 *     terminal transcript bubble. Standard markdown newline rules (the AI authors
 *     real markdown with double-newline paragraphs).
 *   - `answer` — the composer answer voice, derived from `terminal`.
 *
 * Page prose is not rendered here: a text block is its own typeset document
 * (`lib/modules/text`), read-only or editable.
 *
 * Element styling is supplied via `components` (Tailwind classes on the mapped tags)
 * rather than a global `.prose` sheet, so the molecule is self-contained and testable.
 * Memoized: the terminal re-renders the whole transcript on every streamed token,
 * and only the growing message's source should re-parse.
 */

import { memo } from 'react'
import ReactMarkdown, { type Components, type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { answerComponents } from './markdown-answer'

export type MarkdownVariant = 'terminal' | 'answer'

/**
 * The serif voice scaled for the terminal drawer (ticket-32): the AI reply is
 * typeset correspondence, not a mono console line. FULL ink: `PondAtom.dc.html`
 * sets the prose atom at fg; .8 is the small-meta tier and was never a prose
 * value (#220).
 */
export const TERMINAL_PROSE_CLASS =
  'font-serif font-extralight text-mn-text text-[0.95rem] leading-[1.6]'

/** The composer answer voice — the sans at 15px / 1.6, never the serif.
 *  Defined in markdown-answer.tsx; re-exported so the molecule stays the one import. */
export { ANSWER_PROSE_CLASS } from './markdown-answer'

/** Elements identical across variants (inline emphasis carries no size of its own). */
const SHARED_COMPONENTS: Components = {
  strong: ({ children }) => <strong className="font-extrabold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
}

/** Per-variant Tailwind class map for each rendered markdown element. The
 *  `answer` map is derived from `terminal` just below the literal. */
const BASE_COMPONENTS: Record<Exclude<MarkdownVariant, 'answer'>, Components> = {
  // ── Terminal answer: the serif, scaled for the drawer (ticket-32) — the AI
  // reply is an authored letter, not a mono console line.
  terminal: {
    ...SHARED_COMPONENTS,
    h1: ({ children }) => (
      <h1 className="font-display font-extrabold text-xl leading-[1.15] tracking-[-0.01em] text-foreground mt-3 mb-1.5 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="font-display font-extrabold text-lg leading-[1.2] tracking-[-0.01em] text-foreground mt-3 mb-1.5 first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="font-serif text-base font-extrabold leading-snug text-foreground mt-2.5 mb-1 first:mt-0">
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className={`${TERMINAL_PROSE_CLASS} my-2 first:mt-0 last:mb-0`}>{children}</p>
    ),
    ul: ({ children }) => (
      <ul className={`${TERMINAL_PROSE_CLASS} my-2 list-disc pl-5 space-y-1`}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className={`${TERMINAL_PROSE_CLASS} my-2 list-decimal pl-5 space-y-1`}>{children}</ol>
    ),
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
    blockquote: ({ children }) => (
      <blockquote className="font-serif font-extralight italic text-mn-text-secondary border-l-2 border-mn-line pl-3 my-2">
        {children}
      </blockquote>
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
  },
}

// ── Composer answer (#97): the terminal map in the sans voice — see markdown-answer.
const COMPONENTS: Record<MarkdownVariant, Components> = {
  ...BASE_COMPONENTS,
  answer: answerComponents(BASE_COMPONENTS.terminal),
}

const REMARK_PLUGINS: Options['remarkPlugins'] = [remarkGfm]

export const Markdown = memo(function Markdown({
  children,
  variant = 'terminal',
  className = '',
}: {
  children: string
  variant?: MarkdownVariant
  className?: string
}) {
  return (
    <div className={className} data-variant={variant}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS[variant]}>
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
