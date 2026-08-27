/**
 * Jest mock for `react-markdown` (ticket-20). The real package is pure ESM and
 * next/jest doesn't transpile node_modules, so jsdom suites that transitively import
 * the module registry (→ text view → Markdown atom) can't load the real one.
 *
 * Typeset markdown rendering is verified by the Storybook story tests (which run in
 * the vitest browser env where ESM is native), not by jest — so this stub just emits
 * the raw source. That keeps content-presence assertions meaningful without pulling
 * the remark/rehype ESM chain into the jest transformer.
 */
export default function ReactMarkdown({ children }: { children?: string }) {
  return <>{children}</>
}
