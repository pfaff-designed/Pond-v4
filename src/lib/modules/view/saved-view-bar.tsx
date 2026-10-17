'use client'

/**
 * The saved-view bar's add wiring (KAN-243) — ONE HOME for the "＋ view" picker's
 * rows, `runAddView`'s mint-then-add-then-undo, and the segment list (including
 * the legacy single-segment synthesis, PATH_STEPS 1), so `ViewControls` (a live
 * view, rows already on screen) and `BlockCanvas`'s empty-state branch (zero rows,
 * the SAME block) draw the identical bar instead of each re-deriving it. Both call
 * sites already hold the collection's current `schema`/`updateSchema` off their
 * own `useCollectionRows` call (react-query's cache, not a second fetch) and the
 * block's RAW, unresolved config — segments read off `block.views` (or the legacy
 * synthesis) regardless of which saved view is actually drawing.
 *
 * `onSelect` doubles as the activation a pick (and its undo) need: at `ViewControls`
 * it is `CollectionView`'s own bar-click handler, which already sets the LOCAL
 * selection AND notifies `BlockCanvas` (KAN-321's `ActiveViewSelectionContext`); in
 * the empty state it is `BlockCanvas`'s own `setActiveViewId` directly — the same
 * fact, reached two different ways, so `runAddView` never needs to know which.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { ViewBlock, ViewMode, ViewSavedView } from './schema'
import { addSavedView, resolveActiveView } from './schema'
import { useOptionalDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { ViewBar, type ViewBarView } from '@/components/molecules/ViewBar'
import { addViewRemedyLine, hasRequiredField, VIEW_KIND_REQUIREMENT, VIEW_KINDS } from './kinds'
import type { ViewKindPickerRow } from '@/components/molecules/ViewKindPicker'
import { addDateField, addStatusField, removeField, type PropertySchema } from '@/lib/properties/schema'

/**
 * Adds a saved view (KAN-243's ＋ view): when the kind needs a field the schema
 * lacks ({@link hasRequiredField}), mints it onto `schemaRef.current` and writes
 * it BEFORE the view, so a same-tick second pick reads the field already there.
 * ONE undo step covers both writes — but undo must remove ONLY this add's own
 * delta (its view, and the field it minted), read off `dataRef.current` (the
 * CURRENT block) rather than restoring the whole block captured at click. Two
 * toasts can be open together (`useDeletionUndo` keeps every staged toast until
 * it is actioned or expires); closing over the pre-add block would make undoing
 * the OLDER one wipe out a view a LATER add had since made.
 */
function runAddView(
  data: ViewBlock,
  mode: ViewMode,
  schemaRef: { current: PropertySchema | null },
  dataRef: { current: ViewBlock },
  updateSchema: (next: PropertySchema) => void,
  onChange: (next: ViewBlock) => void,
  deletionUndo: NonNullable<ReturnType<typeof useOptionalDeletionUndo>>,
  onSelect: (id: string) => void
): void {
  const schema = schemaRef.current
  if (!schema) return

  const need = VIEW_KIND_REQUIREMENT[mode]
  let addedFieldId: string | undefined
  let mintedSchema: PropertySchema | undefined
  if (need && !hasRequiredField(mode, schema)) {
    const addField = need === 'date' ? addDateField : addStatusField
    mintedSchema = addField(schema)
    addedFieldId = mintedSchema[mintedSchema.length - 1].id
    schemaRef.current = mintedSchema
    updateSchema(mintedSchema)
  }

  const updated = addSavedView(data, mode)
  // `addSavedView` always returns a non-empty `views` (wraps a legacy block's
  // mode+config into `views[0]` first) — `views!` is the schema's own optional
  // typing for the general `ViewBlock` case, not a real possibility here.
  const updatedViews: ViewSavedView[] = updated.views!
  // A legacy block's wrap mints a BRAND NEW id for the view `resolveActiveView(data)`
  // would have reported (`addSavedView`'s `views[0]`, never `data.id` itself) — read
  // the previously-active id off `updatedViews[0]` in that case so undo's
  // re-selection lands on an id that actually exists in the post-add `views[]`.
  const previousActiveViewId =
    data.views && data.views.length > 0 ? resolveActiveView(data).id : updatedViews[0].id
  const addedViewId = updatedViews[updatedViews.length - 1].id
  onChange(updated)
  onSelect(addedViewId)
  deletionUndo.stageUndo({
    message: `Added a ${VIEW_KINDS[mode].label} view`,
    scope: 'block',
    undo: () => {
      const current = dataRef.current
      const currentViews: ViewSavedView[] = current.views ?? []
      const removingShownView = current.activeViewId === addedViewId
      onChange({
        ...current,
        views: currentViews.filter((view) => view.id !== addedViewId),
        activeViewId: removingShownView ? previousActiveViewId : current.activeViewId,
      })
      if (removingShownView) onSelect(previousActiveViewId)
      if (addedFieldId) {
        updateSchema(removeField(schemaRef.current ?? mintedSchema ?? schema, addedFieldId))
      }
    },
  })
}

