/**
 * One factory for every test's `jest.mock('@/lib/pages/commit', ...)`. `createPageWriter`'s
 * returned writer mirrors the real module's contract: on a typed op it calls the mocked
 * `@/lib/pages/client`'s `updateTitle` first, then always calls `commitBlocks` with the
 * own-edit opts — so every test sees the same call order the real writer produces. It also
 * forwards `commitBlocks`'s resolved `remembered` (if any) to the queue's `settle` side
 * channel, same as the real writer — so a test whose `commitBlocks` mock resolves
 * `{ remembered }` gets the same `drained()`/`flushNow()` timing as production, without
 * every file needing to know the queue's settle contract.
 *
 * Pass `overrides.commitBlocks` as a closure (`(...args) => mockCommitBlocks(...args)`), not a
 * bare reference to an outer `const` — `jest.mock`'s factory runs hoisted, before that `const`
 * initializes.
 */
export function pageCommitMock(overrides: { commitBlocks?: (...args: unknown[]) => unknown } = {}) {
  const commitBlocks = overrides.commitBlocks ?? jest.fn().mockResolvedValue(undefined)

  const createPageWriter =
    (...writerArgs: unknown[]) =>
    async (
      op: {
        kind: 'typed' | 'structural'
        after: { title: string; blocks: unknown }
        before: { blocks: unknown }
      },
      settle?: (promise: Promise<void>) => void
    ) => {
      if (op.kind === 'typed') {
        // A missing client mock is "this file doesn't stub titles". A present
        // `updateTitle` that rejects is a failed save — it must reject the
        // writer, the same way the real `createPageWriter` does, so the queue
        // halts instead of continuing on to `commitBlocks`.
        let updateTitle: ((...args: unknown[]) => Promise<unknown>) | undefined
        try {
          const client = jest.requireMock('@/lib/pages/client') as {
            updateTitle?: (...args: unknown[]) => Promise<unknown>
          }
          updateTitle = client.updateTitle
        } catch {
          updateTitle = undefined
        }
        if (updateTitle) await updateTitle(writerArgs[0], writerArgs[2], op.after.title)
      }
      const result = await (commitBlocks as (...a: unknown[]) => Promise<unknown>)(
        writerArgs[0],
        writerArgs[1],
        writerArgs[2],
        op.after.blocks,
        { ownEdit: true, before: op.before.blocks, pondId: writerArgs[3] }
      )
      const remembered = (result as { remembered?: Promise<void> } | undefined)?.remembered
      if (remembered) settle?.(remembered)
    }

  return { commitBlocks, createPageWriter }
}
