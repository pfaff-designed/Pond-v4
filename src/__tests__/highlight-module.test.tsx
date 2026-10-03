/**
 * The `highlight` block (#249, child 228a) — wheat's one legal job. A block-level
 * kept passage, measured off `PondTemplate.dc.html`'s `renderVals()`
 * (`k === 'highlight'`):
 *
 *   filled  align-self flex-start · padding 4px 8px · #FFEFAE ground · #1B1D14 text ·
 *           serif 200 / 16 / 1.5
 *   empty   serif 200 / 16 at ink .68 — and NO wheat ground
 *
 * Registry facets (schema + serialize), the emit union, the palette, and the view's
 * two faces. The computed values (and the dark theme keeping ink text on wheat) are
 * asserted in `view.stories.tsx`; jsdom has no layout, so here the class recipe is
 * the contract.
 *
 * NOT the inline `highlight` atom (`PondAtom.tsx`): that is a marked span inside
 * prose at `px-[3px]` / 17.5px / leading-relaxed. Two boards, two contexts, two sets
 * of values — they share the TOKENS, never the measurements.
 */

import React, { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import {
  highlightSchema,
  highlightDescriptor,
  HIGHLIGHT_EMPTY_LINE,
  type HighlightBlock,
} from '@/lib/modules/highlight/schema'
import { HighlightView } from '@/lib/modules/highlight/view'
import { blockSchema } from '@/lib/modules/content'
import { moduleDescriptors } from '@/lib/modules/registry'
import { moduleRenderers } from '@/lib/modules/renderers'
import {
  moduleDataSchema,
  createPageBlockSchema,
  moduleCatalog,
} from '@/lib/modules/ai-composition'
import { emptyBlockForType, slashRows } from '@/lib/modules/palette'
import { blockFrame } from '@/lib/modules/block-frame'

const kept: HighlightBlock = {
  id: 'h1',
  type: 'highlight',
  content: 'Three books at once is one too many.',
}

const has = (el: Element, ...classes: string[]) => {
  const list = el.className.split(' ')
  for (const c of classes) expect(list).toContain(c)
}
const lacks = (el: Element, ...classes: string[]) => {
  const list = el.className.split(' ')
  for (const c of classes) expect(list).not.toContain(c)
}

describe('highlight schema + registry facets', () => {
  it('persists through blockSchema (round-trips a kept passage)', () => {
    expect(blockSchema.parse(kept)).toEqual(kept)
  })

  it('is registered in both halves of the two-map contract', () => {
    expect(moduleDescriptors.highlight).toBe(highlightDescriptor)
    expect(moduleRenderers.highlight.view).toBe(HighlightView)
  })

  it('serializes with a Highlight: marker so a wholesale re-emit keeps it a highlight', () => {
    // `blocksToText` joins serialized lines with no type label, so bare content
    // would read as prose to the model and come back as a `text` block.
    expect(highlightDescriptor.serialize(kept)).toBe(
      'Highlight: Three books at once is one too many.'
    )
    expect(highlightDescriptor.serialize({ ...kept, content: '' })).toBe(
      'Highlight: (no passage kept yet)'
    )
    // No nested id-bearing collections — a flat top-level id strip is the whole chain.
    expect(highlightDescriptor.nestedIdPaths).toBeUndefined()
  })

  it('is AI-composable id-less (moduleDataSchema + createPageBlockSchema)', () => {
    const data = { type: 'highlight', content: kept.content }
    const r = moduleDataSchema.safeParse(data)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toEqual(data)
    expect(createPageBlockSchema.safeParse({ ...data, bindKey: 'k' }).success).toBe(true)
    // An id the model volunteers is dropped, not honoured.
    const stripped = moduleDataSchema.parse({ id: 'ai-made', ...data })
    expect('id' in stripped).toBe(false)
  })

  it('teaches the model when a highlight is right: a passage worth keeping, not prose, not a banner', () => {
    const line = moduleCatalog.split('\n').find((l) => l.startsWith('- highlight:'))
    expect(line).toBeDefined()
    expect(line).toMatch(/passage/i)
    expect(line).toMatch(/keep|kept/i)
    // Distinguished from a plain text block and from a callout/banner.
    expect(line).toMatch(/text/i)
    expect(line).toMatch(/not .*(callout|banner)/i)
  })

  it('is offered by the palette and mints an empty passage', () => {
    expect(slashRows.some((r) => r.type === 'highlight')).toBe(true)
    const empty = emptyBlockForType('highlight')
    expect(empty).not.toBeNull()
    expect(empty).toMatchObject({ type: 'highlight', content: '' })
    expect(blockSchema.safeParse(empty).success).toBe(true)
  })

  it('renders in the default 400 card (list) with its kind as the eyebrow and no note', () => {
    // PondBlock.dc.html gives `highlight` no kind of its own; PondTemplate.dc.html
    // puts it in the normal block card. `list` (400) is the default card, as image's.
    expect(blockFrame(kept)).toEqual({ kind: 'list', heading: 'highlight', headNote: '' })
  })
})

// ── The view: wheat appears only when there is a passage ─────────────────────────

const FILLED = [
  'self-start', // align-self flex-start — hugs the text, never spans the card
  'px-mn-2', // padding 4px 8px
  'py-mn-1',
  'bg-mn-signal-highlight', // #FFEFAE, via the token (same raw value under .dark)
  'text-mn-signal-highlight-ink', // #1B1D14, via the token (does NOT flip under .dark)
  'font-serif',
  'font-extralight', // 200 — never 400
  'text-mn-16',
  'leading-normal', // 1.5
]

describe('HighlightView — read-only', () => {
  it('a kept passage wears wheat, ink text and the serif at 200 / 16 / 1.5, shrink-wrapped', () => {
    render(<HighlightView data={kept} />)
    const passage = screen.getByText(kept.content)
    expect(passage.dataset.part).toBe('passage')
    has(passage, ...FILLED)
    lacks(passage, 'text-mn-text', 'text-mn-text-secondary', 'w-full')
    // The passage is a flex item of a column, so `self-start` has something to act on.
    has(passage.parentElement!, 'flex', 'flex-col')
  })

  it('an empty block paints NO wheat: the serif at 200 / 16 on ink .68, and the board’s line', () => {
    render(<HighlightView data={{ ...kept, content: '' }} />)
    const passage = screen.getByText(HIGHLIGHT_EMPTY_LINE)
    expect(HIGHLIGHT_EMPTY_LINE).toBe('a line worth keeping')
    has(passage, 'font-serif', 'font-extralight', 'text-mn-16', 'text-mn-text-secondary')
    lacks(passage, 'bg-mn-signal-highlight', 'text-mn-signal-highlight-ink', 'px-mn-2', 'py-mn-1')
    expect(passage.dataset.empty).toBe('')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('whitespace-only content is empty too', () => {
    render(<HighlightView data={{ ...kept, content: '   \n ' }} />)
    expect(screen.getByText(HIGHLIGHT_EMPTY_LINE)).toBeInTheDocument()
  })
})

function Stateful({ data }: { data: HighlightBlock }) {
  const [state, setState] = useState(data)
  return <HighlightView data={state} editable onChange={setState} />
}

describe('HighlightView — editable (click-to-edit, as text)', () => {
  it('starts rendered; click drops into a serif textarea with the passage intact; blur returns', async () => {
    render(<Stateful data={kept} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    has(screen.getByText(kept.content), 'bg-mn-signal-highlight')

    fireEvent.click(screen.getByRole('button', { name: 'Edit highlight block' }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe(kept.content)
    expect(textarea.placeholder).toBe(HIGHLIGHT_EMPTY_LINE)
    // The source keeps the passage's register (serif 200 / 16 / 1.5) — but no wheat
    // while editing: the ground belongs to the kept passage, not the textarea.
    has(textarea, 'font-serif', 'font-extralight', 'text-mn-16', 'leading-normal')
    lacks(textarea, 'bg-mn-signal-highlight')

    fireEvent.change(textarea, { target: { value: 'Three books at once.' } })
    fireEvent.blur(textarea)
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    has(screen.getByText('Three books at once.'), ...FILLED)
  })

  it('an empty editable block starts editing; blurring leaves a clickable placeholder with no wheat', async () => {
    render(<Stateful data={{ ...kept, content: '' }} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.blur(textarea)
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    const trigger = screen.getByRole('button', { name: 'Edit highlight block' })
    const line = screen.getByText(HIGHLIGHT_EMPTY_LINE)
    lacks(line, 'bg-mn-signal-highlight')
    fireEvent.click(trigger)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('Escape leaves edit mode; Enter / Space on the trigger enter it', async () => {
    render(<Stateful data={kept} />)
    const trigger = screen.getByRole('button', { name: 'Edit highlight block' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    const textarea = screen.getByRole('textbox')
    fireEvent.keyDown(textarea, { key: 'Escape' })
    fireEvent.blur(textarea)
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit highlight block' }), { key: ' ' })
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('onChange emits the whole next block (full-state contract)', () => {
    const onChange = jest.fn()
    render(<HighlightView data={kept} editable onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit highlight block' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } })
    expect(onChange).toHaveBeenCalledWith({ ...kept, content: 'x' })
  })
})

describe('highlightSchema', () => {
  it('rejects a passage without content', () => {
    expect(highlightSchema.safeParse({ id: 'h', type: 'highlight' }).success).toBe(false)
  })
})
