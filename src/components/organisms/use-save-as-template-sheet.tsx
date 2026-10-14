'use client'

/**
 * `6i` frame 3. Saving is a page action, so the sheet opens on the page in
 * view — and the palette BECOMES the sheet rather than being covered by one,
 * so the name, the tick and the in-flight state live here and are handed to
 * `PondCommand`'s sheet mode. One owner for the name: it is both the field and
 * the template's name.
 */

import { useCallback, useMemo, useState } from 'react'

import type { PaletteSheet } from '@/components/organisms/PondCommand'
import { SaveAsTemplateBody } from '@/components/organisms/SaveAsTemplateSheet'
import type { Block } from '@/lib/modules/content'
import { getPage } from '@/lib/pages/client'
import { createClient } from '@/lib/supabase/client'
import { createTemplate } from '@/lib/templates/client'
import { templateBlocksFrom } from '@/lib/templates/from-page'
import { justSaved } from '@/lib/templates/just-saved'
import { templateSummary } from '@/lib/templates/summary'

export const useSaveAsTemplateSheet = ({
  pondId,
  onOpen,
}: {
  pondId: string | null
  /** Called as the sheet replaces the palette's list. */
  onOpen: () => void
}) => {
  const [saveTemplateFor, setSaveTemplateFor] = useState<{
    id: string
    title: string
    blocks: Block[]
  } | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [keepContent, setKeepContent] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)

  const close = useCallback(() => {
    setSaveTemplateFor(null)
    setTemplateError(null)
    setSavingTemplate(false)
  }, [])

  const start = useCallback(
    (id: string, title: string) => {
      setTemplateName(title)
      setKeepContent(false)
      setTemplateError(null)
      setSavingTemplate(false)
      // The BLOCKS are read now rather than at save time: `6i` frame 3 draws a
      // summary of what the template will contain ("6 blocks — …"), so the
      // sheet cannot be drawn without them. `fetchPages` is a lean projection
      // with no `blocks`, and the open page's cache belongs to DocumentPanel.
      // The list stays open until the sheet replaces it, so the box never
      // collapses between the two.
      void (async () => {
        const page = await getPage(createClient(), id)
        setSaveTemplateFor({ id, title, blocks: page?.blocks ?? [] })
        onOpen()
      })()
    },
    [onOpen]
  )

  /**
   * Save the page in view as a template (KAN-10 / #157, board `6i`).
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
      const created = await createTemplate(supabase, user.id, {
        name,
        // Saved shapes are the generic `page` kind; the twelve specific kinds
        // belong to the premades (#155), which are code constants, not rows.
        kind: 'page',
        blocks: templateBlocksFrom(target.blocks, () => crypto.randomUUID(), { keepContent }),
        // `listTemplates` filters on the pond, so an unstamped template would be
        // invisible in every pond including this one.
        pondId,
      })
      // KAN-138: leads the blank list, hinted `yours · just saved`, until it is
      // first applied or the tab closes.
      if (pondId) justSaved.set(pondId, created.id)
      close()
    } catch (err) {
      // A same-pond name collision is the person's to resolve — `createTemplate`
      // raises `DuplicateTemplateNameError` and deliberately does NOT auto-suffix
      // the way `createPage` does. So the sheet stays open with the message.
      setTemplateError(err instanceof Error ? err.message : 'Could not save the template')
      setSavingTemplate(false)
    }
  }, [saveTemplateFor, templateName, keepContent, savingTemplate, pondId, close])

  const sheet = useMemo<PaletteSheet | null>(
    () =>
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
                onCancel={close}
              />
            ),
            value: templateName,
            onValueChange: setTemplateName,
            placeholder: 'name this template',
            onSubmit: () => void saveAsTemplate(),
            label: 'Template name',
          }
        : null,
    [
      saveTemplateFor,
      keepContent,
      templateName,
      savingTemplate,
      templateError,
      saveAsTemplate,
      close,
    ]
  )

  return { open: saveTemplateFor !== null, start, close, sheet }
}
