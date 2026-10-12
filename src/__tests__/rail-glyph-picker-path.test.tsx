/**
 * KAN-248 fix (`src/__tests__/mark-everywhere.test.ts:1-10` names the gap):
 * every other new suite proves the glyph picker through pure helpers or a
 * Storybook `play` function, never a jest render — so a picker whose cells
 * had no `onClick`, whose search field was never focused and whose arrow
 * keys trapped the caret all passed a green `npx jest` run. This renders the
 * real hosting surface (`RailView`, as `rail-rename.test.tsx` does) and walks
 * PATH_STEPS with `userEvent`: a real click on a mark, a real click on a
 * glyph cell (never a key), and asserts the row's own mark repaints —
 * mirroring `Rail.stories.tsx`'s `GlyphPickHarness`, which plays the part of
 * `Rail()`'s own `marks` memo so the redraw shows with no container.
 */
import React, { useState, type ComponentProps } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RailView, type RailNode } from '@/components/organisms/Rail'
import type { MarkSource } from '@/lib/pages/mark'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

const node = (
  id: string,
  title: string,
  children: RailNode[] = [],
  parentId: string | null = null,
  order = 0
): RailNode => ({ id, parentId, type: 'page', title, order, children })

const health = node('health', 'Health')
const scratch = node('scratch', 'Scratchpad', [], null, 1)

/** Plays the part of `Rail()`'s own `marks` memo — `Rail.stories.tsx`'s own `GlyphPickHarness`, in jest. */
function GlyphPickHarness(args: ComponentProps<typeof RailView>) {
  const [marks, setMarks] = useState<ReadonlyMap<string, MarkSource>>(new Map())
  return (
    <RailView
      {...args}
      marks={marks}
      onPickGlyph={(id, glyph) => {
        args.onPickGlyph(id, glyph)
        const target = [health, scratch].find((n) => n.id === id)
        setMarks((prev) =>
          new Map(prev).set(id, {
            id,
            parentId: target?.parentId ?? null,
            title: target?.title ?? id,
            glyph,
          })
        )
      }}
    />
  )
}

function setup() {
  const handlers = {
    onRename: jest.fn(),
    onPickGlyph: jest.fn(),
    onDelete: jest.fn(),
    onAddChild: jest.fn(),
    onSelect: jest.fn(),
  }
  const utils = render(
    <GlyphPickHarness
      tree={[health, scratch]}
      pondName="life"
      selectedId="health"
      expanded={new Set()}
      lifeExpanded
      busyId={null}
      isLoading={false}
      isEmpty={false}
      onToggle={jest.fn()}
      onLife={jest.fn()}
      onToggleLife={jest.fn()}
      onOpenDatabases={jest.fn()}
      canDrop={() => true}
      onMove={jest.fn()}
      {...handlers}
    />
  )
  return { ...utils, ...handlers }
}

const row = (name: string) => screen.getByRole('treeitem', { name: new RegExp(`^${name}`) })
const markOf = (name: string) =>
  within(row(name)).getByRole('button', { name: `change icon for ${name}` })
const iconOf = (name: string) =>
  row(name).querySelector('[data-area-mark] [data-icon]')?.getAttribute('data-icon')

describe('rail — the glyph picker, walked by click and key', () => {
  it('a real click on a mark, then a real click on a cell, repaints the mark', async () => {
    setup()
    const mark = markOf('Health')
    const before = iconOf('Health')

    await userEvent.click(mark)
    const cell = (await within(document.body).findAllByRole('gridcell'))[0]
    const picked = cell.getAttribute('aria-label')
    await userEvent.click(cell)

    expect(document.body.querySelector('[data-part="glass"]')).toBeNull()
    expect(mark).toHaveAttribute('aria-expanded', 'false')
    expect(mark).toHaveFocus()
    expect(iconOf('Health')).not.toBe(before)
    expect(within(row('Health')).getByRole('button', { name: 'change icon for Health' })).toBe(
      mark
    )
    expect(picked).toBeTruthy()
  })

  it('typing without touching the search field narrows the library — it focused itself on open', async () => {
    const { onPickGlyph } = setup()
    const mark = markOf('Health')

    await userEvent.click(mark)
    const input = await within(document.body).findByRole('combobox', { name: 'search glyphs' })
    expect(input).toHaveFocus()

    const before = (await within(document.body).findAllByRole('gridcell')).length
    await userEvent.keyboard('fl')
    expect(input).toHaveValue('fl')
    const after = within(document.body).getAllByRole('gridcell').length
    expect(after).toBeLessThan(before)

    await userEvent.keyboard('{Enter}')
    expect(onPickGlyph).toHaveBeenCalledWith('health', expect.any(String))
  })

  it('esc leaves the mark unchanged and returns focus to it', async () => {
    setup()
    const mark = markOf('Health')
    const before = iconOf('Health')

    await userEvent.click(mark)
    await within(document.body).findByRole('combobox', { name: 'search glyphs' })
    await userEvent.keyboard('{Escape}')

    expect(document.body.querySelector('[data-part="glass"]')).toBeNull()
    expect(mark).toHaveAttribute('aria-expanded', 'false')
    expect(mark).toHaveFocus()
    expect(iconOf('Health')).toBe(before)
  })
})
