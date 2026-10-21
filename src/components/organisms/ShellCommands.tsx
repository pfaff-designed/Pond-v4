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
import type { PaletteItem } from '@/components/molecules/palette-entries'
import { normalizeQuery } from '@/components/molecules/slash-entries'
import { NewPondFlow } from '@/components/organisms/NewPondFlow'
import { PondCommand } from '@/components/organisms/PondCommand'
import { ReportProblemBox, type ReportProblemStatus } from '@/components/organisms/ReportProblemBox'
import { UndoNotice } from '@/components/molecules/UndoNotice'
import {
  clearUndoNotice,
  isComposerToggleKey,
  requestComposerNotice,
  requestComposerToggle,
  requestHtmlImportPicker,
  requestTerminalFocus,
  requestUndoNotice,
  useUndoNotice,
} from '@/lib/terminal-focus'
import {
  isPaletteChord,
  isMinimizeRailChord,
  isRedoChord,
  isUndoChord,
  onApplePlatform,
  SESSION_UNDO_SCOPE_ATTR,
} from '@/lib/shell-commands'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { editorHistoryEmptyFor } from '@/lib/modules/text/active-editor'
import { applyUndoOutcome } from '@/lib/change-log/undo-outcome'
import { describeChange, describeUndoneEffect } from '@/lib/change-log/page-changes'
import { getRecord } from '@/lib/change-log/store'
import { rememberStruckRow } from '@/lib/change-log/undo-strike'
import { useCommandPath } from '@/lib/layout/command-path'
import { setRailMinimized, toggleRail, useRailMinimized } from '@/lib/layout/rail-chrome'
import { PLACEMENT } from '@/lib/layout/shell-placement'
import { useZenCommands } from '@/lib/layout/use-zen-commands'
import { openWorkspaceUrl, workspaceUrl } from '@/lib/pages/nav'
import { flushPendingPageSave } from '@/lib/pages/page-flush'
import { newPageParent, paletteItems, paletteScope, pondItems, railItems } from '@/lib/pages/palette-items'
import { prefetchPageIfAbsent } from '@/lib/pages/use-page-prefetch'
import { readRecentPageIds, writeRecent } from '@/lib/pages/recent-pages'
import { usePaletteRecords } from '@/lib/pages/use-palette-records'
import { createPage } from '@/lib/pages/client'
import { insertPageOptimistic } from '@/lib/pages/tree'
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
import { useSaveAsTemplateSheet } from '@/components/organisms/use-save-as-template-sheet'
import { ROW_TYPE } from '@/lib/properties/schema'

/** Where ⌘Z/⇧⌘Z belongs to the field itself (Tiptap's own undo, an input, a select) —
 * except an empty page-title input (`data-pond-page-title`), which has nothing of
 * its own to undo, and a field inside a `SESSION_UNDO_SCOPE_ATTR` container (a list
 * or entry-log row), whose undo is the session's step, not the browser's field undo —
 * so the chord falls through to the session step instead. */
const isEditable = (el: Element | null): boolean =>
  el !== null &&
  el.matches('input, textarea, select, [contenteditable]') &&
  !isEmptyPageTitleInput(el) &&
  !el.closest(`[${SESSION_UNDO_SCOPE_ATTR}]`)

const isEmptyPageTitleInput = (el: Element): boolean =>
  el.hasAttribute('data-pond-page-title') && (el as HTMLInputElement).value === ''

export function ShellCommands() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const currentNodeId = searchParams.get('nodeId')
  const [paletteOpen, setPaletteOpen] = useState(false)
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
  const { pond, ponds } = usePond()
  const published = useCommandPath()
  const queryClient = useQueryClient()
  // `usePagesRows` (KAN-310 gap 1) drops a staged-for-delete id at once, so a
  // page mid-delete is gone from the palette's listing, not just the rail.
  const { data: pages } = usePagesRows(pondId)
  const records = usePaletteRecords(normalizeQuery(query))
  const undoNotice = useUndoNotice()

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
  const path = published ?? {
    glyph: pond?.glyph ?? LIFE_GLYPH,
    trail: [],
    current: pondName,
    role: null,
  }

  // KAN-388: the active row arrowed/typed to in ⌘K warms its page before ↵.
  const handleActiveItemChange = useCallback(
    (item: PaletteItem) => {
      prefetchPageIfAbsent(queryClient, createClient, item.id)
    },
    [queryClient]
  )

  const closePalette = useCallback(() => setPaletteOpen(false), [])
  const templateSheet = useSaveAsTemplateSheet({ pondId, onOpen: closePalette })
  const {
    open: templateSheetOpen,
    close: closeTemplateSheet,
    start: startTemplateSheet,
  } = templateSheet
  const closeNewPondSheet = useCallback(() => setNaming(null), [])

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
  const items = useMemo(
    () =>
      paletteOpen
        ? [
            ...paletteItems(pages, recentPageIds, currentNodeId),
            ...zenCommands.items,
            ...railItems(railMinimized),
            ...pondItems(ponds, pond?.id ?? null),
            ...records,
          ]
        : [],
    [
      pages,
      paletteOpen,
      currentNodeId,
      zenCommands.items,
      railMinimized,
      ponds,
      pond,
      records,
      recentPageIds,
    ]
  )
  const scope = useMemo(() => paletteScope(pages, currentNodeId), [pages, currentNodeId])

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
        else setPaletteOpen((prev) => !prev)
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
    closeTemplateSheet,
    closeNewPondSheet,
    closeReport,
    pondId,
    runUndoStep,
    clearShownNotice,
  ])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) setPaletteOpen(true)
      else if (templateSheetOpen) closeTemplateSheet()
      else setPaletteOpen(false)
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

  const handlePaletteSelect = useCallback(
    (item: PaletteItem) => {
      if (item.action === 'save-as-template') {
        // The row lists only with a page open, so `currentNodeId` is set here.
        if (!currentNodeId) return
        startTemplateSheet(
          currentNodeId,
          pages.find((p) => p.id === currentNodeId)?.title || 'Untitled'
        )
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
        router.push(pondHref(item.id, ponds.find((p) => p.id === item.id)?.lastPageId))
        return
      }
      if (item.kind === 'record') {
        openWorkspaceUrl(workspaceUrl({ id: item.id, type: ROW_TYPE, title: item.label }), router)
        return
      }
      const page = pages.find((p) => p.id === item.id)
      if (page) {
        writeRecent({ id: page.id, type: page.type, title: page.title }, pondId)
        openWorkspaceUrl(workspaceUrl({ id: page.id, type: page.type, title: page.title }), router)
      }
    },
    [pages, ponds, router, currentNodeId, handleModeSelect, startTemplateSheet, handleCreatePage]
  )

  const commandOpen = paletteOpen || templateSheetOpen

  return (
    <>
      {naming !== null && <NewPondFlow defaultName={naming} onClose={closeNewPondSheet} />}
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
        scope={scope}
        pondName={pondName}
        parentTitle={parent.title}
        onSelect={handlePaletteSelect}
        onActiveItemChange={handleActiveItemChange}
        ask={!inZen}
        visits={recentPageIds}
        onQueryChange={setQuery}
        sheet={templateSheet.sheet}
      />
      <UndoNotice notice={undoNotice} />
    </>
  )
}
