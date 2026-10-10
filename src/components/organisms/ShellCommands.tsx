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
 * open the New page dialog here: name-first, defaulting the destination to the
 * page in view, then landing in the editor. `ask pond about “q”` lands in the
 * composer prefilled.
 *
 * Zen's rows, ⌘. and the breadcrumb in zen are `useZenCommands`. Zen hides the
 * composer and it must come back as it was left, so in zen ⌘J does nothing and
 * the palette mints no `ask pond about “q”`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CreatePageModal } from '@/components/organisms/CreatePageModal'
import type { PaletteItem } from '@/components/molecules/palette-entries'
import { normalizeQuery } from '@/components/molecules/slash-entries'
import { NewPondFlow } from '@/components/organisms/NewPondFlow'
import { PondCommand } from '@/components/organisms/PondCommand'
import {
  isComposerToggleKey,
  requestComposerToggle,
  requestTerminalFocus,
} from '@/lib/terminal-focus'
import { isPaletteChord } from '@/lib/shell-commands'
import { useCommandPath } from '@/lib/layout/command-path'
import { useZenCommands } from '@/lib/layout/use-zen-commands'
import { workspaceUrl } from '@/lib/pages/nav'
import { newPageParent, paletteItems, paletteScope, pondItems } from '@/lib/pages/palette-items'
import { usePaletteRecords } from '@/lib/pages/use-palette-records'
import { fetchPages } from '@/lib/pages/tree'
import { pagesKey } from '@/lib/pages/keys'
import { usePondName } from '@/lib/pond/name'
import { usePond, usePondId } from '@/lib/pond/context'
import { pondHref } from '@/lib/pond/active'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'
import { useSaveAsTemplateSheet } from '@/components/organisms/use-save-as-template-sheet'
import { ROW_TYPE } from '@/lib/properties/schema'

const RECENT_PAGES_KEY = 'pond:recent-pages'
/** `Pond 02` 2g: "before anything is typed: the last three pages". */
const RECENT_MAX = 3

/** `Pond 05 Shell`'s placement: centred on the whole shell, 20px off its top. */
const PLACEMENT = 'absolute top-5 left-[calc(50%_+_13px)] w-max -translate-x-1/2'

interface RecentEntry {
  id: string
  type: string
  title: string
}

function readRecents(): RecentEntry[] {
  try {
    // Capped on read as well as on write: a list written under an older, larger cap
    // would otherwise list whole until the next page is opened from the palette.
    const stored: RecentEntry[] = JSON.parse(window.localStorage.getItem(RECENT_PAGES_KEY) ?? '[]')
    return stored.slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

function writeRecent(entry: RecentEntry) {
  try {
    const prev = readRecents().filter((r) => r.id !== entry.id)
    window.localStorage.setItem(
      RECENT_PAGES_KEY,
      JSON.stringify([entry, ...prev].slice(0, RECENT_MAX))
    )
  } catch {
    /* ignore */
  }
}

export function ShellCommands() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const currentNodeId = searchParams.get('nodeId')
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [query, setQuery] = useState('')
  // `new pond “q”`: the sheet is open, holding the name the palette handed over.
  const [naming, setNaming] = useState<string | null>(null)
  const pondId = usePondId()
  const pondName = usePondName()
  const { pond, ponds } = usePond()
  const published = useCommandPath()
  const { data: pages = [] } = useQuery({
    queryKey: pagesKey(pondId),
    queryFn: () => fetchPages(pondId),
  })
  const records = usePaletteRecords(normalizeQuery(query))

  // Before the open page has published its path, the pill reads the pond's root.
  const path = published ?? { glyph: pond?.glyph ?? LIFE_GLYPH, trail: [], current: pondName }

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
    blocked: createOpen || templateSheetOpen || pondSheetOpen,
    onEnter: closePalette,
  })
  const { inZen, handleModeSelect } = zenCommands

  // Recents are read as the palette opens, so a page opened from it lists next time.
  const items = useMemo(
    () =>
      paletteOpen
        ? [
            ...paletteItems(
              pages,
              readRecents().map((r) => r.id),
              currentNodeId
            ),
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
        if (!e.repeat && !inZen) requestComposerToggle()
      }
    }
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
  }, [templateSheetOpen, pondSheetOpen, closeTemplateSheet, closeNewPondSheet, inZen])

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
        setCreateTitle(item.query ?? '')
        setCreateOpen(true)
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
      if (item.kind === 'pond') {
        router.push(pondHref(item.id))
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
    [pages, router, currentNodeId, handleModeSelect, startTemplateSheet]
  )

  const commandOpen = paletteOpen || templateSheetOpen

  return (
    <>
      <CreatePageModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultParentId={parent.id}
        defaultTitle={createTitle}
      />
      {naming !== null && <NewPondFlow defaultName={naming} onClose={closeNewPondSheet} />}
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
