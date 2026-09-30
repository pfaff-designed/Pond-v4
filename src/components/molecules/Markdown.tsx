'use client'

/**
 * Markdown — the one rendered-reading primitive (ticket-20). Turns markdown source
 * into typeset output so no surface shows literal `##`, `**bold**`, `---`, or pipe
 * tables again. react-markdown never emits raw HTML (no rehype-raw is wired), so
 * the output is XSS-safe by construction — arbitrary HTML in the source renders as
 * inert text, not markup.
 *
 * Two variants, one type world:
 *   - `reading` (default) — Press serif prose for page content, matching the
 *     overview surfaces' quality bar (Fraunces body, larger measure, generous leading).
 *     Single newlines are hard breaks (remark-breaks): user-typed notes with plain
 *     line breaks keep their lines, matching the old whitespace-pre-wrap behavior.
 *   - `terminal` — compact sans/mono-adjacent treatment for AI chat answers, sized
 *     to sit inside the terminal transcript bubble. Standard markdown newline rules
 *     (the AI authors real markdown with double-newline paragraphs).
 *
 * Element styling is supplied via `components` (Tailwind classes on the mapped tags)
 * rather than a global `.prose` sheet, so the molecule is self-contained and testable.
 * Memoized: the terminal re-renders the whole transcript on every streamed token,
 * and only the growing message's source should re-parse.
 */

import { memo } from 'react'
import ReactMarkdown, { type Components, type Options } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

export type MarkdownVariant = 'reading' | 'terminal'

/** The shared Press serif voice both prose treatments are built from — one base,
 *  two scales, so the two variants cannot drift into different type worlds. */
const PROSE_BASE_CLASS = 'font-serif font-extralight text-mn-text-meta'

/**
 * The Press reading-prose text treatment, shared by every flow element of the
 * `reading` variant — and by the text module's source textarea, so flipping between
 * read and edit doesn't shift the type.
 */
export const READING_PROSE_CLASS = `${PROSE_BASE_CLASS} text-[1.0625rem] leading-[1.65]`

/**
 * The same Press serif voice, scaled down one step for the terminal drawer
 * (ticket-32): the AI reply is typeset correspondence, not a mono console line.
 * Derived from {@link PROSE_BASE_CLASS} alongside READING_PROSE_CLASS.
 */
export const TERMINAL_PROSE_CLASS = `${PROSE_BASE_CLASS} text-[0.95rem] leading-[1.6]`

/** Elements identical across variants (inline emphasis carries no size of its own). */
const SHARED_COMPONENTS: Components = {
  strong: ({ children }) => <strong className="font-extrabold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
}

/** Per-variant Tailwind class map for each rendered markdown element. */
const COMPONENTS: Record<MarkdownVariant, Components> = {
  // ── Page reading view: the Press serif treatment ──────────────────────────
  reading: {
    ...SHARED_COMPONENTS,
    h1: ({ children }) => (
      <h1 className="font-display font-extrabold text-3xl leading-tight tracking-[-0.01em] text-foreground mt-6 mb-3 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="font-display font-extrabold text-2xl leading-[1.15] tracking-[-0.01em] text-foreground mt-6 mb-2.5 first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="font-serif text-lg font-extrabold leading-snug text-foreground mt-5 mb-2 first:mt-0">
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className={`${READING_PROSE_CLASS} my-3 first:mt-0 last:mb-0`}>{children}</p>
    ),
    ul: ({ children }) => (
      <ul className={`${READING_PROSE_CLASS} leading-[1.6] my-3 list-disc pl-5 space-y-1`}>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className={`${READING_PROSE_CLASS} leading-[1.6] my-3 list-decimal pl-5 space-y-1`}>
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="pl-1">{children}</li>,
    // New tab + noopener: content links are outbound, and inside the click-to-edit
    // wrapper a same-tab navigation would tear down the page mid-edit-toggle.
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
      <blockquote className="font-serif font-extralight italic text-mn-text-secondary border-l-2 border-mn-line pl-4 my-4">
        {children}
      </blockquote>
    ),
    code: ({ children }) => (
      <code className="font-mono text-[0.85em] bg-mn-wash text-foreground rounded-mn-chrome px-1 py-0.5">
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="font-mono text-sm bg-mn-wash text-foreground rounded-mn-row p-3 my-4 overflow-x-auto">
        {children}
      </pre>
    ),
    hr: () => <hr className="border-0 border-t border-mn-line my-6" />,
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-left font-sans text-[0.95rem]">
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border-b border-mn-line py-1.5 pr-4 text-sm font-medium text-mn-text-secondary">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-b border-mn-hair py-1.5 pr-4 text-mn-text-meta">{children}</td>
    ),
  },
  // ── Terminal answer: the Press serif reading treatment, scaled for the drawer ─
  // (ticket-32) — the AI reply is an authored letter, not a mono console line. Shares
  // the reading variant's serif/leading and its page-block table/list language, one
  // step down in size. Structured content (tables/lists) renders in the same visual
  // language as saved page blocks so a reply and a saved page feel like one system.
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

/** remark-breaks only in `reading`: user notes keep plain line breaks as lines. */
const PLUGINS: Record<MarkdownVariant, Options['remarkPlugins']> = {
  reading: [remarkGfm, remarkBreaks],
  terminal: [remarkGfm],
}

export const Markdown = memo(function Markdown({
  children,
  variant = 'reading',
  className = '',
}: {
  children: string
  variant?: MarkdownVariant
  className?: string
}) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={PLUGINS[variant]} components={COMPONENTS[variant]}>
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
