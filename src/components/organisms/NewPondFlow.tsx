'use client'

import { useEffect } from 'react'
import { useCreatePond } from '@/lib/pond/use-create-pond'
import { setMode } from '@/lib/theme/mode'
import { NewPondSheet } from './NewPondSheet'

/**
 * The New pond sheet wired to making a pond — one wiring for the rail's switcher
 * and the palette. Mounted only while the sheet is open, so a failure message and
 * the typed name end with it. `onClose(created)` runs on cancel and after a pond
 * is made.
 *
 * The theme applies once, at creation, never on a later switch (KAN-503 owns
 * that): `options.theme` is only present when the person actually clicked a
 * pill in the sheet, so an untouched sheet leaves the person's own mode alone.
 *
 * The pending FACT has one source: `useCreatePond`'s own `pending`. Enforcement
 * reads it in two places — `NewPondSheet`'s Esc/←/scrim guard inside the sheet,
 * and `ShellCommands`' `closeNewPondSheet` outside it (⌘K) via `onPendingChange`,
 * which can't see the sheet's internal `pendingRef`.
 */
export function NewPondFlow({
  defaultName,
  onClose,
  onPendingChange,
}: {
  defaultName?: string
  onClose: (created: boolean) => void
  onPendingChange?: (pending: boolean) => void
}) {
  const { create, pending, failure } = useCreatePond()
  useEffect(() => {
    onPendingChange?.(pending)
    return () => onPendingChange?.(false)
  }, [pending, onPendingChange])
  return (
    <NewPondSheet
      defaultName={defaultName}
      pending={pending}
      failure={failure}
      onCreate={(name, options) =>
        void create(name, options).then((made) => {
          if (!made) return
          if (options.theme) setMode(options.theme === 'ink' ? 'dark' : 'light')
          onClose(true)
        })
      }
      onCancel={() => onClose(false)}
    />
  )
}
