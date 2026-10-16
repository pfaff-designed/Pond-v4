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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import type { PaletteItem } from '@/components/molecules/palette-entries'
import { normalizeQuery } from '@/components/molecules/slash-entries'
import { NewPondFlow } from '@/components/organisms/NewPondFlow'
import { PondCommand } from '@/components/organisms/PondCommand'
import { ReportProblemBox } from '@/components/organisms/ReportProblemBox'
import {
  isComposerToggleKey,
  requestComposerNotice,
  requestComposerToggle,
  requestHtmlImportPicker,
  requestTerminalFocus,
} from '@/lib/terminal-focus'
import { isPaletteChord, isRedoChord, isUndoChord, onApplePlatform } from '@/lib/shell-commands'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { applyUndoOutcome } from '@/lib/change-log/undo-outcome'
import { useCommandPath } from '@/lib/layout/command-path'
import { useZenCommands } from '@/lib/layout/use-zen-commands'
import { workspaceUrl } from '@/lib/pages/nav'
import { newPageParent, paletteItems, paletteScope, pondItems } from '@/lib/pages/palette-items'
import { readRecentPageIds, writeRecent } from '@/lib/pages/recent-pages'
import { usePaletteRecords } from '@/lib/pages/use-palette-records'
import { createPage } from '@/lib/pages/client'
import { insertPageOptimistic } from '@/lib/pages/tree'
import { pagesKey } from '@/lib/pages/keys'
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

/** `Pond 05 Shell`'s placement: centred on the whole shell, 20px off its top. */
const PLACEMENT = 'absolute top-5 left-[calc(50%_+_13px)] w-max -translate-x-1/2'

/** Where ⌘Z/⇧⌘Z belongs to the field itself (Tiptap's own undo, an input, a select) —
 * except an empty page-title input (`data-pond-page-title`), which has nothing of
 * its own to undo, so the chord falls through to the session step instead. */
const isEditable = (el: Element | null): boolean =>
  el !== null &&
  el.matches('input, textarea, select, [contenteditable]') &&
  !isEmptyPageTitleInput(el)

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
  const pondId = usePondId()
  const pondName = usePondName()
  const { pond, ponds } = usePond()
  const published = useCommandPath()
  const queryClient = useQueryClient()
  // `usePagesRows` (KAN-310 gap 1) drops a staged-for-delete id at once, so a
  // page mid-delete is gone from the palette's listing, not just the rail.
  const { data: pages } = usePagesRows(pondId)
  const records = usePaletteRecords(normalizeQuery(query))

  // `applyUndoOutcome` owes everything downstream: the sidebar/rail mark, the
  // "Changes to this page" panel and the specific pages the step's records
  // touched on `done`, or a one-line notice otherwise — shared with the
  // composer's own undo chip (KAN-179) so a ⌘Z and a chip press settle the
  // same way.
  const runUndoStep = useCallback(
    (direction: 'undo' | 'redo') => {
      if (pondId === null) return
      const step = direction === 'undo' ? sessionUndo.undo(pondId) : sessionUndo.redo(pondId)
      step
        .then((result) => applyUndoOutcome(direction, result, queryClient))
        .catch(() => requestComposerNotice(`can't ${direction} — try again.`))
    },
    [pondId, queryClient]
  )

  // Before the open page has published its path, the pill reads the pond's root.
  const path = published ?? {
    glyph: pond?.glyph ?? LIFE_GLYPH,
    trail: [],
    current: pondName,
    role: null,
  }

  const closePalette = useCallback(() => setPaletteOpen(false), [])
  const templateSheet = useSaveAsTemplateSheet({ pondId, onOpen: closePalette })
  const {
    open: templateSheetOpen,
    close: closeTemplateSheet,
    start: startTemplateSheet,
  } = templateSheet
  const closeNewPondSheet = useCallback(() => setNaming(null), [])

  // Global ⌘K → toggle the palette, or close the sheet it launched (the list is not
  // open then, so a toggle would raise it behind the sheet). Capture phase on the
  // document, so it fires before a focused editor/input can swallow it.
  const pondSheetOpen = naming !== null
  const zenCommands = useZenCommands({
    blocked: templateSheetOpen || pondSheetOpen,
    onEnter: closePalette,
  })
  const { inZen, handleModeSelect } = zenCommands

  // Recents are read as the palette opens, so a page opened from it lists next time.
  const items = useMemo(
    () =>
      paletteOpen
        ? [
            ...paletteItems(pages, readRecentPageIds(), currentNodeId),
            ...zenCommands.items,
            ...pondItems(ponds, pond?.id ?? null),
            ...records,
          ]
        : [],
    [pages, paletteOpen, currentNodeId, zenCommands.items, ponds, pond, records]
  )
  const scope = useMemo(() => paletteScope(pages, currentNodeId), [pages, currentNodeId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isPaletteChord(e)) {
        e.preventDefault()
        e.stopPropagation()
        if (templateSheetOpen) closeTemplateSheet()
        else if (pondSheetOpen) closeNewPondSheet()
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
      // Undo/redo belongs to an editable field first — Tiptap's own undo, an
      // input, a select — so the shell never intercepts a keystroke they own.
      if (
        pondId === null ||
        e.defaultPrevented ||
        isEditable(e.target instanceof Element ? e.target : null) ||
        isEditable(document.activeElement)
      ) {
        return
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
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
  }, [templateSheetOpen, pondSheetOpen, closeTemplateSheet, closeNewPondSheet, pondId, runUndoStep])

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
        writeRecent({ id: created.id, type: 'page', title: created.title })
        router.push(workspaceUrl({ id: created.id, type: 'page', title: created.title }))
        void queryClient.invalidateQueries({ queryKey: pagesKey(pondId) })
      } catch {
        requestComposerNotice("can't make the page — try again.")
      }
    },
    [parent.id, pondId, queryClient, router]
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
        setReportOpen(true)
        return
      }
      if (item.kind === 'pond') {
        router.push(pondHref(item.id, ponds.find((p) => p.id === item.id)?.lastPageId))
        return
      }
      if (item.kind === 'record') {
        router.push(workspaceUrl({ id: item.id, type: ROW_TYPE, title: item.label }))
        return
      }
      const page = pages.find((p) => p.id === item.id)
      if (page) {
        writeRecent({ id: page.id, type: page.type, title: page.title })
        router.push(workspaceUrl({ id: page.id, type: page.type, title: page.title }))
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
          pageTitle={path.current}
          status="idle"
          onSubmit={() => {}}
          onClose={() => setReportOpen(false)}
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
        ask={!inZen}
        onQueryChange={setQuery}
        sheet={templateSheet.sheet}
      />
    </>
  )
}
