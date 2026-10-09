import type { Components } from 'react-markdown'

/**
 * Jest mock for `react-markdown` (ticket-20). The real package is pure ESM and
 * next/jest doesn't transpile node_modules, so jsdom suites that transitively import
 * the composer (→ Markdown molecule) can't load the real one.
 *
 * Typeset markdown rendering is verified by the Storybook story tests (which run in
 * the vitest browser env where ESM is native), not by jest — so this stub emits the
 * raw source as one paragraph, through the caller's own `p`. That keeps
 * content-presence assertions meaningful, and the paragraph's voice the caller's,
 * without pulling the remark/rehype ESM chain into the jest transformer.
 */
export default function ReactMarkdown({
  children,
  components,
}: {
  children?: string
  components?: Components
}) {
  const Paragraph = components?.p ?? 'p'
  return <Paragraph>{children}</Paragraph>
}
