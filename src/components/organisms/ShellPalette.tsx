'use client'

import { useMemo, useState } from 'react'

import { CommandPalette, type CommandPaletteProps } from '@/components/molecules/CommandPalette'
import { normalizeQuery } from '@/components/molecules/slash-entries'
import { pondItems } from '@/lib/pages/palette-items'
import { usePaletteRecords } from '@/lib/pages/use-palette-records'
import { usePond } from '@/lib/pond/context'

/** `onQueryChange` is the shell's own: it is how records learn what is typed. */
export type ShellPaletteProps = Omit<CommandPaletteProps, 'onQueryChange'>

/**
 * The shell's ⌘K palette: `CommandPalette` fed what only the shell can know — the
 * records matching what is typed and the other ponds. It lives only while the
 * palette is open, so the typed query is gone with it.
 */
export function ShellPalette({ items, ...props }: ShellPaletteProps) {
  const [query, setQuery] = useState(props.defaultQuery ?? '')
  const records = usePaletteRecords(normalizeQuery(query))
  const { pond, ponds } = usePond()
  const fed = useMemo(
    () => [...items, ...pondItems(ponds, pond?.id ?? null), ...records],
    [items, ponds, pond, records]
  )
  return <CommandPalette {...props} items={fed} onQueryChange={setQuery} />
}
