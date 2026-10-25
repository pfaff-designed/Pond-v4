'use client'

/**
 * The settings page (KAN-493; `SETTINGS_NODE_ID`): a reserved virtual node like
 * trash, rendered in `DocumentPanel` in place of the `getPage`/rows path.
 *
 * `06.13`'s `s6m7` draws a full "manage ponds" row (drag handle, theme chip,
 * "this pond" label, a `⋯` menu with rename/change glyph/theme/export/archive)
 * — this ticket's own Build section scopes the minimum path to list + delete:
 * each live pond is its glyph, name and a `delete…` control; the other columns
 * and the menu are unticketed future work (AGENTS.md "good-enough software,
 * with the user setting enough").
 *
 * Delete asks for the pond's name typed (`ConfirmDialog`'s `requiredText`),
 * then soft-deletes it: `softDeletePond` (the write) and `removePond` (the
 * switcher's local list, same shape as `addPond`) both run, so the row and the
 * switcher drop it at once rather than racing a refetch. Deleting the ACTIVE
 * pond lands you in the first remaining live pond (switcher order, same list
 * this page already reads), or opens the new-pond flow when none is left — the
 * same `naming`-state pattern `PondSwitcher.tsx` uses for its own "new pond" row.
 *
 * The "deleted" list (KAN-493's second half) is a separate build item.
 */

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePond } from '@/lib/pond/context'
import { pondHref } from '@/lib/pond/active'
import { softDeletePond, type Pond } from '@/lib/pond/client'
import { requestNotify } from '@/lib/deletion/notify-bridge'
import { useSurfaceColumn } from '@/lib/layout/surface-column'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'
import { PondMark } from '@/components/atoms/PondMark'
import { PondControl } from '@/components/atoms/PondControl'
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog'
import { NewPondFlow } from './NewPondFlow'

/** The ponds list's own content column — no board of its own for the page
 *  shell, so this reads off `s6m7`'s own inline content width (780, the
 *  frame's `left:300px;top:70px;width:780px` block). */
const SETTINGS_COLUMN_PX = 780

/** One live pond row: glyph, name, `delete…` — `s6m7`'s grid, minus the drag
 *  handle, theme chip, "this pond" label and `⋯` menu columns this ticket
 *  doesn't build. Hover tint is the board's own `rgba(100,143,123,.07)`
 *  (sage), inlined rather than `--mn-rail-hover` since that token is
 *  documented rail-only and this row is not the rail. */
function PondRow({
  pond,
  busy,
  onDelete,
}: {
  pond: Pond
  busy: boolean
  onDelete: () => void
}) {
  return (
    <div
      data-testid="settings-pond-row"
      className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-[10px] py-3 hover:bg-[rgba(100,143,123,.07)]"
    >
      <PondMark glyph={pond.glyph ?? LIFE_GLYPH} size={14} />
      <span className="min-w-0 truncate text-[15px] font-medium text-mn-text">{pond.name}</span>
      <PondControl kind="button" variant="ghost" disabled={busy} onClick={onDelete}>
        {busy ? 'deleting…' : 'delete…'}
      </PondControl>
    </div>
  )
}

export function PondSettingsPage() {
  const router = useRouter()
  const { pond: active, ponds, removePond } = usePond()
  const { column } = useSurfaceColumn(SETTINGS_COLUMN_PX)
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  // Blocks a second confirm click synchronously, before the re-render that
  // would disable the dialog's own button via `deletingId` (AUDIT G9) —
  // same reasoning as `TrashPage`'s `inFlightRecordIds`.
  const inFlight = useRef(false)

  const handleConfirmDelete = async () => {
    if (!confirmTarget || inFlight.current) return
    inFlight.current = true
    setDeletingId(confirmTarget.id)
    const wasActive = active?.id === confirmTarget.id
    const remaining = ponds.filter((p) => p.id !== confirmTarget.id)
    try {
      await softDeletePond(confirmTarget.id)
      removePond(confirmTarget.id)
      setConfirmTarget(null)
      if (wasActive) {
        if (remaining.length > 0) {
          router.push(pondHref(remaining[0].id, remaining[0].lastPageId))
        } else {
          setNaming(true)
        }
      }
    } catch (err) {
      console.error(err)
      requestNotify({ message: 'Could not delete the pond' })
    } finally {
      inFlight.current = false
      setDeletingId(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div {...column} data-testid="settings-column" className={`${column.className} flex flex-col gap-4`}>
        <span className="font-serif text-[52px] leading-none font-extralight tracking-[-0.01em] text-mn-text">
          ponds
        </span>
        <div className="flex flex-col border-t border-mn-line pt-2">
          {ponds.map((pond) => (
            <PondRow
              key={pond.id}
              pond={pond}
              busy={deletingId === pond.id}
              onDelete={() => setConfirmTarget({ id: pond.id, name: pond.name })}
            />
          ))}
        </div>
      </div>
      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null)
        }}
        title={`Delete "${confirmTarget?.name ?? ''}"?`}
        consequence="It waits 30 days under deleted, then goes. Restore it from here."
        requiredText={confirmTarget?.name}
        onConfirm={handleConfirmDelete}
      />
      {naming && <NewPondFlow onClose={() => setNaming(false)} />}
    </div>
  )
}
