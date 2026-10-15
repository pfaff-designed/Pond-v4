import { createContext } from 'react'

/** Told the saved view a view block's bar just switched to, by id. */
export const ActiveViewSelectionContext = createContext<((id: string) => void) | undefined>(
  undefined
)
