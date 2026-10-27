'use client'

/**
 * The shell's command owner (#96; was `TopBar`). Renders `PondCommand` — the
 * breadcrumb and the ⌘K palette as one element (`Pond 02` 2g) — at the shell's
 * top centre (`Pond 05 Shell`: top 20, left calc(50% + 13px), translateX(-50%)),
 * showing the path the open page publishes (`lib/layout/command-path`).
 *
 * It feeds the palette what only the shell can know: pages, records and actions
 * in one list over the shared `['pages']` cache (`lib/pages/palette-items`), the
 * records matching what is typed, and the other ponds. ⌘K is Ctrl+K off a Mac
 * (AUDIT K3). This file is its one owner: it opens the palette, closes it, and
 * closes the save-as-template sheet the palette becomes — `PondCommand` itself
 * handles a click on it, esc and a press outside.
 *
 * Also owns ⌘J, the composer's open/close key (`Pond 02` 2f): it asks, the composer
 * answers (`requestComposerToggle`). Unlike ⌘K it is Cmd on Apple platforms and Ctrl
 * elsewhere and never both, so Ctrl+J on a Mac is left to the browser.
 *
 * The palette's `new page` rows (bare, or minted from the query as `new page “q”`)
 * create a page directly under the page in view — titled from the query if one
 * was typed, else untitled — and land in it, matching the new-page menu's "page"
 * row (the palette has no ＋ to anchor a menu to). `ask pond about “q”` lands in
 * the composer prefilled.
 *
 * Zen's rows, ⌘. and the breadcrumb in zen are `useZenCommands`. In zen ⌘J is
 * the person asking (KAN-186) — same door, `AITerminal` routes it through the
 * pill's own ask/close rather than the ordinary open/collapse; the palette
 * still mints no `ask pond about “q”` there.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { BLOCK_GROUP_CAP, type PaletteItem } from '@/components/molecules/palette-entries'
import { normalizeQuery } from '@/components/molecules/slash-entries'
import { NewPondFlow } from '@/components/organisms/NewPondFlow'
import { PondCommand } from '@/components/organisms/PondCommand'
import { ReportProblemBox, type ReportProblemStatus } from '@/components/organisms/ReportProblemBox'
import { UndoNotice } from '@/components/molecules/UndoNotice'
import {
  BLOCK_MOVE_PICK_EVENT,
  clearUndoNotice,
  isComposerToggleKey,
  requestComposerNotice,
  requestComposerToggle,
  requestHtmlImportPicker,
  requestTerminalFocus,
  requestUndoNotice,
  useUndoNotice,
  type BlockMovePickDetail,
} from '@/lib/terminal-focus'
import {
  isPaletteChord,
  isEditableField,
  isGoToParentChord,
  isMinimizeRailChord,
  isMovePageChord,
  isOverlayOpen,
  isRailFocusChord,
  isRedoChord,
  isUndoChord,
  onApplePlatform,
  SESSION_UNDO_SCOPE_ATTR,
} from '@/lib/shell-commands'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { blockLinkUrl } from '@/lib/modules/block-link'
import { editorHistoryEmptyFor } from '@/lib/modules/text/active-editor'
import { applyUndoOutcome } from '@/lib/change-log/undo-outcome'
import { describeChange, describeUndoneEffect } from '@/lib/change-log/page-changes'
import { getRecord } from '@/lib/change-log/store'
import { rememberStruckRow } from '@/lib/change-log/undo-strike'
import { useCommandPath } from '@/lib/layout/command-path'
import { setRailMinimized, toggleRail, useRailMinimized } from '@/lib/layout/rail-chrome'
import { requestRailRowFocus } from '@/lib/layout/rail-focus'
import { PLACEMENT } from '@/lib/layout/shell-placement'
import { useZenCommands } from '@/lib/layout/use-zen-commands'
import { openWorkspaceUrl, workspaceUrl } from '@/lib/pages/nav'
import { requestTitleFocus } from '@/lib/pages/title-focus'
import { flushPendingPageSave } from '@/lib/pages/page-flush'
import { moveAndStageUndo } from '@/lib/pages/move'
import { moveBlockAndStageUndo } from '@/lib/pages/move-block'
import { useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { useFavouritePage } from '@/lib/pond/use-favourite-page'
import {
  blockMovePickItems,
  movePickItems,
  newPageParent,
  paletteItems,
  paletteScope,
  pondItems,
  railItems,
} from '@/lib/pages/palette-items'
import { isMovablePageRow } from '@/lib/pages/databases-root'
import { prefetchPageIfAbsent } from '@/lib/pages/use-page-prefetch'
import { readRecentPageIds, writeRecent } from '@/lib/pages/recent-pages'
import { useHomePage } from '@/lib/pages/use-home-page'
import { usePaletteBlocks } from '@/lib/pages/use-palette-blocks'
import type { ParentPageRow } from '@/lib/pages/palette-blocks'
import { usePaletteRecords } from '@/lib/pages/use-palette-records'
import { createPage } from '@/lib/pages/client'
import { insertPageOptimistic } from '@/lib/pages/tree'
import { duplicateAndOpen } from '@/lib/pages/duplicate'
import { pagesKey } from '@/lib/pages/keys'
import { appendChildLinkUnder } from '@/lib/pages/child-links'
import { usePagesRows } from '@/lib/pages/use-pages'
import { createClient } from '@/lib/supabase/client'
import { instantiateTemplate } from '@/lib/templates/instantiate'
import { PREMADE_TEMPLATES } from '@/lib/templates/premade'
import { usePondName } from '@/lib/pond/name'
import { usePond, usePondId } from '@/lib/pond/context'
import { pondHref } from '@/lib/pond/active'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'
import { LIFE_ID } from '@/lib/rail/tree'
import { useSaveAsTemplateSheet } from '@/components/organisms/use-save-as-template-sheet'
import { ROW_TYPE } from '@/lib/properties/schema'

/** Where ⌘Z/⇧⌘Z belongs to the field itself (Tiptap's own undo, an input, a select) —
 * except an empty page-title input (`data-pond-page-title`), which has nothing of
 * its own to undo, and a field inside a `SESSION_UNDO_SCOPE_ATTR` container (a list
 * or entry-log row), whose undo is the session's step, not the browser's field undo —
 * so the chord falls through to the session step instead. */
