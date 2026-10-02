/**
 * PondBlock 2/4 (#238) — hover, selected, loading, error and disabled, measured off
 * `PondBlock.dc.html`'s `renderVals()`:
 *
 *   state     rest · hover · selected · empty · loading · error · deleted · disabled
 *   hover     block.boxShadow === cardShadow (NO card change); one row goes `hover`:
 *             R = { list 1, checklist 1, table 0, log 0, properties 0, gallery card 0 }
 *   selected  boxShadow `0 0 0 2px ${fg},${cardShadow}` — ring PLUS shadow;
 *             gallery card 1 goes `selected`
 *   loading   headNote 'loading…' · bars { display block, height h, width w,
 *             borderRadius 5, background a(.08) } in a stack (gap table 0 else 2):
 *             number [60%×52, 40%×10] · gallery [100%×120, 50%×10] · else [82%,64%,74%]×10
 *   error     <PondMolecule kind="notice" action="reconnect" title={errLine}>;
 *             errLine table/gallery/number 'pond can’t reach this sheet any more ·
 *             showing the last copy', else 'this block couldn’t load'
 *   disabled  opacity .4
 *
 * The class recipe is asserted here (jsdom has no layout); computed values live in
 * `PondBlock.stories.tsx`. `empty` is #239 and `deleted` is #240 — both fall through
 * to rest here.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import {
  PondBlock,
  POND_BLOCK_KINDS,
  POND_BLOCK_STATES,
  POND_BLOCK_HOVER_ROW,
  POND_BLOCK_SKELETON,
  blockErrorLine,
  type PondBlockBody,
  type PondBlockKind,
} from '@/components/organisms/PondBlock'

const classes = (el: Element) => el.className.split(' ')

function renderCard(kind: PondBlockKind, state: (typeof POND_BLOCK_STATES)[number], body?: PondBlockBody) {
  const { container } = render(
    <PondBlock kind={kind} heading="method" headNote="1 of 3" state={state}>
      {body ?? <p data-testid="body">body</p>}
    </PondBlock>
  )
  return container.firstElementChild as HTMLElement
}

const CARD_SHADOW = 'shadow-mn-card'
const RING = ['ring-2', 'ring-mn-text']

describe('PondBlockState — the board’s eight, one source of truth', () => {
  it('declares all eight board states in the board’s order', () => {
    expect(POND_BLOCK_STATES).toEqual([
      'rest',
      'hover',
      'selected',
      'empty',
      'loading',
      'error',
      'deleted',
      'disabled',
    ])
  })

  it('defaults to rest and stamps the state on the card', () => {
    const { container } = render(
      <PondBlock kind="list" heading="notifications" headNote="3">
        <p>body</p>
      </PondBlock>
    )
    expect((container.firstElementChild as HTMLElement).dataset.blockState).toBe('rest')
    expect(renderCard('list', 'selected').dataset.blockState).toBe('selected')
  })
})

describe('rest / hover — the card itself does not change', () => {
  it.each(['rest', 'hover', 'empty', 'deleted'] as const)(
    '%s keeps the card shadow with no ring, lift or opacity',
    (state) => {
      const card = renderCard('list', state)
      const cls = classes(card)
      expect(cls).toContain(CARD_SHADOW)
      for (const r of RING) expect(cls).not.toContain(r)
      expect(cls).not.toContain('opacity-40')
      expect(cls.some((c) => c.startsWith('hover:'))).toBe(false)
      expect(cls.some((c) => /translate|shadow-mn-(md|lg)/.test(c))).toBe(false)
      // The body renders — empty (#239) and deleted (#240) fall through to rest here.
      expect(screen.getByTestId('body')).toBeInTheDocument()
    }
  )

  it('hover paints the board’s row index per kind, and nothing for number', () => {
    expect(POND_BLOCK_HOVER_ROW).toEqual({
      list: 1,
      checklist: 1,
      table: 0,
      log: 0,
      properties: 0,
      gallery: 0,
      number: null,
    })
  })

  it.each(POND_BLOCK_KINDS)('%s: rowState(i) is hover only at the board index', (kind) => {
    const seen: string[] = []
    renderCard(kind, 'hover', ({ rowState }) => {
      for (let i = 0; i < 4; i++) seen.push(rowState(i))
      return <p data-testid="body">rows</p>
    })
    const idx = POND_BLOCK_HOVER_ROW[kind]
    seen.forEach((s, i) => expect(s).toBe(idx === i ? 'hover' : 'rest'))
  })

  it('at rest every row is rest', () => {
    renderCard('list', 'rest', ({ rowState }) => {
      expect([0, 1, 2].map(rowState)).toEqual(['rest', 'rest', 'rest'])
      return null
    })
  })
})

describe('selected — a 2px full-ink ring PLUS the card shadow', () => {
  it.each(POND_BLOCK_KINDS)('%s carries ring-2 ring-mn-text and shadow-mn-card together', (kind) => {
    const cls = classes(renderCard(kind, 'selected'))
    for (const r of RING) expect(cls).toContain(r)
    expect(cls).toContain(CARD_SHADOW)
    expect(cls).not.toContain('ring-inset')
  })

  it('gallery puts record-card 1 in selected; other kinds leave rows at rest', () => {
    renderCard('gallery', 'selected', ({ rowState }) => {
      expect([0, 1, 2].map(rowState)).toEqual(['rest', 'selected', 'rest'])
      return null
    })
    renderCard('list', 'selected', ({ rowState }) => {
      expect([0, 1, 2].map(rowState)).toEqual(['rest', 'rest', 'rest'])
      return null
    })
  })
})

describe('loading — the static three-bar skeleton', () => {
  it('the per-kind bar sets are the board’s', () => {
    const ten = [
      ['w-[82%]', 'h-[10px]'],
      ['w-[64%]', 'h-[10px]'],
      ['w-[74%]', 'h-[10px]'],
    ]
    expect(POND_BLOCK_SKELETON).toEqual({
      list: ten,
      checklist: ten,
      table: ten,
      log: ten,
      properties: ten,
      number: [
        ['w-[60%]', 'h-[52px]'],
        ['w-[40%]', 'h-[10px]'],
      ],
      gallery: [
        ['w-full', 'h-[120px]'],
        ['w-[50%]', 'h-[10px]'],
      ],
    })
  })

  it.each(POND_BLOCK_KINDS)('%s replaces the body with its bars and the note with loading…', (kind) => {
    const card = renderCard(kind, 'loading')
    expect(screen.queryByTestId('body')).toBeNull()
    expect(screen.getByText('loading…')).toBeInTheDocument()
    expect(screen.queryByText('1 of 3')).toBeNull()

    const stack = card.querySelector('[data-part="skeleton"]') as HTMLElement
    expect(stack).not.toBeNull()
    const stackCls = classes(stack)
    expect(stackCls).toContain('flex')
    expect(stackCls).toContain('flex-col')
    expect(stackCls).toContain(kind === 'table' ? 'gap-0' : 'gap-[2px]')

    const bars = Array.from(stack.children) as HTMLElement[]
    const spec = POND_BLOCK_SKELETON[kind]
    expect(bars).toHaveLength(spec.length)
    bars.forEach((bar, i) => {
      const cls = classes(bar)
      expect(cls).toContain('block')
      expect(cls).toContain('rounded-[5px]')
      expect(cls).toContain('bg-mn-text/[0.08]')
      expect(cls).toContain(spec[i][0])
      expect(cls).toContain(spec[i][1])
      // Static: the board draws no sweep, pulse or shimmer.
      expect(cls.some((c) => /animate|pulse|shimmer/.test(c))).toBe(false)
    })
  })

  it('the loading card keeps the card shadow and no ring', () => {
    const cls = classes(renderCard('list', 'loading'))
    expect(cls).toContain(CARD_SHADOW)
    for (const r of RING) expect(cls).not.toContain(r)
  })
})

describe('error — the existing notice molecule, reconnect, exact copy', () => {
  it('the copy per kind is the board’s, curly apostrophes included', () => {
    const sheet = 'pond can’t reach this sheet any more · showing the last copy'
    const block = 'this block couldn’t load'
    expect(blockErrorLine('table')).toBe(sheet)
    expect(blockErrorLine('gallery')).toBe(sheet)
    expect(blockErrorLine('number')).toBe(sheet)
    for (const kind of ['list', 'checklist', 'log', 'properties'] as const) {
      expect(blockErrorLine(kind)).toBe(block)
    }
    expect(sheet).toContain('’')
    expect(block).toContain('’')
  })

  it.each(POND_BLOCK_KINDS)('%s replaces the body with the notice and keeps its own headNote', (kind) => {
    const card = renderCard(kind, 'error')
    expect(screen.queryByTestId('body')).toBeNull()
    const notice = card.querySelector('[data-kind="notice"]') as HTMLElement
    expect(notice).not.toBeNull()
    expect(notice.querySelector('[data-part="title"]')!.textContent).toBe(blockErrorLine(kind))
    expect(notice.querySelector('[data-part="action"]')!.textContent).toBe('reconnect')
    // The head row stays with the kind's normal note, not `loading…`.
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    expect(screen.queryByText('loading…')).toBeNull()
    // There is exactly one notice and it is PondMolecule's — not a second component.
    expect(card.querySelectorAll('[data-kind="notice"]')).toHaveLength(1)
  })
})

describe('disabled — opacity .4 and nothing else', () => {
  it('adds opacity-40 only; shadow and paper stay', () => {
    const card = renderCard('list', 'disabled')
    const cls = classes(card)
    expect(cls).toContain('opacity-40')
    expect(cls).toContain(CARD_SHADOW)
    expect(cls).toContain('bg-mn-card')
    for (const r of RING) expect(cls).not.toContain(r)
    expect(screen.getByTestId('body')).toBeInTheDocument()
  })
})
