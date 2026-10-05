'use client'

/**
 * The shell's command owner (#96; was `TopBar`). Renders NO chrome of its own.
 *
 * Owns the ⌘K palette (#279): pages, records and actions in one list, over the
 * shared `['pages']` cache via `lib/pages/palette-items`. The breadcrumb's ⌘K chip
 * raises a decoupled request (`lib/shell-commands`) that this organism answers.
 * ⌘K is Ctrl+K off a Mac (AUDIT K3's Ctrl substitution, for this key). This file is
 * its one owner: it opens the palette, closes it, and closes the save-as-template
 * sheet the palette becomes — `CommandPalette` itself only handles esc and a press
 * outside.
 *
 * The palette's `new page` rows (bare, or minted from the query as `new page “q”`)
 * open the New page dialog here: name-first, defaulting the destination to the
 * page in view, then landing in the editor. `ask pond about “q”` lands in the
 * composer prefilled.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CreatePageModal } from '@/components/organisms/CreatePageModal'
import type { PaletteItem } from '@/components/molecules/CommandPalette'
import { NewPondFlow } from '@/components/organisms/NewPondFlow'
import { ShellPalette } from '@/components/organisms/ShellPalette'
import { requestTerminalFocus } from '@/lib/terminal-focus'
import { isPaletteChord, OPEN_PALETTE_EVENT } from '@/lib/shell-commands'
import { workspaceUrl } from '@/lib/pages/nav'
import { newPageParent, paletteItems, paletteScope } from '@/lib/pages/palette-items'
import { fetchPages } from '@/lib/pages/tree'
import { pagesKey } from '@/lib/pages/keys'
import { usePondName } from '@/lib/pond/name'
import { usePondId } from '@/lib/pond/context'
import { pondHref } from '@/lib/pond/active'
import { SaveAsTemplateBody } from '@/components/organisms/SaveAsTemplateSheet'
import { templateSummary } from '@/lib/templates/summary'
import { getPage } from '@/lib/pages/client'
import { createTemplate } from '@/lib/templates/client'
import { templateBlocksFrom } from '@/lib/templates/from-page'
import type { Block } from '@/lib/modules/content'
import { ROW_TYPE } from '@/lib/properties/schema'
import { createClient } from '@/lib/supabase/client'

const RECENT_PAGES_KEY = 'pond:recent-pages'
/** `Pond 02` 2g: "before anything is typed: the last three pages". */
const RECENT_MAX = 3

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
  // `new pond “q”`: the sheet is open, holding the name the palette handed over.
  const [naming, setNaming] = useState<string | null>(null)
  const pondId = usePondId()
  const pondName = usePondName()

  const { data: pages = [] } = useQuery({
    queryKey: pagesKey(pondId),
    queryFn: () => fetchPages(pondId),
  })

  const closePalette = useCallback(() => setPaletteOpen(false), [])

  // Recents are read as the palette opens, so a page opened from it lists next time.
  const items = useMemo(
    () =>
      paletteOpen
        ? paletteItems(
            pages,
            readRecents().map((r) => r.id),
            currentNodeId
          )
        : [],
    [pages, paletteOpen, currentNodeId]
  )
  const scope = useMemo(() => paletteScope(pages, currentNodeId), [pages, currentNodeId])
  /**
   * `6i` frame 3. Saving is a page action, so the sheet opens on the page in
   * view — and the palette BECOMES the sheet rather than being covered by one,
   * so the name, the tick and the in-flight state live here and are handed to
   * `CommandPalette`'s sheet mode. One owner for the name: it is both the head's
   * field and the template's name.
   */
  const [saveTemplateFor, setSaveTemplateFor] = useState<{
    id: string
    title: string
    blocks: Block[]
  } | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [keepContent, setKeepContent] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)

  const closeTemplateSheet = useCallback(() => {
    setSaveTemplateFor(null)
    setTemplateError(null)
    setSavingTemplate(false)
  }, [])
  const closeNewPondSheet = useCallback(() => setNaming(null), [])

  // Global ⌘K → toggle the palette, or close the sheet it launched (the list is not
  // open then, so a toggle would raise it behind the sheet). Capture phase on the
  // document, so it fires before a focused editor/input can swallow it. The
  // breadcrumb's ⌘K chip arrives as a window event.
  const templateSheetOpen = saveTemplateFor !== null
  const pondSheetOpen = naming !== null
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isPaletteChord(e)) return
      e.preventDefault()
      e.stopPropagation()
      if (templateSheetOpen) closeTemplateSheet()
      else if (pondSheetOpen) closeNewPondSheet()
      else setPaletteOpen((prev) => !prev)
    }
    const openPalette = () => setPaletteOpen(true)
    document.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener(OPEN_PALETTE_EVENT, openPalette)
    return () => {
      document.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener(OPEN_PALETTE_EVENT, openPalette)
    }
  }, [templateSheetOpen, pondSheetOpen, closeTemplateSheet, closeNewPondSheet])

  // One owner for where a new page files: the palette's row names `parent.title`
  // and the dialog opens on `parent.id` — never derived twice.
  const parent = useMemo(
    () => newPageParent(pages, currentNodeId, pondName),
    [pages, currentNodeId, pondName]
  )

  const handlePaletteSelect = useCallback(
    (item: PaletteItem) => {
      closePalette()
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
      if (item.action === 'save-as-template') {
        // The row lists only with a page open, so `currentNodeId` is set here.
        if (!currentNodeId) return
        const open = pages.find((p) => p.id === currentNodeId)
        const title = open?.title || 'Untitled'
        setTemplateName(title)
        setKeepContent(false)
        setTemplateError(null)
        setSavingTemplate(false)
        // The BLOCKS are read now rather than at save time: `6i` frame 3 draws a
        // summary of what the template will contain ("6 blocks — …"), so the
        // sheet cannot be drawn without them. `fetchPages` is a lean projection
        // with no `blocks`, and the open page's cache belongs to DocumentPanel.
        void (async () => {
          const page = await getPage(createClient(), currentNodeId)
          setSaveTemplateFor({ id: currentNodeId, title, blocks: page?.blocks ?? [] })
        })()
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
    [closePalette, pages, router, currentNodeId]
  )

  /**
   * Save the page in view as a template (KAN-10 / #157, board `6i`).
   *
   * The page's BLOCKS are fetched here rather than held in state: the palette
   * reads `fetchPages`, a lean projection with no `blocks` at all, and the open
   * page's own cache belongs to `DocumentPanel`. One read at save time is both
   * simpler and certain to be current.
   *
   * `templateBlocksFrom` is what decides what the template carries — by default
   * the stack, the labels and the placeholders, never the content (`6i` frame 4).
   */
  const saveAsTemplate = useCallback(async () => {
    const target = saveTemplateFor
    const name = templateName.trim()
    if (!target || name === '' || savingTemplate) return
    setSavingTemplate(true)
    setTemplateError(null)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      await createTemplate(supabase, user.id, {
        name,
        // Saved shapes are the generic `page` kind; the twelve specific kinds
        // belong to the premades (#155), which are code constants, not rows.
        kind: 'page',
        blocks: templateBlocksFrom(target.blocks, () => crypto.randomUUID(), { keepContent }),
        // `listTemplates` filters on the pond, so an unstamped template would be
        // invisible in every pond including this one.
        pondId,
      })
      closeTemplateSheet()
    } catch (err) {
      // A same-pond name collision is the person's to resolve — `createTemplate`
      // raises `DuplicateTemplateNameError` and deliberately does NOT auto-suffix
      // the way `createPage` does. So the sheet stays open with the message.
      setTemplateError(err instanceof Error ? err.message : 'Could not save the template')
      setSavingTemplate(false)
    }
  }, [saveTemplateFor, templateName, keepContent, savingTemplate, pondId, closeTemplateSheet])

  return (
    <>
      <CreatePageModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultParentId={parent.id}
        defaultTitle={createTitle}
      />
      {naming !== null && <NewPondFlow defaultName={naming} onClose={closeNewPondSheet} />}
      {(paletteOpen || saveTemplateFor) && (
        <ShellPalette
          items={items}
          scope={scope}
          pondName={pondName}
          parentTitle={parent.title}
          onSelect={handlePaletteSelect}
          onClose={saveTemplateFor ? closeTemplateSheet : closePalette}
          sheet={
            saveTemplateFor
              ? {
                  body: (
                    <SaveAsTemplateBody
                      keepContent={keepContent}
                      onKeepContentChange={setKeepContent}
                      summary={templateSummary(saveTemplateFor.blocks)}
                      canSave={templateName.trim() !== '' && !savingTemplate}
                      saving={savingTemplate}
                      error={templateError}
                      onSave={() => void saveAsTemplate()}
                      onCancel={closeTemplateSheet}
                    />
                  ),
                  value: templateName,
                  onValueChange: setTemplateName,
                  placeholder: 'name this template',
                  onSubmit: () => void saveAsTemplate(),
                  label: 'Template name',
                }
              : null
          }
        />
      )}
    </>
  )
}
