/**
 * Jest mock for `@number-flow/react` (ticket-31). The real package is a pure-ESM
 * custom-element wrapper (pulls in `number-flow` → `esm-env`), and next/jest doesn't
 * transpile node_modules, so jsdom suites that transitively import the module
 * registry (→ metric view → NumberFlow) can't load the real one.
 *
 * The metric Storybook story test runs the REAL NumberFlow (vitest browser env,
 * native ESM + custom elements) and asserts the derived VALUE updates through it;
 * the count-up animation itself is not asserted anywhere — it is verified by eye in
 * live checks. This stub just renders the plain number + suffix so jsdom assertions
 * on the derived value stay meaningful without pulling the custom-element chain into
 * the jest transformer.
 */
export default function NumberFlow({
  value,
  prefix,
  suffix,
}: {
  value: number
  prefix?: string
  suffix?: string
}) {
  return (
    <>
      {prefix ?? ''}
      {value}
      {suffix ?? ''}
    </>
  )
}
