/**
 * What a page surface publishes for the shell's `PondCommand` to show at rest,
 * read back as text: `life › Health › Sleep`, the glyph on `data-glyph`. A page
 * rendered alone draws no pill (the shell does), so a test wraps the surface in
 * `withPathProbe` and reads `getByTestId('command-path')`.
 */

import type { ReactNode } from 'react'

import { CommandPathProvider, useCommandPath } from '@/lib/layout/command-path'

function PathProbe() {
  const path = useCommandPath()
  if (!path) return null
  return (
    <output data-testid="command-path" data-glyph={path.glyph} data-role={path.role ?? ''}>
      {[...path.trail, path.current].join(' › ')}
    </output>
  )
}

export const withPathProbe = (ui: ReactNode) => (
  <CommandPathProvider>
    {ui}
    <PathProbe />
  </CommandPathProvider>
)
