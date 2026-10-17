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
 *
 * `latestBlock`/`getLatestSchema` (KAN-243 fix) are the undo's own read of "what is
 * current right now" — BlockCanvas draws the empty-state bar and `ViewControls`'
 * live bar as TWO SEPARATE instances of this component, and the block flips between
 * them (a mode change can make either one unmount while the other's toast is still
 * open), so a ref owned BY an instance of `SavedViewBar` itself would freeze the
 * moment that instance unmounts. Each host passes its OWN getter instead — one that
 * outlives this component's own mounts — and only a caller with neither (a bare
 * story/test render of `CollectionView`) falls back to a local ref tied to this
 * instance's own props, which is exactly today's behaviour for those.
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
 * lacks ({@link hasRequiredField}), mints it and writes it BEFORE the view, so a
 * same-tick second pick reads the field already there via `getLatestSchema`
 * (`updateSchema`'s own cache write is synchronous). ONE undo step covers both
 * writes — but undo must remove ONLY this add's own delta (its view, and the
 * field it minted), read off `latestBlock.current`/`getLatestSchema()` (owned by
 * a host that outlives THIS CALL's own `SavedViewBar` instance) rather than
 * restoring the whole block captured at click. Two toasts can be open together
 * (`useDeletionUndo` keeps every staged toast until it is actioned or expires);
 * closing over the pre-add block would make undoing the OLDER one wipe out a
 * view a LATER add had since made, or — if the instance that staged it has since
 * unmounted (BlockCanvas's empty↔live swap) — read a block frozen before either.
 */
function runAddView(
  data: ViewBlock,
  mode: ViewMode,
  getLatestSchema: () => PropertySchema | null,
  latestBlock: { readonly current: ViewBlock },
  updateSchema: (next: PropertySchema) => void,
  onChange: (next: ViewBlock) => void,
  deletionUndo: NonNullable<ReturnType<typeof useOptionalDeletionUndo>>,
  onSelect: (id: string) => void
): void {
  const schema = getLatestSchema()
  if (!schema) return

  const need = VIEW_KIND_REQUIREMENT[mode]
  let addedFieldId: string | undefined
  if (need && !hasRequiredField(mode, schema)) {
    const addField = need === 'date' ? addDateField : addStatusField
    const mintedSchema = addField(schema)
    addedFieldId = mintedSchema[mintedSchema.length - 1].id
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
      const current = latestBlock.current
      const currentViews: ViewSavedView[] = current.views ?? []
      const removingShownView = current.activeViewId === addedViewId
      onChange({
        ...current,
        views: currentViews.filter((view) => view.id !== addedViewId),
        activeViewId: removingShownView ? previousActiveViewId : current.activeViewId,
      })
      if (removingShownView) onSelect(previousActiveViewId)
      if (addedFieldId) {
        updateSchema(removeField(getLatestSchema() ?? schema, addedFieldId))
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
  /** Host-owned reads of "what is current right now" (`SavedViewHost`, KAN-243
   *  fix) — pass the host's own getters so an undo staged by one bar instance
   *  still reads correctly after BlockCanvas swaps it for the other. Absent
   *  only for a bare story/test render of `CollectionView`, which falls back to
   *  a local ref tied to THIS instance's own props (today's behaviour there). */
  latestBlock?: { readonly current: ViewBlock }
  getLatestSchema?: () => PropertySchema | null
}

export function SavedViewBar({
  block,
  schema,
  updateSchema,
  activeId,
  onSelect,
  editable,
  onChange,
  latestBlock,
  getLatestSchema,
}: SavedViewBarProps) {
  const deletionUndo = useOptionalDeletionUndo()

  // Local fallback only: a host that owns neither getter (a bare story/test
  // render of `CollectionView`) gets today's behaviour — a ref tied to THIS
  // instance's own props, which is fine there since nothing ever swaps it out.
  const ownSchemaRef = useRef(schema)
  useEffect(() => {
    ownSchemaRef.current = schema
  }, [schema])
  const ownBlockRef = useRef(block)
  useEffect(() => {
    ownBlockRef.current = block
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
      runAddView(
        block,
        mode,
        getLatestSchema ?? (() => ownSchemaRef.current),
        latestBlock ?? ownBlockRef,
        updateSchema,
        onChange,
        deletionUndo,
        onSelect
      )
    },
    [editable, schema, deletionUndo, onChange, block, updateSchema, onSelect, getLatestSchema, latestBlock]
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
