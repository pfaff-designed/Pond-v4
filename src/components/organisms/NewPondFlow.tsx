'use client'

import { useCreatePond } from '@/lib/pond/use-create-pond'
import { NewPondSheet } from './NewPondSheet'

/**
 * The New pond sheet wired to making a pond — one wiring for the rail's switcher
 * and the palette. Mounted only while the sheet is open, so a failure message and
 * the typed name end with it. `onClose(created)` runs on cancel and after a pond
 * is made.
 */
export function NewPondFlow({
  defaultName,
  onClose,
}: {
  defaultName?: string
  onClose: (created: boolean) => void
}) {
  const { create, pending, failure } = useCreatePond()
  return (
    <NewPondSheet
      defaultName={defaultName}
      pending={pending}
      failure={failure}
      onCreate={(name, options) =>
        void create(name, options).then((made) => {
          if (made) onClose(true)
        })
      }
      onCancel={() => onClose(false)}
    />
  )
}
