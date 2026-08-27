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
 *   - `terminal` — compact sans/mono-adjacent treatment for AI chat answers, sized
 *     to sit inside the terminal transcript bubble.
 *
 * Element styling is supplied via `components` (Tailwind classes on the mapped tags)
 * rather than a global `.prose` sheet, so the atom is self-contained and testable.
 */

import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

export type MarkdownVariant = 'reading' | 'terminal'

/** Per-variant Tailwind class map for each rendered markdown element. */
const COMPONENTS: Record<MarkdownVariant, Components> = {
  // ── Page reading view: the Press serif treatment ──────────────────────────
  reading: {
    h1: ({ children }) => (
      <h1 className="font-display text-3xl leading-[1.1] tracking-[-0.01em] text-foreground mt-6 mb-3 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="font-display text-2xl leading-[1.15] tracking-[-0.01em] text-foreground mt-6 mb-2.5 first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="font-serif text-lg font-medium leading-snug text-foreground mt-5 mb-2 first:mt-0">
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className="font-serif text-[1.0625rem] leading-[1.65] text-press-body my-3 first:mt-0 last:mb-0">
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul className="font-serif text-[1.0625rem] leading-[1.6] text-press-body my-3 list-disc pl-5 space-y-1">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="font-serif text-[1.0625rem] leading-[1.6] text-press-body my-3 list-decimal pl-5 space-y-1">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="pl-1">{children}</li>,
    a: ({ children, href }) => (
      <a
        href={href}
        className="text-press-accent underline decoration-press-line underline-offset-2 hover:decoration-press-accent"
      >
        {children}
      </a>
    ),
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    blockquote: ({ children }) => (
      <blockquote className="font-serif italic text-press-muted border-l-2 border-press-line pl-4 my-4">
        {children}
      </blockquote>
    ),
    code: ({ children }) => (
      <code className="font-mono text-[0.85em] bg-press-accent-wash text-foreground rounded px-1 py-0.5">
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="font-mono text-sm bg-press-accent-wash text-foreground rounded-md p-3 my-4 overflow-x-auto">
        {children}
      </pre>
    ),
    hr: () => <hr className="border-0 border-t border-press-line my-6" />,
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-left font-serif text-[0.95rem]">
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border-b border-press-line py-1.5 pr-4 text-sm font-medium text-press-muted">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-b border-press-hair py-1.5 pr-4 text-press-body">{children}</td>
    ),
  },
  // ── Terminal answer: compact, sits inside the chat bubble ──────────────────
  terminal: {
    h1: ({ children }) => (
      <h1 className="text-base font-semibold text-foreground mt-2 mb-1 first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-sm font-semibold text-foreground mt-2 mb-1 first:mt-0">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-sm font-semibold text-foreground mt-2 mb-1 first:mt-0">{children}</h3>
    ),
    p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="my-1.5 list-disc pl-4 space-y-0.5">{children}</ul>,
    ol: ({ children }) => <ol className="my-1.5 list-decimal pl-4 space-y-0.5">{children}</ol>,
    li: ({ children }) => <li>{children}</li>,
    a: ({ children, href }) => (
      <a
        href={href}
        className="underline decoration-press-line underline-offset-2 hover:decoration-current"
      >
        {children}
      </a>
    ),
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    blockquote: ({ children }) => (
      <blockquote className="italic text-press-muted border-l-2 border-press-line pl-3 my-1.5">
        {children}
      </blockquote>
    ),
    code: ({ children }) => (
      <code className="text-[0.85em] bg-press-paper/60 rounded px-1 py-0.5">{children}</code>
    ),
    pre: ({ children }) => (
      <pre className="text-xs bg-press-paper/60 rounded p-2 my-1.5 overflow-x-auto">{children}</pre>
    ),
    hr: () => <hr className="border-0 border-t border-press-line my-2" />,
    table: ({ children }) => (
      <div className="my-1.5 overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border-b border-press-line py-1 pr-3 font-medium text-press-muted">
        {children}
      </th>
    ),
    td: ({ children }) => <td className="border-b border-press-hair py-1 pr-3">{children}</td>,
  },
}

export function Markdown({
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
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS[variant]}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