const isEditable = (el: Element | null): boolean =>
  el !== null &&
  (isEditableField(el) || el.matches('select')) &&
  !isEmptyPageTitleInput(el) &&
  !el.closest(`[${SESSION_UNDO_SCOPE_ATTR}]`)

const isEmptyPageTitleInput = (el: Element): boolean =>
  el.hasAttribute('data-pond-page-title') && el instanceof HTMLTextAreaElement && el.value === ''

export function ShellCommands() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const currentNodeId = searchParams.get('nodeId')
  const [paletteOpen, setPaletteOpen] = useState(false)
  // `move page to…`'s pick mode (KAN-469): set while picking, cleared on close
  // so a reopen always starts fresh — the same rule scope/query already follow.
  const [movePick, setMovePick] = useState<{ id: string; title: string } | null>(null)
  // The block menu's `move to…` pick mode (KAN-479): set while picking a
  // target page for one block, cleared on close like `movePick`.
  const [blockMovePick, setBlockMovePick] = useState<BlockMovePickDetail | null>(null)
  const [query, setQuery] = useState('')
  // `new pond “q”`: the sheet is open, holding the name the palette handed over.
  const [naming, setNaming] = useState<string | null>(null)
  // `report a problem`: the box is open, mounted over the shell like the palette.
  const [reportOpen, setReportOpen] = useState(false)
  const [reportStatus, setReportStatus] = useState<ReportProblemStatus>('idle')
  const [reportFiled, setReportFiled] = useState<{ key: string; url: string } | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const pondId = usePondId()
  const pondName = usePondName()
  const { pond, ponds, loading: pondLoading } = usePond()
  const published = useCommandPath()
  const queryClient = useQueryClient()
  // `usePagesRows` (KAN-310 gap 1) drops a staged-for-delete id at once, so a
  // page mid-delete is gone from the palette's listing, not just the rail.
  const { data: pages } = usePagesRows(pondId)
  // The move picker's root row (same source Rail reads for its own root label).
  const { data: home } = useHomePage(pondId, pondName, !pondLoading)
  const records = usePaletteRecords(normalizeQuery(query))
  // `usePaletteBlocks` wants `parentId` (camelCase, `ancestorPathLabel`'s own
  // shape); `pages` is `tree.ts`'s `PageRow`, snake_case like the row it came
  // from — mapped here rather than at `tree.ts`, which has callers of its own
  // that want `parent_id` as-is.
  const parentPages = useMemo<ParentPageRow[]>(
    () =>
      pages.map((p) => ({
        id: p.id,
        parentId: p.parent_id,
        type: p.type as ParentPageRow['type'],
        title: p.title,
      })),
    [pages]
  )
  const blocks = usePaletteBlocks(normalizeQuery(query), parentPages, BLOCK_GROUP_CAP)
  const undoNotice = useUndoNotice()
  // `move page to…`'s own commit (KAN-469) — the same `stageUndo`/`notify` the
  // rail's drag-move already stages through; ShellCommands sits inside the
  // one `DeletionUndoProvider` the workspace shell mounts.
  const { stageUndo, notify } = useDeletionUndo()
  const { toggle: toggleFavouritePage } = useFavouritePage()

  // A step's notice is only good for AS LONG AS NOTHING ELSE HAPPENED — a
  // key/click (via `clearShownNotice`) or a second step (via `runUndoStep`)
  // bumps this past the step's own captured value, so a `getRecord` that
  // resolves late (or two steps resolving out of order) drops its stale text
  // instead of showing it or overwriting a newer notice.
  const stepCounterRef = useRef(0)
  const clearShownNotice = useCallback(() => {
    stepCounterRef.current += 1
    clearUndoNotice()
  }, [])

  // `applyUndoOutcome` owes everything downstream: the sidebar/rail mark, the
  // "Changes to this page" panel and the specific pages the step's records
  // touched on `done`, or a one-line notice otherwise — shared with the
  // composer's own undo chip (KAN-179) so a ⌘Z and a chip press settle the
  // same way. It runs first, so a throw further down (building the notice)
  // can never leave a server-side success unrecorded. A `done` step whose
  // record sits on another page opens that page first (KAN-139: "undo opens
  // recipes first"). The notice's body names what the step did, read off the
  // ORIGINAL record (`links.undoOf`/`redoOf`) rather than the undo/redo
  // record's own `action` — `getRecord` is the one network round trip a ⌘Z
  // pays that the RPC's own response doesn't carry.
  const runUndoStep = useCallback(
    (direction: 'undo' | 'redo') => {
      if (pondId === null) return
      const stepId = ++stepCounterRef.current
      // The open page's own edit may still be sitting in its save debounce (same
      // KAN-302 hazard AITerminal's send guards against) — a step read before it
      // lands would undo the wrong thing, then have the stale save land on top.
      // `undefined` means nothing was pending, so the step stays in this tick —
      // existing callers assert `sessionUndo.undo`/`redo` synchronously after a chord.
      const pendingFlush = flushPendingPageSave(currentNodeId)
      const runStep = () => (direction === 'undo' ? sessionUndo.undo(pondId) : sessionUndo.redo(pondId))
      const step = pendingFlush ? pendingFlush.then(runStep) : runStep()
      step
        .then((result) => {
          applyUndoOutcome(direction, result, queryClient)
          if (result.outcome !== 'done') return
          // Struck row (KAN-139, s6o5): captured off the step's own records,
          // BEFORE `applyUndoOutcome`'s invalidation refetches the row away.
          for (const stepRecord of result.records) rememberStruckRow(stepRecord)
          const record = result.records[0]
          const targetPageId = record?.targetPageId ?? null
          const departed = currentNodeId ? pages?.find((p) => p.id === currentNodeId) ?? null : null
          const previousPageTitle = departed?.title ?? null
          let openedPageTitle: string | null = null
          if (targetPageId !== null && targetPageId !== currentNodeId) {
            const target = pages?.find((p) => p.id === targetPageId)
            if (target) {
              openedPageTitle = target.title
              openWorkspaceUrl(workspaceUrl({ id: target.id, type: target.type, title: target.title }), router)
            }
          }
          const originalId = direction === 'undo' ? record?.links?.undoOf : record?.links?.redoOf
          if (originalId === undefined || previousPageTitle === null) return
          getRecord(createClient(), originalId)
            .then((original) => {
              if (original === null || stepCounterRef.current !== stepId) return
              requestUndoNotice({
                direction,
                pastTense:
                  direction === 'undo' ? describeUndoneEffect(original) : describeChange(original, null),
                openedPageTitle,
                previousPageTitle,
              })
            })
            .catch(() => {})
        })
        .catch(() => requestComposerNotice(`can't ${direction} — try again.`))
    },
    [pondId, queryClient, pages, currentNodeId, router]
  )

  // Before the open page has published its path, the pill reads the pond's root.
  // Memoized so the keydown effect below (KAN-476) can depend on it without
  // re-subscribing on every render while nothing has actually changed.
  const path = useMemo(
    () => published ?? { glyph: pond?.glyph ?? LIFE_GLYPH, trail: [], current: pondName, role: null },
    [published, pond?.glyph, pondName]
  )

  // KAN-388: the active row arrowed/typed to in ⌘K warms its page before ↵ —
  // but only a REAL page row. The move picker's synthetic root row
  // (`LIFE_ID`, `movePickItems`) carries `kind: 'page'` too, so `PondCommand`'s
  // own page/database gate (KAN-469 live finding) still lets it through; one
  // rule catches it and any future synthetic id the same way, rather than a
  // special case for `LIFE_ID` alone.
  const handleActiveItemChange = useCallback(
    (item: PaletteItem) => {
      if (!pages.some((p) => p.id === item.id)) return
      prefetchPageIfAbsent(queryClient, createClient, item.id)
    },
    [queryClient, pages]
  )

  const closePalette = useCallback(() => setPaletteOpen(false), [])
  const templateSheet = useSaveAsTemplateSheet({ pondId, onOpen: closePalette })
  const {
    open: templateSheetOpen,
    close: closeTemplateSheet,
    start: startTemplateSheet,
  } = templateSheet
  // A create in flight must not be closed out from under it (a dismissed-but-
  // still-running create would still land) — a ref, not state, since it only
  // needs reading inside `closeNewPondSheet`, not a re-render.
  const pondCreatePendingRef = useRef(false)
  const handlePondCreatePendingChange = useCallback((next: boolean) => {
    pondCreatePendingRef.current = next
  }, [])
  const closeNewPondSheet = useCallback((created?: boolean) => {
    if (!created && pondCreatePendingRef.current) return
    setNaming(null)
  }, [])

  const closeReport = useCallback(() => {
    setReportOpen(false)
    setReportStatus('idle')
    setReportFiled(null)
    setReportError(null)
  }, [])

  const pageTitle = path.current
  const handleReportSubmit = useCallback(
    (text: string) => {
      setReportStatus('sending')
      fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, pageId: currentNodeId, pageTitle, url: window.location.href }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error('not ok')
          const data = (await res.json()) as { key: string; url: string }
          setReportFiled({ key: data.key, url: data.url })
          setReportStatus('filed')
        })
        .catch(() => {
          setReportError("can't file reports right now")
          setReportStatus('error')
        })
    },
    [currentNodeId, pageTitle]
  )

  // Global ⌘K → toggle the palette, or close the sheet it launched (the list is not
  // open then, so a toggle would raise it behind the sheet). Capture phase on the
  // document, so it fires before a focused editor/input can swallow it.
  const pondSheetOpen = naming !== null
  // The palette dialog's own open state (KAN-476's `shellKeysLive` reads this
  // directly — PondCommand is a combobox/listbox, not a base-ui `Dialog`, so it
  // carries no `role="dialog"` for `isOverlayOpen` to find).
  const commandOpen = paletteOpen || templateSheetOpen
  const zenCommands = useZenCommands({
    blocked: templateSheetOpen || pondSheetOpen || reportOpen,
    onEnter: closePalette,
  })
  const { inZen, handleModeSelect } = zenCommands
  const railMinimized = useRailMinimized()

  // Recents are read once as the palette opens, so a page opened from it lists next
  // time: the full up-to-20 list ranks `pages`/`actions` (KAN-390's `visits`), and
  // the board's last-three (`Pond 02` 2g) is `paletteItems`' own `recent` group.
  const recentPageIds = useMemo(
    () => (paletteOpen ? readRecentPageIds(pondId) : []),
    [paletteOpen, pondId]
  )
  const items = useMemo(() => {
    if (!paletteOpen) return []
    if (movePick) return movePickItems(pages, movePick.id, home?.title ?? pondName)
    if (blockMovePick) return blockMovePickItems(pages, blockMovePick.sourcePageId)
    return [
      ...paletteItems(pages, recentPageIds, currentNodeId, pond?.favouritePageIds, pond != null),
      ...zenCommands.items,
      ...railItems(railMinimized),
      ...pondItems(ponds, pond?.id ?? null),
      ...records,
      ...blocks,
    ]
  }, [
    pages,
    paletteOpen,
    currentNodeId,
    zenCommands.items,
    railMinimized,
    ponds,
    pond,
    records,
    blocks,
    recentPageIds,
    movePick,
    blockMovePick,
    home,
    pondName,
  ])
  const scope = useMemo(() => paletteScope(pages, currentNodeId), [pages, currentNodeId])

  // The block menu's `move to…` asks (`requestBlockMovePick`); this is the
  // only mounted `PondCommand`, so it answers by opening pick mode — the
  // same decoupling as `requestComposerToggle`/`AITerminal`.
  useEffect(() => {
    function onBlockMovePick(e: Event) {
      setBlockMovePick((e as CustomEvent<BlockMovePickDetail>).detail)
      setPaletteOpen(true)
    }
    window.addEventListener(BLOCK_MOVE_PICK_EVENT, onBlockMovePick)
    return () => window.removeEventListener(BLOCK_MOVE_PICK_EVENT, onBlockMovePick)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // The showing notice is for the LAST step, not whatever comes next — any
      // key clears it, the chord that opens a new one included (it reappears
      // once that step's own fetch settles).
      clearShownNotice()
      if (isPaletteChord(e)) {
        e.preventDefault()
        e.stopPropagation()
        if (templateSheetOpen) closeTemplateSheet()
        else if (pondSheetOpen) closeNewPondSheet()
        else if (reportOpen) closeReport()
        else
          setPaletteOpen((prev) => {
            if (prev) {
              setMovePick(null)
              setBlockMovePick(null)
            }
            return !prev
          })
        return
      }
      // ⌘⇧P opens `move page to…` directly (KAN-469), as in Notion — only while
      // the palette is closed; an open palette has its own `move-page` row for this.
      if (isMovePageChord(e) && !paletteOpen) {
        const openPage = currentNodeId ? pages.find((p) => p.id === currentNodeId) : undefined
        if (openPage && isMovablePageRow(openPage)) {
          e.preventDefault()
          e.stopPropagation()
          setMovePick({ id: openPage.id, title: openPage.title })
          setPaletteOpen(true)
        }
        return
      }
      // Shared gate for the two chords below (KAN-476): a chord that fires
      // globally (the rail-focus key) or navigates (⌘⇧↑) must do nothing while
      // a modal owns focus, or it acts behind that modal's own focus trap
      // instead of inside it. `commandOpen` covers the palette/template-sheet
      // dialog (no `role="dialog"` for `isOverlayOpen` to find); `isOverlayOpen`
      // covers everything else (a confirm dialog, the new-pond sheet, the
      // report box) without threading each one's open state in here.
      const shellKeysLive = !commandOpen && !isOverlayOpen()
      // ⌘⇧↑ opens the open page's parent (KAN-476), the same ancestor crumb
      // the breadcrumb's own last link navigates to. Left alone inside an
      // editable field — there the key keeps its native "select to
      // paragraph start" meaning, as in Linear and Notion.
      if (isGoToParentChord(e) && shellKeysLive) {
        const targetEl = e.target instanceof Element ? e.target : null
        if (!isEditableField(targetEl) && !isEditableField(document.activeElement)) {
          const parent = path.trail[path.trail.length - 1]
          if (parent?.to) {
            e.preventDefault()
            e.stopPropagation()
            if (parent.to.kind === 'home') openWorkspaceUrl(workspaceUrl(null), router)
            else openWorkspaceUrl(workspaceUrl(parent.to.node), router)
          }
        }
        return
      }
      // "From anywhere" (2f), text fields included — the composer's own input is
      // where ⌘J is most often pressed. Capture phase so an editor cannot swallow it.
      if (isComposerToggleKey(e)) {
        e.preventDefault()
        e.stopPropagation()
        // A held key repeats keydown; it must not flap the card open and shut.
        if (!e.repeat) requestComposerToggle()
        return
      }
      if (isMinimizeRailChord(e)) {
        e.preventDefault()
        e.stopPropagation()
        if (!e.repeat) toggleRail()
        return
      }
      // ⌘⇧\ moves focus into the rail (KAN-476) — from anywhere, the editor
      // included, that's the chord's whole point, so no `isEditableField` guard.
      // No-op while the rail is minimized: there is no row to focus. Gated by
      // `shellKeysLive` too — it must not steal focus from behind a modal.
      if (isRailFocusChord(e) && !railMinimized && shellKeysLive) {
        e.preventDefault()
        e.stopPropagation()
        if (!e.repeat) requestRailRowFocus()
        return
      }
      // Undo/redo belongs to an editable field first — Tiptap's own undo, an
      // input, a select — so the shell never intercepts a keystroke they own.
      // Except: a text block whose own history the commit just closed
      // (KAN-139, comment 10064) has nothing left for that chord to do, so it
      // falls through to the session step instead — an input, a select, and a
      // text block that still has history all keep theirs.
      if (pondId === null || e.defaultPrevented) return
      const targetEl = e.target instanceof Element ? e.target : null
      const editableEl = isEditable(targetEl)
        ? targetEl
        : isEditable(document.activeElement)
          ? document.activeElement
          : null
      if (editableEl) {
        const direction = isUndoChord(e) ? 'undo' : isRedoChord(e) ? 'redo' : null
        if (direction === null || !editorHistoryEmptyFor(editableEl, direction)) return
      }
      if (isUndoChord(e)) {
        e.preventDefault()
        runUndoStep('undo')
        return
      }
      if (isRedoChord(e)) {
        // ⌘Y alone is Chrome/Safari's History on a Mac (K1–K4); redo stays
        // ⇧⌘Z there. Off a Mac, Ctrl+Y is the redo convention and is handled.
        if (!e.shiftKey && e.key.toLowerCase() === 'y' && onApplePlatform()) return
        e.preventDefault()
        runUndoStep('redo')
      }
    }
    function onClick() {
      clearShownNotice()
    }
    document.addEventListener('keydown', onKey, { capture: true })
    document.addEventListener('click', onClick, { capture: true })
    return () => {
      document.removeEventListener('keydown', onKey, { capture: true })
      document.removeEventListener('click', onClick, { capture: true })
    }
  }, [
    templateSheetOpen,
    pondSheetOpen,
    reportOpen,
    commandOpen,
    closeTemplateSheet,
    closeNewPondSheet,
    closeReport,
    pondId,
    runUndoStep,
    clearShownNotice,
    paletteOpen,
    pages,
    currentNodeId,
    path,
    router,
    railMinimized,
  ])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) setPaletteOpen(true)
      else {
        setMovePick(null)
        setBlockMovePick(null)
        if (templateSheetOpen) closeTemplateSheet()
        else setPaletteOpen(false)
      }
    },
    [templateSheetOpen, closeTemplateSheet]
  )

  // One owner for where a new page files: the palette's row names `parent.title`
  // and the dialog opens on `parent.id` — never derived twice.
  const parent = useMemo(
    () => newPageParent(pages, currentNodeId, pondName),
    [pages, currentNodeId, pondName]
  )

  // The palette's own ＋: no menu to anchor one to, so `new page` / `new page
  // “q”` creates directly under the page in view — the menu's "page" row,
  // minus the menu (KAN-198).
  const handleCreatePage = useCallback(
    async (query?: string) => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        const created = await createPage(supabase, user.id, {
          parentId: parent.id,
          type: 'page',
          title: query?.trim() || '',
          blocks: instantiateTemplate(PREMADE_TEMPLATES.page).blocks,
          pondId,
        })
        insertPageOptimistic(
          queryClient,
          { id: created.id, parentId: parent.id, type: 'page', title: created.title },
          pondId
        )
        writeRecent({ id: created.id, type: 'page', title: created.title }, pondId)
        requestTitleFocus(created.id)
        openWorkspaceUrl(workspaceUrl({ id: created.id, type: 'page', title: created.title }), router)
        void queryClient.invalidateQueries({ queryKey: pagesKey(pondId) })
        // KAN-415: a failed link append is not a failed page creation — the
        // page above has already landed and been navigated to.
        void appendChildLinkUnder(supabase, queryClient, parent.id, created.id, pondId, pondName)
      } catch {
        requestComposerNotice("can't make the page — try again.")
      }
    },
    [parent.id, pondId, pondName, queryClient, router]
  )

  // ⌘K "duplicate page" (KAN-468): the open page's own copy, through the
  // same `duplicateAndOpen` flow ⌘D on a focused rail row runs (AUDIT G9).
  const handleDuplicatePage = useCallback(async () => {
    if (!currentNodeId) return
    const page = pages.find((p) => p.id === currentNodeId)
    await duplicateAndOpen(
      queryClient,
      router,
      pondId,
      currentNodeId,
      page?.parent_id ?? null,
      { type: page?.type ?? 'page', title: page?.title ?? '' },
      requestComposerNotice
    )
  }, [currentNodeId, pages, pondId, queryClient, router])

  // `move page to…`'s own navigate-to-"open" (KAN-469) — same shape as Rail's
  // own `navigateTo`, the toast's "open" action after a drag-move.
  const navigateTo = useCallback(
    (node: { id: string; type: string; title: string }) => {
      openWorkspaceUrl(workspaceUrl(node), router)
    },
    [router]
  )

  const handlePaletteSelect = useCallback(
    (item: PaletteItem, options?: { newTab?: boolean }) => {
      // Pick mode (KAN-469): any picked row — including the synthetic root
      // row — is the move's target. Runs before every other branch below,
      // including the generic page-open fallback at the bottom.
      if (movePick) {
        // A picker row is always a real page/database id or the synthetic
        // root (`LIFE_ID`) — `movePickItems` mints nothing else, and pick
        // mode's dead end is a `note`, never a `row` (`pickMode`,
        // palette-entries.ts). Anything else is a stale item from a race with
        // the list swap — crash early in dev rather than let a fake id reach
        // `computeMove`, which doesn't verify an `into` target exists
        // (`canMove`/`moveParent`, rail/tree.ts).
        if (item.id !== LIFE_ID && !pages.some((p) => p.id === item.id)) {
          if (process.env.NODE_ENV !== 'production') {
            throw new Error(`move picker selected an unknown target: ${item.id}`)
          }
          return
        }
        const pickedId = movePick.id
        setMovePick(null)
        setPaletteOpen(false)
        void moveAndStageUndo(
          queryClient,
          pondId,
          pages,
          pickedId,
          item.id,
          'into',
          home,
          pondName,
          stageUndo,
          notify,
          navigateTo
        )
        return
      }
      // Block `move to…` pick mode (KAN-479 slice 1): `item.id` is always a
      // real page row (`blockMovePickItems` mints no synthetic root, unlike
      // `movePickItems` above), so the target is always in `pages`.
      if (blockMovePick) {
        const pick = blockMovePick
        const targetPage = pages.find((p) => p.id === item.id)
        setBlockMovePick(null)
        setPaletteOpen(false)
        if (!targetPage) return
        void moveBlockAndStageUndo(
          createClient(),
          queryClient,
          { blockId: pick.blockId, sourcePageId: pick.sourcePageId, targetPageId: targetPage.id, pondId, label: pick.label },
          targetPage,
          stageUndo,
          notify,
          navigateTo
        )
        return
      }
      if (item.action === 'save-as-template') {
        // The row lists only with a page open, so `currentNodeId` is set here.
        if (!currentNodeId) return
        startTemplateSheet(
          currentNodeId,
          pages.find((p) => p.id === currentNodeId)?.title || 'Untitled'
        )
        return
      }
      if (item.action === 'move-page') {
        // The row lists only with a page open, so `currentNodeId` is set here.
        // Pick mode is a filter on the same palette, not a new surface — it
        // stays open rather than closing like every other row below.
        if (!currentNodeId) return
        const page = pages.find((p) => p.id === currentNodeId)
        if (!page) return
        setMovePick({ id: page.id, title: page.title })
        return
      }
      setPaletteOpen(false)
      if (item.action === 'minimize-rail') {
        setRailMinimized(true)
        return
      }
      if (item.action === 'show-rail') {
        setRailMinimized(false)
        return
      }
      if (handleModeSelect(item.action)) return
      if (item.action === 'new-page') {
        void handleCreatePage(item.query)
        return
      }
      if (item.action === 'duplicate-page') {
        void handleDuplicatePage()
        return
      }
      if (item.action === 'favourite-page' || item.action === 'unfavourite-page') {
        if (!currentNodeId) return
        void toggleFavouritePage(currentNodeId)
        return
      }
      if (item.action === 'new-pond') {
        setNaming(item.query ?? '')
        return
      }
      if (item.action === 'ask-pond') {
        requestTerminalFocus(item.query)
        return
      }
      if (item.action === 'deep-research') {
        requestTerminalFocus(undefined, { research: true })
        return
      }
      if (item.action === 'import-a-page') {
        requestHtmlImportPicker()
        return
      }
      if (item.action === 'report-a-problem') {
        setReportStatus('idle')
        setReportFiled(null)
        setReportError(null)
        setReportOpen(true)
        return
      }
      if (item.kind === 'pond') {
        openWorkspaceUrl(pondHref(item.id, ponds.find((p) => p.id === item.id)?.lastPageId), router)
        return
      }
      if (item.kind === 'record') {
        openWorkspaceUrl(workspaceUrl({ id: item.id, type: ROW_TYPE, title: item.label }), router)
        return
      }
      if (item.kind === 'block') {
        const blockPage = pages.find((p) => p.id === item.pageId)
        if (!blockPage || !item.blockId) return
        const blockId = item.blockId
        // `blockLinkUrl` requires an absolute href (it calls `new URL(href)` with
        // no base) — `workspaceUrl` is deliberately origin-less (KAN-474, so server
        // and client agree byte-for-byte), so the origin is added here and
        // stripped back off before handing the url to `openWorkspaceUrl`/`window.open`,
        // which (like every other branch here) take the same relative shape `workspaceUrl` returns.
        const target = new URL(
          blockLinkUrl(
            `${window.location.origin}${workspaceUrl({
              id: blockPage.id,
              type: blockPage.type,
              title: blockPage.title,
            })}`,
            blockId
          )
        )
        const url = `${target.pathname}${target.search}${target.hash}`
        if (options?.newTab) window.open(url, '_blank', 'noopener')
        else openWorkspaceUrl(url, router)
        return
      }
      const page = pages.find((p) => p.id === item.id)
      if (page) {
        writeRecent({ id: page.id, type: page.type, title: page.title }, pondId)
        const url = workspaceUrl({ id: page.id, type: page.type, title: page.title })
        if (options?.newTab) window.open(url, '_blank', 'noopener')
        else openWorkspaceUrl(url, router)
      }
    },
    [
      pages,
      ponds,
      router,
      currentNodeId,
      handleModeSelect,
      startTemplateSheet,
      handleCreatePage,
      handleDuplicatePage,
      toggleFavouritePage,
      movePick,
      blockMovePick,
      queryClient,
      pondId,
      home,
      pondName,
      stageUndo,
      notify,
      navigateTo,
    ]
  )

  return (
    <>
      {naming !== null && (
        <NewPondFlow
          defaultName={naming}
          onClose={closeNewPondSheet}
          onPendingChange={handlePondCreatePendingChange}
        />
      )}
      {reportOpen && (
        <ReportProblemBox
          pageTitle={pageTitle}
          status={reportStatus}
          filedKey={reportFiled?.key}
          filedUrl={reportFiled?.url}
          errorText={reportError ?? undefined}
          onSubmit={handleReportSubmit}
          onClose={closeReport}
        />
      )}
      <PondCommand
        className={`${PLACEMENT} ${zenCommands.commandClassName(commandOpen)}`}
        path={path}
        open={commandOpen}
        onOpenChange={handleOpenChange}
        items={items}
        // Pick mode is its own filter on the list (`movePickItems`/
        // `blockMovePickItems` already swapped `items` above) — the
        // rail-scope filter would otherwise apply on top of it, against a
        // page `scope` no longer describes.
        scope={movePick || blockMovePick ? null : scope}
        pondName={pondName}
        parentTitle={parent.title}
        pondId={pondId}
        onSelect={handlePaletteSelect}
        onNavigate={(to) =>
          openWorkspaceUrl(workspaceUrl(to.kind === 'page' ? to.node : null), router)
        }
        onActiveItemChange={handleActiveItemChange}
        ask={movePick || blockMovePick ? false : !inZen}
        pickMode={!!movePick || !!blockMovePick}
        placeholder={
          movePick
            ? `move ${movePick.title || 'Untitled'} to…`
            : blockMovePick
              ? `move ${blockMovePick.label} to…`
              : undefined
        }
        enterHint={movePick || blockMovePick ? '↵ move' : undefined}
        resetOn={movePick?.id ?? blockMovePick?.blockId ?? null}
        visits={recentPageIds}
        onQueryChange={setQuery}
        sheet={templateSheet.sheet}
      />
      <UndoNotice notice={undoNotice} />
    </>
  )
}
