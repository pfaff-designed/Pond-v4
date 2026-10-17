/**
 * KAN-351: `SourcePicker`'s `new` step opens prefilled per view kind, and a
 * `status`/`select` field added through `field-type` carries the three lanes
 * by default — same as `defaultFieldsFor`'s own board field. `title` always
 * leads, unchanged (`source-entries.test.ts` covers `defaultFieldsFor` itself;
 * this covers the picker actually seeding from it).
 */
import React from 'react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SourcePicker } from '@/components/molecules/SourcePicker'
import type { SourceBlock } from '@/components/molecules/source-entries'
import { DEFAULT_STATUS_OPTIONS } from '@/lib/properties/schema'

function renderPicker(props: Partial<React.ComponentProps<typeof SourcePicker>> = {}) {
  const anchor = document.createElement('textarea')
  document.body.appendChild(anchor)
  const portal = document.createElement('div')
  document.body.appendChild(portal)
  const onPick = jest.fn()
  const onClose = jest.fn()
  render(
    <SourcePicker
      block="table"
      pageTitle="recipes"
      databases={[]}
      anchor={anchor}
      container={portal}
      onPick={onPick}
      onClose={onClose}
      {...props}
    />
  )
  return { container: portal, onPick, onClose }
}

const rowsOf = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[role="option"]')]
const labelOf = (row: HTMLElement) => row.querySelector('[data-part="label"]')!.textContent
const hintOf = (row: HTMLElement) => row.querySelector('[data-part="hint"]')?.textContent ?? null

const STATUS_HINT = DEFAULT_STATUS_OPTIONS.join(' · ')

describe('SourcePicker — the `new` step opens prefilled per view kind (KAN-351)', () => {
  const CASES: { block: SourceBlock; fields: [string, string][] }[] = [
    { block: 'table', fields: [] },
    { block: 'gallery', fields: [] },
    { block: 'chart', fields: [] },
    { block: 'big-number', fields: [] },
    { block: 'calendar', fields: [['date', 'date']] },
    { block: 'list', fields: [['date', 'date']] },
    {
      block: 'gantt',
      fields: [
        ['start', 'date'],
        ['due', 'date'],
      ],
    },
    { block: 'board', fields: [['status', STATUS_HINT]] },
  ]

  for (const { block, fields } of CASES) {
    it(`${block}: title first, unchanged, then ${
      fields.length ? fields.map(([n]) => n).join(' + ') : 'no'
    } prefilled field(s)`, () => {
      const { container } = renderPicker({ block, defaultStep: 'new' })
      const rows = rowsOf(container)
      expect(labelOf(rows[0])).toBe('title')
      expect(hintOf(rows[0])).toBe('text')
      // The faint `field` add row always trails; everything between it and
      // `title` is the view kind's own default.
      const middle = rows.slice(1, -1)
      expect(middle.map((r) => [labelOf(r), hintOf(r)])).toEqual(fields)
      expect(labelOf(rows[rows.length - 1])).toBe('field')
    })
  }

  it('reaching `new` by picking `new database —` seeds the same defaults as opening on it directly', async () => {
    const { container } = renderPicker({ block: 'board', defaultStep: 'source' })
    await userEvent.click(rowsOf(container)[0])
    const rows = rowsOf(container)
    expect(labelOf(rows[0])).toBe('title')
    expect([labelOf(rows[1]), hintOf(rows[1])]).toEqual(['status', STATUS_HINT])
    expect(labelOf(rows[2])).toBe('field')
  })
})

describe('SourcePicker — a status or select field added via `field-type` carries the default lanes (KAN-351)', () => {
  const addViaFieldType = async (container: HTMLElement, typeLabel: 'status' | 'select') => {
    // `table` starts fieldless, so `rows[1]` is the faint `field` add row.
    await userEvent.click(rowsOf(container)[1])
    const typeRow = rowsOf(container).find((r) => labelOf(r) === typeLabel)!
    await userEvent.click(typeRow)
  }

  it.each(['status', 'select'] as const)('%s picks up to do / doing / done', async (typeLabel) => {
    const { container, onPick } = renderPicker({ block: 'table', defaultStep: 'new' })
    await addViaFieldType(container, typeLabel)

    const rows = rowsOf(container)
    expect(labelOf(rows[1])).toBe('field')
    expect(hintOf(rows[1])).toBe(STATUS_HINT)

    await userEvent.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith({
      kind: 'new',
      title: 'recipes',
      fields: [
        {
          name: 'field',
          type: typeLabel,
          options: DEFAULT_STATUS_OPTIONS.map((label) => ({ label })),
        },
      ],
      recordsAre: 'pages',
      mode: 'table',
      chart: undefined,
    })
  })

  it('a text field added the same way gets no options', async () => {
    const { container, onPick } = renderPicker({ block: 'table', defaultStep: 'new' })
    await userEvent.click(rowsOf(container)[1])
    const textRow = rowsOf(container).find((r) => labelOf(r) === 'text')!
    await userEvent.click(textRow)

    await userEvent.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith({
      kind: 'new',
      title: 'recipes',
      fields: [{ name: 'field', type: 'text' }],
      recordsAre: 'pages',
      mode: 'table',
      chart: undefined,
    })
  })
})