export interface SavedViewBarProps {
  /** The raw, persisted view block — segments and `addSavedView` both read its
   *  `views[]` (or its legacy top-level mode+config) directly, never a
   *  per-saved-view resolved mirror. */
  block: ViewBlock
  /** This collection's current schema, off whichever `useCollectionRows` call
   *  the host already made — `null` while loading or over a non-collection,
   *  where the bar still draws (identification), just with no "＋ view". */
  schema: PropertySchema | null
  /** Writes the collection's schema — the same mutator the remedy fields use. */
  updateSchema: (next: PropertySchema) => void
  /** The bar's own LOCAL selection (KAN-36: switching is reading). */
  activeId: string | undefined
  /** A bar click's own handler; a pick (and its undo) reuse it to activate the
   *  view they add/restore (KAN-243). */
  onSelect: (id: string) => void
  editable: boolean
  /** Absent on a reader / no-persistence host — gates "＋ view" the same way
   *  every other insert does. */
  onChange?: (next: ViewBlock) => void
}

export function SavedViewBar({
  block,
  schema,
  updateSchema,
  activeId,
  onSelect,
  editable,
  onChange,
}: SavedViewBarProps) {
  const deletionUndo = useOptionalDeletionUndo()

  // Undo must drop only what THIS add created off the CURRENT schema/block, never
  // restore a stale snapshot captured at click — another add's toast may still be
  // open (KAN-243).
  const schemaRef = useRef(schema)
  useEffect(() => {
    schemaRef.current = schema
  }, [schema])
  const dataRef = useRef(block)
  useEffect(() => {
    dataRef.current = block
  }, [block])

  const addViewRows: readonly ViewKindPickerRow[] = useMemo(
    () =>
      (Object.keys(VIEW_KINDS) as ViewMode[]).map((mode) => ({
        mode,
        remedyLine: schema && !hasRequiredField(mode, schema) ? addViewRemedyLine(mode) : undefined,
        disabled: schema ? undefined : 'this view has no collection',
      })),
    [schema]
  )

  const onAddView = useCallback(
    (mode: ViewMode) => {
      if (!editable || !schema || !deletionUndo || !onChange) return
      runAddView(block, mode, schemaRef, dataRef, updateSchema, onChange, deletionUndo, onSelect)
    },
    [editable, schema, deletionUndo, onChange, block, updateSchema, onSelect]
  )

  // KAN-243 PATH_STEPS 1: a legacy block (no `views[]` yet — every view made from
  // `/`, KAN-240) has exactly one view, itself. Synthesize that one segment so
  // "＋ view" is reachable before the first `addSavedView` call ever wraps it into
  // `views[0]` — editable only; a reader of a legacy block draws no bar at all,
  // nothing to switch between.
  const hasSavedViews = !!block.views && block.views.length > 0
  const legacyView = hasSavedViews ? undefined : resolveActiveView(block)
  const barViews: readonly ViewBarView[] | undefined = hasSavedViews
    ? (block.views as ViewSavedView[]).map((v) => ({ id: v.id, label: v.label ?? VIEW_KINDS[v.kind].label }))
    : editable && legacyView
      ? [{ id: legacyView.id, label: legacyView.label ?? VIEW_KINDS[legacyView.kind].label }]
      : undefined
  const barActiveId = hasSavedViews ? (activeId ?? (block.views as ViewSavedView[])[0].id) : legacyView?.id

  if (!barViews || barViews.length === 0 || !barActiveId) return null

  return (
    <ViewBar
      views={barViews}
      activeId={barActiveId}
      onSelect={onSelect}
      {...(editable && onChange
        ? { showAddView: true, addViewRows, onAddView }
        : { showAddView: false })}
    />
  )
}
