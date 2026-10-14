/** react-query keys for the change log. */

/** The root every change-log view sits under — invalidate it and they all re-read. */
export const changeLogKey = () => ['change-log'] as const

/**
 * The composer's own diff cards (AITerminal, KAN-302) read each card's settled
 * status through a query under this key, nested under `changeLogKey()` so an
 * answer from the proposed view — which already invalidates the root on every
 * accept/reject/request-changes — also refreshes a mounted composer's cards,
 * with no remount needed.
 */
export const changeLogChainTipKey = (pondId: string | null) =>
  [...changeLogKey(), pondId, 'chain-tip'] as const
