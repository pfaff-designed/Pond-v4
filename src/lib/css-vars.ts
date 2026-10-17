import type { CSSProperties } from 'react'

/** `CSSProperties` plus the custom-property keys React's own type omits. */
export type CSSVars = CSSProperties & Record<`--${string}`, string>
