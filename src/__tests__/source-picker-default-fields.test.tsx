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
    {
      block: 'board',
      fields: [
        ['status', STATUS_HINT],
        ['done', 'checkbox'],
        ['due', 'date'],
        ['repeats', 'text'],
        ['assignee', 'text'],
      ],
    },
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

  it('picking `new tasks` opens the `project` step, not the field step (KAN-536)', async () => {
    const { container, onPick } = renderPicker({ block: 'board', defaultStep: 'source' })
    expect(labelOf(rowsOf(container)[0])).toBe('tasks')
    await userEvent.click(rowsOf(container)[0])
    expect(onPick).not.toHaveBeenCalled()
    expect(container.querySelector('[data-part="glass"]')!.getAttribute('data-step')).toBe(
      'project'
    )
  })
})

describe('SourcePicker — the `project` step (KAN-536)', () => {
  const headTextOf = (root: HTMLElement) => root.querySelector('[data-part="head-text"]')!.textContent

  it('heads `/board — tasks`, `new project — <page>` preselected, narrows as typed, and a double ↵ picks once', async () => {
    const { container, onPick } = renderPicker({
      block: 'board',
      defaultStep: 'source',
      pageTitle: 'Home Reno',
    })
    await userEvent.click(rowsOf(container)[0])
    expect(headTextOf(container)).toBe('/board — tasks')
    expect(labelOf(rowsOf(container)[0])).toBe('new project — Home Reno')
    expect(rowsOf(container)[0].getAttribute('aria-selected')).toBe('true')

    await userEvent.keyboard('web')
    expect(headTextOf(container)).toBe('/board — tasks › web')
    expect(rowsOf(container)).toHaveLength(1)
    expect(labelOf(rowsOf(container)[0])).toBe('new project — web')

    await userEvent.keyboard('{Enter}{Enter}')
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith({ kind: 'tasks', project: { label: 'web' } })
  })

  it('narrows to an existing option and picks it by id, not a new one', async () => {
    const { container, onPick } = renderPicker({
      block: 'board',
      defaultStep: 'source',
      pageTitle: 'Home Reno',
      projects: {
        pageTitle: 'Home Reno',
        options: [
          { id: 'opt-web', label: 'Web design' },
          { id: 'opt-home', label: 'Home Reno' },
        ],
      },
    })
    await userEvent.click(rowsOf(container)[0])
    // An option already carries the page's title, so it leads, preselected,
    // with no `new project — Home Reno` row alongside it.
    expect(labelOf(rowsOf(container)[0])).toBe('Home Reno')
    expect(rowsOf(container)).toHaveLength(2)

    await userEvent.keyboard('web')
    expect(rowsOf(container)).toHaveLength(1)
    expect(labelOf(rowsOf(container)[0])).toBe('Web design')

    await userEvent.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith({ kind: 'tasks', project: { id: 'opt-web', label: 'Web design' } })
  })

  it('a whitespace-only query still picks the page title, never a blank option (KAN-536)', async () => {
    const { container, onPick } = renderPicker({
      block: 'board',
      defaultStep: 'source',
      pageTitle: 'Home Reno',
    })
    await userEvent.click(rowsOf(container)[0])
    await userEvent.keyboard(' ')
    // The row already reads the trimmed label (`projectEntries`) — the bug was
    // in `pick()` carrying the raw, untrimmed query instead.
    expect(labelOf(rowsOf(container)[0])).toBe('new project — Home Reno')

    await userEvent.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith({ kind: 'tasks', project: { label: 'Home Reno' } })
  })

  it('a query with trailing spaces picks the trimmed label, not a stale one (KAN-536)', async () => {
    const { container, onPick } = renderPicker({
      block: 'board',
      defaultStep: 'source',
      pageTitle: 'Home Reno',
    })
    await userEvent.click(rowsOf(container)[0])
    await userEvent.keyboard('web  ')
    expect(labelOf(rowsOf(container)[0])).toBe('new project — web')

    await userEvent.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith({ kind: 'tasks', project: { label: 'web' } })
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
