import { createContext } from 'react'
import type { PropertySchema } from '@/lib/properties/schema'
import type { ViewBlock } from './schema'

/** Told the saved view a view block's bar just switched to, by id. */
export const ActiveViewSelectionContext = createContext<((id: string) => void) | undefined>(
  undefined
)

/**
 * KAN-243: `SavedViewBar`'s own add-a-view undo needs "what is current right
 * now" — `BlockCanvas` draws TWO separate instances of `SavedViewBar` for one
 * view block (the empty-state `headBar` bar and `ViewControls`' own live bar),
 * and the block flips between them as its empty/rest state changes, so a ref
 * owned BY one instance would freeze the moment that instance unmounts. This
 * context carries a host-owned getter that outlives both — `BlockCanvas`'s
 * `BlockEditor`, which never unmounts across that flip.
 */
export interface SavedViewHost {
  /** The host's own most-current view block (its `moduleData`, not a stale
   *  closure) — read fresh by an undo that may fire after either bar instance
   *  has come and gone. */
  latestBlock: { readonly current: ViewBlock }
  /** Reads the collection's schema straight off react-query's cache —
   *  synchronous, so a same-tick remedy mint is visible to the very next read. */
  getLatestSchema: () => PropertySchema | null
}

export const SavedViewHostContext = createContext<SavedViewHost | undefined>(undefined)
