import type { ComponentType } from 'react'

/** One aesthetic-direction prototype on the boldness ladder (ticket-14). */
export interface Variant {
  /** 1..15, also the position on the boldness ladder. */
  id: number
  /** Short name shown in the switcher (e.g. "Midnight"). */
  name: string
  /** One-line point of view. */
  pov: string
  /** 1 (most restrained) .. 15 (wildest). Equals id. */
  boldness: number
  /** Full-viewport view. */
  Component: ComponentType
}
