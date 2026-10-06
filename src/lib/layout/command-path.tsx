'use client'

/**
 * Where the open surface tells the shell's `PondCommand` what path to show.
 *
 * The pill is the SHELL's — one live instance owns ⌘K and sits at the shell's
 * top centre, the page scrolling under it (`Pond 05 Shell`) — but its path
 * belongs to whichever page is open. So the page publishes the path here and the
 * shell reads it.
 *
 * Outside a shell (Storybook, a surface rendered alone) there is no provider:
 * publishing does nothing and nothing floats, so the surface needs no room for it.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import type { CommandPath } from '@/lib/pages/command-path'

type SetPath = (path: CommandPath | null) => void

// Two contexts, so a publisher (which never reads the path) is not re-rendered
// by its own publication — the page publishes on every keystroke in its title.
const PathContext = createContext<CommandPath | null>(null)
const SetPathContext = createContext<SetPath | null>(null)

export function CommandPathProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<CommandPath | null>(null)
  return (
    <SetPathContext.Provider value={setPath}>
      <PathContext.Provider value={path}>{children}</PathContext.Provider>
    </SetPathContext.Provider>
  )
}

/** The path the open page published; null until one has. */
export const useCommandPath = (): CommandPath | null => useContext(PathContext)

/** True inside a shell, where the pill floats over the surface — so the surface pads for it. */
export const useCommandFloats = (): boolean => useContext(SetPathContext) !== null

/** Publishes `path` while the caller is mounted; cleared when it unmounts. */
export function usePublishCommandPath(path: CommandPath): void {
  const setPath = useContext(SetPathContext)
  // Keyed by value, not identity: the caller derives a fresh object every render.
  const key = JSON.stringify(path)
  useEffect(() => {
    setPath?.(JSON.parse(key) as CommandPath)
  }, [setPath, key])
  useEffect(() => () => setPath?.(null), [setPath])
}
