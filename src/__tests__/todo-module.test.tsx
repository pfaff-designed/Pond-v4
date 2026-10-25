/**
 * The check row and the board's `list` block (#219) — `todo`'s rows built to their
 * board: three markers, the item `meta` column, five states, composed from
 * `PondMolecule`'s `check-row` / `list-row` rather than restating their geometry.
 *
 * `PondTemplate.dc.html`'s `renderVals()` models `list` and `check` as ONE row
 * differing by `hasBox`:
 *
 *   hasBox: k === 'check',                      // the checkbox
 *   hasDot: k === 'list' && !d.links,           // the ink-.5 dot
 *   aStyle: { …, color: filled && !done ? fg : a(.68),
 *             textDecoration: done ? 'line-through' : 'none',
 *             textDecorationColor: a(.4), fontWeight: d.links ? 500 : 400 },
 *   bStyle: { fontFamily: mono, fontSize: 10.5, color: a(.68), whiteSpace: 'nowrap' }
 *
 * (`bStyle` is the level-4 layout's own tighter rendering of the `b` column; the
 * molecule draws it as the date atom `PondMolecule.dc.html` imports — sans 13.5 at
 * full ink — and that is what the view's meta tests assert.)
 *
 * So one persisted type, `todo`, with a block-level `marker` (`check` · `dot` ·
 * `none`, default `check`) and an optional `meta` per item — both optional so every
 * persisted checklist parses and renders exactly as before, with no migration.
 *
 * Schema, registry facets, the emit union, `blockFrame()`'s marker mapping and the
 * view's composition are asserted here; the computed board values live in
 * `todo/view.stories.tsx` (jsdom has no layout, so here the class recipe and the
 * molecule's `data-kind` / `data-state` are the contract).
 */

import React, { useState } from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

import {
  todoSchema,
  todoDescriptor,
  todoMarker,
  TODO_MARKERS,
  type TodoBlock,
} from '@/lib/modules/todo/schema'
import { TodoView, addTodoItem } from '@/lib/modules/todo/view'
import { blockSchema } from '@/lib/modules/content'
import { resolveDescriptor } from '@/lib/modules/registry'
import { moduleDataSchema, moduleCatalog } from '@/lib/modules/ai-composition'
import { blockFrame, blockIsEmpty, POND_BLOCK_EMPTY_ACTION_WIRED } from '@/lib/modules/block-frame'
import { BlockRowProvider } from '@/lib/modules/block-row-context'

/** A persisted checklist from before #219: no `marker`, no `meta` anywhere. */
const legacy: TodoBlock = {
  id: 'b1',
  type: 'todo',
  items: [
    { id: 't1', label: 'Buy wood', checked: false },
    { id: 't2', label: 'Sand it', checked: true },
  ],
}

/** The board's `meeting → actions`: `['Sam — final copy', '27 oct', 0]`, `['Ana — book the room', '', 1]`. */
const actions: TodoBlock = {
  id: 'b2',
  type: 'todo',
  label: 'actions',
  marker: 'check',
  items: [
    { id: 'a1', label: 'Sam — final copy', checked: false, meta: '27 oct' },
    { id: 'a2', label: 'Ana — book the room', checked: true },
  ],
}

/** The board's `list → items` (`groceries`, `note: '5'`). */
const groceries: TodoBlock = {
  id: 'b3',
  type: 'todo',
  label: 'items',
  marker: 'dot',
  items: ['oat milk', 'lemons', 'rice', 'coffee beans', 'bin bags'].map((label, i) => ({
    id: `g${i}`,
    label,
    checked: false,
  })),
}

/** The board's `dashboard → pages` (`links: 1`): `['running', '18.4 km this week']`… */
const pages: TodoBlock = {
  id: 'b4',
  type: 'todo',
  label: 'pages',
  marker: 'none',
  items: [
    { id: 'p1', label: 'running', checked: false, meta: '18.4 km this week' },
    { id: 'p2', label: 'move house', checked: false, meta: '2 of 4 tasks' },
    { id: 'p3', label: 'reading list', checked: false, meta: '3 in progress' },
  ],
}

// `getAttribute`, not `className`: an SVG's `className` is an SVGAnimatedString.
const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(' ')
const has = (el: Element, ...classes: string[]) => {
  const list = classesOf(el)
  for (const c of classes) expect(list).toContain(c)
}
const lacks = (el: Element, ...classes: string[]) => {
  const list = classesOf(el)
  for (const c of classes) expect(list).not.toContain(c)
}

const rowsOf = (root: ParentNode) =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-kind="check-row"],[data-kind="list-row"]'))
const titleOf = (row: HTMLElement) => row.querySelector<HTMLElement>('[data-part="title"]')!

// ── Schema ────────────────────────────────────────────────────────────────────────

describe('todo schema — two optional additions, no migration', () => {
  it('a persisted checklist without `marker` or `meta` still parses, byte-identical', () => {
    const parsed = blockSchema.parse(legacy)
    expect(parsed).toEqual(legacy)
    expect('marker' in parsed).toBe(false)
    expect(parsed.type === 'todo' && 'meta' in parsed.items[0]).toBe(false)
  })

  it('exactly three markers — the board’s own three cases — and the default is `check`', () => {
    expect(TODO_MARKERS).toEqual(['check', 'dot', 'none'])
    expect(todoMarker(legacy)).toBe('check')
    expect(todoMarker(groceries)).toBe('dot')
    expect(todoMarker(pages)).toBe('none')
    expect(() => todoSchema.parse({ ...legacy, marker: 'bullet' })).toThrow()
  })

  it('`meta` is an optional string per item (the board’s `b` column)', () => {
    expect(blockSchema.parse(actions)).toEqual(actions)
    expect(() =>
      todoSchema.parse({ ...legacy, items: [{ ...legacy.items[0], meta: 3 }] })
    ).toThrow()
  })

  it('an item’s own `placeholder` is optional, a string, and never written to `label`', () => {
    const withPlaceholder: TodoBlock = {
      ...legacy,
      items: [{ ...legacy.items[0], label: '', placeholder: 'first item' }, legacy.items[1]],
    }
    expect(blockSchema.parse(withPlaceholder)).toEqual(withPlaceholder)
    expect(() =>
      todoSchema.parse({ ...legacy, items: [{ ...legacy.items[0], placeholder: 3 }] })
    ).toThrow()
  })

  it('is not a new block type: `list` is the `todo` type under a marker', () => {
    expect(blockSchema.safeParse({ id: 'x', type: 'list', items: [] }).success).toBe(false)
  })
})

// ── Serialize: the model must be able to read both fields back ───────────────────

describe('todo serialize — what the model cannot read is destroyed on the next wholesale edit', () => {
  it('a plain checklist serializes exactly as before (no marker, no meta → no new text)', () => {
    expect(todoDescriptor.serialize(legacy)).toBe('- [ ] Buy wood\n- [x] Sand it')
  })

  it('an item’s meta rides its line, so a due date survives a re-emit', () => {
    expect(todoDescriptor.serialize(actions)).toBe(
      '- [ ] Sam — final copy · 27 oct\n- [x] Ana — book the room'
    )
  })

  it('a `dot` list is marked as a list, with plain bullets — not checkboxes', () => {
    expect(todoDescriptor.serialize(groceries)).toBe(
      'List:\n- oat milk\n- lemons\n- rice\n- coffee beans\n- bin bags'
    )
  })

  it('a `none` list says so, so a wholesale re-emit keeps the marker off', () => {
    expect(todoDescriptor.serialize(pages)).toBe(
      'List (no marker):\n- running · 18.4 km this week\n- move house · 2 of 4 tasks\n- reading list · 3 in progress'
    )
  })

  it('the block label still leads through resolveDescriptor (#258), ahead of the list marker', () => {
    expect(resolveDescriptor('todo').serialize(groceries).split('\n').slice(0, 2)).toEqual([
      'items:',
      'List:',
    ])
  })

  it('previews as the labels alone, as before', () => {
    expect(todoDescriptor.preview?.(pages)).toBe('running, move house, reading list')
  })
})

// ── The emit union (ai-composition.ts) carries both fields ───────────────────────

describe('todo in moduleDataSchema — Pond can emit a plain list (ADR 0006)', () => {
  it('accepts `marker` and item `meta`, id-less at both levels', () => {
    const parsed = moduleDataSchema.parse({
      type: 'todo',
      marker: 'dot',
      items: [{ label: 'oat milk', checked: false, meta: 'today' }],
    })
    expect(parsed.type === 'todo' && parsed.marker).toBe('dot')
    expect(parsed.type === 'todo' && parsed.items[0].meta).toBe('today')
    expect(parsed.type === 'todo' && 'id' in parsed.items[0]).toBe(false)
  })

  it('an item’s `placeholder` rides the emit union untouched, id-less, like `meta`', () => {
    const withoutId = {
      type: 'todo' as const,
      marker: 'dot' as const,
      items: [{ label: '', checked: false, placeholder: 'first item' }],
    }
    expect(moduleDataSchema.parse(withoutId)).toEqual(withoutId)
  })

  it('rejects a marker the board does not draw', () => {
    expect(moduleDataSchema.safeParse({ type: 'todo', marker: 'bullet', items: [] }).success).toBe(
      false
    )
  })

  it('teaches the model the three markers in the catalog line', () => {
    const line = moduleCatalog.split('\n').find((l) => l.startsWith('- todo:'))
    expect(line).toBeDefined()
    expect(line).toMatch(/marker/)
    expect(line).toMatch(/dot/)
    expect(line).toMatch(/none/)
  })
})

// ── blockFrame(): the card follows the marker ────────────────────────────────────

describe('blockFrame(todo) — `checklist` for `check`, `list` for `dot` / `none`', () => {
  it('a checklist (legacy or explicit) keeps the checklist card and `done of n`', () => {
    expect(blockFrame(legacy)).toEqual({
      kind: 'checklist',
      heading: 'checklist',
      headNote: '1 of 2',
    })
    expect(blockFrame(actions)).toEqual({
      kind: 'checklist',
      heading: 'actions',
      headNote: '1 of 2',
    })
  })

  it('a `dot` list is the board’s `list` kind with the item COUNT as its note (`list → items`, `note: 5`)', () => {
    expect(blockFrame(groceries)).toEqual({ kind: 'list', heading: 'items', headNote: '5' })
  })

  it('a `none` list is the `list` kind too; the heading falls back to `list` without a label', () => {
    expect(blockFrame(pages)).toEqual({ kind: 'list', heading: 'pages', headNote: '3' })
    expect(blockFrame({ ...pages, label: undefined })).toEqual({
      kind: 'list',
      heading: 'list',
      headNote: '3',
    })
  })

  it('`done of n` is never written on a list: ticks are meaningless without boxes', () => {
    const struck = { ...groceries, items: groceries.items.map((it) => ({ ...it, checked: true })) }
    expect(blockFrame(struck)!.headNote).toBe('5')
  })

  it('emptiness and the wired insert are unchanged for every marker', () => {
    for (const marker of TODO_MARKERS) {
      const empty: TodoBlock = { id: 'e', type: 'todo', marker, items: [] }
      expect(blockIsEmpty(empty)).toBe(true)
      expect(POND_BLOCK_EMPTY_ACTION_WIRED[blockFrame(empty)!.kind]).toBe(true)
      // The insert keeps the marker, so a `dot` list's `add an item` adds a list item.
      expect(todoMarker(addTodoItem(empty))).toBe(marker)
      expect(addTodoItem(empty).items[0]).toMatchObject({ label: '', checked: false })
    }
  })
})

// ── The view: composed from the molecule, nothing restated ───────────────────────

describe('TodoView — read-only', () => {
  it('a checklist is a stack of `check-row` molecules — no bare <input type="checkbox">, no text-sm, no gap-2', () => {
    const { container } = render(<TodoView data={legacy} editable={false} />)
    const rows = rowsOf(container)
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row.dataset.kind).toBe('check-row')
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    expect(container.querySelector('li')).toBeNull()
    // The row's own `gap-2.5` (the board's 10px) is the molecule's; the old row's
    // `gap-2` (8px) and `text-sm` (14px) are gone from every element.
    for (const el of Array.from(container.querySelectorAll('*'))) lacks(el, 'text-sm', 'gap-2')
    // The molecule's checkbox atom draws the box; the done row's is ticked.
    expect(rows[0].querySelector('[data-kind="checkbox"] [data-part="check"]')).toBeNull()
    expect(rows[1].querySelector('[data-kind="checkbox"] [data-part="check"]')).not.toBeNull()
  })

  it('a done label is struck at ink .68 with the strike at ink .4 — never the faint fourth tier', () => {
    const { container } = render(<TodoView data={legacy} editable={false} />)
    const [open, done] = rowsOf(container).map(titleOf)
    has(done, 'line-through', 'decoration-mn-text/40', 'text-mn-text-secondary')
    lacks(done, 'text-mn-text-faint')
    lacks(open, 'line-through', 'text-mn-text-secondary')
  })

  it('an item’s meta renders as the row’s date atom when non-empty, and not at all when empty', () => {
    const { container } = render(<TodoView data={actions} editable={false} />)
    const [withMeta, without] = rowsOf(container)
    const meta = withMeta.querySelector<HTMLElement>('[data-kind="date"]')!
    expect(meta).not.toBeNull()
    expect(meta.textContent).toBe('27 oct')
    // `PondAtom.dc.html` gives `date` the base text style: sans 13.5 / full ink /
    // nowrap — not the mono 10.5 `cellMeta` of the other row molecules.
    const text = meta.querySelector<HTMLElement>('[data-part="text"]')!
    has(text, 'text-[13.5px]', 'truncate')
    lacks(text, 'font-mono', 'text-[10.5px]', 'text-mn-text-secondary')
    // `27 oct` is not `today`, and no board draws a dated check row: no dot.
    expect(meta.querySelector('[data-part="due-dot"]')).toBeNull()
    expect(without.querySelector('[data-kind="date"]')).toBeNull()
    // A fixture meta must never leak in: the view passes '' for an absent meta.
    expect(container.textContent).not.toContain('today')
  })

  it('a read-only box is still a checkbox to assistive tech — role, aria-checked, aria-readonly, the label', () => {
    render(<TodoView data={legacy} editable={false} />)
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    expect(boxes[0]).toHaveAttribute('aria-checked', 'false')
    expect(boxes[1]).toHaveAttribute('aria-checked', 'true')
    expect(boxes[1]).toHaveAttribute('aria-readonly', 'true')
    expect(boxes[1]).toHaveAttribute('aria-label', 'Sand it')
    expect(boxes[1].tagName).toBe('SPAN')
  })

  it('the stack is the board’s row gap (2px), not the old space-y-1; the per-item wrapper is a real box, not `display: contents` (KAN-355 fix)', () => {
    const { container } = render(<TodoView data={legacy} editable={false} />)
    const wrapper = rowsOf(container)[0].parentElement!
    has(wrapper, 'self-start')
    lacks(wrapper, 'contents')
    const stack = wrapper.parentElement!
    has(stack, 'flex', 'flex-col', 'gap-[2px]')
    lacks(stack, 'space-y-1')
  })

  it('an empty label reads the board’s `add a step` at .68 — the molecule’s empty state', () => {
    const blank: TodoBlock = {
      id: 'e',
      type: 'todo',
      items: [{ id: '1', label: '', checked: false }],
    }
    const { container } = render(<TodoView data={blank} editable={false} />)
    const [row] = rowsOf(container)
    expect(row.dataset.state).toBe('empty')
    expect(titleOf(row).textContent).toBe('add a step')
    has(titleOf(row), 'text-mn-text-secondary')
  })

  it('an item’s own placeholder outranks the board’s generic `add an item` copy, at ink .68', () => {
    const withPlaceholder: TodoBlock = {
      id: 'e',
      type: 'todo',
      marker: 'dot',
      items: [{ id: '1', label: '', checked: false, placeholder: 'first item' }],
    }
    const { container } = render(<TodoView data={withPlaceholder} editable={false} />)
    const [row] = rowsOf(container)
    expect(row.dataset.state).toBe('empty')
    expect(titleOf(row).textContent).toBe('first item')
    has(titleOf(row), 'text-mn-text-secondary')
  })

  it('`dot`: `list-row` with the ink-.5 dot, weight 400, and `add an item` when blank', () => {
    const blank = {
      ...groceries,
      items: [...groceries.items, { id: 'z', label: '', checked: false }],
    }
    const { container } = render(<TodoView data={blank} editable={false} />)
    const rows = rowsOf(container)
    expect(rows).toHaveLength(6)
    for (const row of rows) {
      expect(row.dataset.kind).toBe('list-row')
      expect(row.querySelector('[data-kind="checkbox"]')).toBeNull()
      const dot = row.querySelector<HTMLElement>('[data-part="dot"]')!
      expect(dot).not.toBeNull()
      has(dot, 'bg-mn-text/50')
      lacks(titleOf(row), 'font-medium')
    }
    expect(titleOf(rows[5]).textContent).toBe('add an item')
  })

  it('`none`: `list-row` with NO dot and the label at weight 500 (`links: 1`)', () => {
    const { container } = render(<TodoView data={pages} editable={false} />)
    const rows = rowsOf(container)
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.dataset.kind).toBe('list-row')
      expect(row.querySelector('[data-part="dot"]')).toBeNull()
      expect(row.querySelector('[data-kind="checkbox"]')).toBeNull()
      has(titleOf(row), 'font-medium')
    }
    expect(rows[0].querySelector('[data-kind="date"]')!.textContent).toBe('18.4 km this week')
  })

  it('a list does not strike or dim a `checked` item: there is no box to have ticked', () => {
    const struck = { ...pages, items: pages.items.map((it) => ({ ...it, checked: true })) }
    const { container } = render(<TodoView data={struck} editable={false} />)
    for (const row of rowsOf(container))
      lacks(titleOf(row), 'line-through', 'text-mn-text-secondary')
  })

  it('hovering a row puts THAT row, and only that row, in the molecule’s hover state', () => {
    const { container } = render(<TodoView data={legacy} editable={false} />)
    const [a, b] = rowsOf(container)
    expect(a.dataset.state).toBe('rest')
    fireEvent.mouseEnter(b)
    expect(b.dataset.state).toBe('hover')
    expect(a.dataset.state).toBe('rest')
    fireEvent.mouseLeave(b)
    expect(b.dataset.state).toBe('rest')
  })

  it('a blank read-only row under the pointer keeps its `add a step` — empty outranks hover', () => {
    // `empty` and `hover` are independent on the board, not a precedence. The
    // molecule reaches its empty copy only under `state === 'empty'` (`''` is not
    // nullish, so the fixture fallback does not fire), so hover-first would blank
    // the row under the pointer. This had no coverage, which is why it shipped.
    const blank: TodoBlock = {
      id: 'e',
      type: 'todo',
      items: [{ id: '1', label: '', checked: false }],
    }
    const { container } = render(<TodoView data={blank} editable={false} />)
    const [row] = rowsOf(container)
    fireEvent.mouseEnter(row)
    expect(row.dataset.state).toBe('empty')
    expect(titleOf(row).textContent).toBe('add a step')
    fireEvent.mouseLeave(row)
    expect(row.dataset.state).toBe('empty')
  })
})

/**
 * Stateful host so editable tests exercise a real onChange round-trip. Bare
 * `TodoView` has no `BlockCanvas` above it to provide a working `commitStep`
 * (KAN-355) — the context's own default is a no-op — so this harness supplies
 * one that behaves exactly like `onChange` (no flush: there is no page here).
 */
function Stateful({ data, onChange }: { data: TodoBlock; onChange?: (next: TodoBlock) => void }) {
  const [state, setState] = useState(data)
  function apply(next: TodoBlock) {
    setState(next)
    onChange?.(next)
  }
  return (
    <BlockRowProvider value={{ selected: false, stepOut: () => {}, commitStep: (patch) => apply(patch as TodoBlock) }}>
      <TodoView data={state} editable onChange={apply} />
    </BlockRowProvider>
  )
}

describe('TodoView — editable (the molecule’s rows, made live by the host)', () => {
  it('the box is a real checkbox control; toggling emits the whole next block with that item flipped', () => {
    const onChange = jest.fn()
    render(<Stateful data={legacy} onChange={onChange} />)
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    expect(boxes[0]).toHaveAttribute('aria-checked', 'false')
    expect(boxes[1]).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(boxes[0])
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as TodoBlock
    expect(next.items.map((it) => it.checked)).toEqual([true, true])
    expect(next.items[0].id).toBe('t1')
    expect(screen.getAllByRole('checkbox')[0]).toHaveAttribute('aria-checked', 'true')
  })

  it('the label is a text field in the row, in the molecule’s own title slot — typing lands in the block', () => {
    const onChange = jest.fn()
    const { container } = render(<Stateful data={legacy} onChange={onChange} />)
    const [row] = rowsOf(container)
    const field = row.querySelector<HTMLInputElement>('input[type="text"]')!
    expect(field).not.toBeNull()
    expect(field.value).toBe('Buy wood')
    fireEvent.change(field, { target: { value: 'Buy oak' } })
    const next = onChange.mock.calls.at(-1)![0] as TodoBlock
    expect(next.items[0]).toEqual({ id: 't1', label: 'Buy oak', checked: false })
    // `meta` is preserved untouched on a row that has one.
    const { container: c2 } = render(<Stateful data={actions} onChange={onChange} />)
    const f2 = rowsOf(c2)[0].querySelector<HTMLInputElement>('input[type="text"]')!
    fireEvent.change(f2, { target: { value: 'Sam — copy' } })
    const n2 = onChange.mock.calls.at(-1)![0] as TodoBlock
    expect(n2.items[0]).toEqual({ id: 'a1', label: 'Sam — copy', checked: false, meta: '27 oct' })
  })

  it('a blank label shows the board’s empty copy as the field’s placeholder, per marker', () => {
    const blankCheck: TodoBlock = {
      id: 'e',
      type: 'todo',
      items: [{ id: '1', label: '', checked: false }],
    }
    const blankList: TodoBlock = { ...blankCheck, marker: 'dot' }
    const { container: a } = render(<Stateful data={blankCheck} />)
    expect(a.querySelector<HTMLInputElement>('input[type="text"]')!.placeholder).toBe('add a step')
    const { container: b } = render(<Stateful data={blankList} />)
    expect(b.querySelector<HTMLInputElement>('input[type="text"]')!.placeholder).toBe('add an item')
  })

  it('a blank check-row field’s placeholder is hidden at rest, shown on row hover or field focus (KAN-499)', () => {
    const blankCheck: TodoBlock = {
      id: 'e',
      type: 'todo',
      items: [{ id: '1', label: '', checked: false }],
    }
    const { container } = render(<Stateful data={blankCheck} />)
    const [row] = rowsOf(container)
    const field = row.querySelector<HTMLInputElement>('input[type="text"]')!
    has(field, 'placeholder:opacity-0', 'focus:placeholder:opacity-100')
    lacks(field, 'placeholder:opacity-100')

    fireEvent.mouseEnter(row)
    has(field, 'placeholder:opacity-100')
    fireEvent.mouseLeave(row)
    lacks(field, 'placeholder:opacity-100')

    // A `list-row`'s field is unaffected — this hides the check-row's blank
    // field only.
    const { container: listContainer } = render(<Stateful data={groceries} />)
    const listField = rowsOf(listContainer)[0].querySelector<HTMLInputElement>(
      'input[type="text"]'
    )!
    lacks(listField, 'placeholder:opacity-0')
  })

  it('an item’s own placeholder is the field’s placeholder attribute, not the generic copy', () => {
    const withPlaceholder: TodoBlock = {
      id: 'e',
      type: 'todo',
      items: [{ id: '1', label: '', checked: false, placeholder: 'first item' }],
    }
    const { container } = render(<Stateful data={withPlaceholder} />)
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')!.placeholder).toBe(
      'first item'
    )
  })

  it('a list (`dot` / `none`) has no checkbox control, but its labels are still editable', () => {
    const onChange = jest.fn()
    const { container } = render(<Stateful data={pages} onChange={onChange} />)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    const fields = container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    expect(fields).toHaveLength(3)
    fireEvent.change(fields[1], { target: { value: 'move flat' } })
    expect((onChange.mock.calls.at(-1)![0] as TodoBlock).items[1].label).toBe('move flat')
  })

  it('a focused field puts its row in the molecule’s `editing` state (the board’s inset ring)', () => {
    const { container } = render(<Stateful data={legacy} />)
    const [row] = rowsOf(container)
    const field = row.querySelector<HTMLInputElement>('input[type="text"]')!
    act(() => field.focus())
    expect(row.dataset.state).toBe('editing')
    has(row, 'ring-mn-text')
    act(() => field.blur())
    expect(row.dataset.state).toBe('rest')
  })

  it('a done row’s field is struck at .68, as its read-only twin', () => {
    const { container } = render(<Stateful data={legacy} />)
    const field = rowsOf(container)[1].querySelector<HTMLInputElement>('input[type="text"]')!
    has(field, 'line-through', 'decoration-mn-text/40', 'text-mn-text-secondary')
  })

  it('Enter on a MIDDLE item inserts a new empty item directly after it, focused (KAN-355)', async () => {
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'eggs', checked: false },
        { id: 'x2', label: 'milk', checked: false },
        { id: 'x3', label: 'bread', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} />)
    const middle = rowsOf(container)[1].querySelector<HTMLInputElement>('input[type="text"]')!
    fireEvent.keyDown(middle, { key: 'Enter' })

    const fields = container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    expect(fields).toHaveLength(4)
    expect(Array.from(fields).map((f) => f.value)).toEqual(['eggs', 'milk', '', 'bread'])
    await waitFor(() => expect(fields[2]).toHaveFocus())
  })

  it('Enter on a non-empty LAST item still appends and focuses (regression)', async () => {
    const { container } = render(<Stateful data={legacy} />)
    const last = rowsOf(container)[1].querySelector<HTMLInputElement>('input[type="text"]')!
    fireEvent.keyDown(last, { key: 'Enter' })

    const fields = container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    expect(fields).toHaveLength(3)
    expect(fields[2].value).toBe('')
    await waitFor(() => expect(fields[2]).toHaveFocus())
  })

  it('Enter mid-label splits the item at the caret, not just below it (KAN-355)', async () => {
    const one: TodoBlock = {
      id: 'e1',
      type: 'todo',
      items: [{ id: 'x1', label: 'eggsmilk', checked: false }],
    }
    const { container } = render(<Stateful data={one} />)
    const field = rowsOf(container)[0].querySelector<HTMLInputElement>('input[type="text"]')!
    field.setSelectionRange(4, 4)
    fireEvent.keyDown(field, { key: 'Enter' })

    const fields = container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    expect(fields).toHaveLength(2)
    expect(Array.from(fields).map((f) => f.value)).toEqual(['eggs', 'milk'])
    await waitFor(() => expect(fields[1]).toHaveFocus())
    expect(fields[1].selectionStart).toBe(0)
  })

  it('Backspace on an empty MIDDLE item removes it, caret at the end of the previous item (KAN-355)', async () => {
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'eggs', checked: false },
        { id: 'x2', label: '', checked: false },
        { id: 'x3', label: 'milk', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} />)
    const middle = rowsOf(container)[1].querySelector<HTMLInputElement>('input[type="text"]')!
    fireEvent.keyDown(middle, { key: 'Backspace' })

    const fields = container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    expect(fields).toHaveLength(2)
    expect(Array.from(fields).map((f) => f.value)).toEqual(['eggs', 'milk'])
    await waitFor(() => expect(fields[0]).toHaveFocus())
    expect(fields[0].selectionStart).toBe(4)
    expect(fields[0].selectionEnd).toBe(4)
  })

  it('Backspace on an empty FIRST item removes it, focus lands on the new first item at offset 0 (KAN-355)', async () => {
    const two: TodoBlock = {
      id: 'e2',
      type: 'todo',
      items: [
        { id: 'x1', label: '', checked: false },
        { id: 'x2', label: 'milk', checked: false },
      ],
    }
    const { container } = render(<Stateful data={two} />)
    const first = rowsOf(container)[0].querySelector<HTMLInputElement>('input[type="text"]')!
    fireEvent.keyDown(first, { key: 'Backspace' })

    const fields = container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    expect(fields).toHaveLength(1)
    expect(fields[0].value).toBe('milk')
    await waitFor(() => expect(fields[0]).toHaveFocus())
    expect(fields[0].selectionStart).toBe(0)
    expect(fields[0].selectionEnd).toBe(0)
  })

  it('Backspace on the only (empty) item empties the block, in one `onChange`', () => {
    const onChange = jest.fn()
    const one: TodoBlock = {
      id: 'e1',
      type: 'todo',
      items: [{ id: 'x1', label: '', checked: false }],
    }
    const { container } = render(<Stateful data={one} onChange={onChange} />)
    const field = rowsOf(container)[0].querySelector<HTMLInputElement>('input[type="text"]')!
    fireEvent.keyDown(field, { key: 'Backspace' })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect((onChange.mock.calls[0][0] as TodoBlock).items).toEqual([])
  })

  it('Backspace on a NON-empty item is a no-op — no `onChange`', () => {
    const onChange = jest.fn()
    const { container } = render(<Stateful data={legacy} onChange={onChange} />)
    const field = rowsOf(container)[0].querySelector<HTMLInputElement>('input[type="text"]')!
    fireEvent.keyDown(field, { key: 'Backspace' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Backspace at offset 0 of a NON-empty item joins it onto the previous item, caret at the join (KAN-355)', async () => {
    const two: TodoBlock = {
      id: 'e2',
      type: 'todo',
      items: [
        { id: 'x1', label: 'eggs', checked: false },
        { id: 'x2', label: 'milk', checked: false },
      ],
    }
    const { container } = render(<Stateful data={two} />)
    const second = rowsOf(container)[1].querySelector<HTMLInputElement>('input[type="text"]')!
    second.setSelectionRange(0, 0)
    fireEvent.keyDown(second, { key: 'Backspace' })

    const fields = container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    expect(fields).toHaveLength(1)
    expect(fields[0].value).toBe('eggsmilk')
    await waitFor(() => expect(fields[0]).toHaveFocus())
    expect(fields[0].selectionStart).toBe(4)
    expect(fields[0].selectionEnd).toBe(4)
  })

  it('Backspace at offset 0 of the FIRST item is a no-op — no `onChange`', () => {
    const onChange = jest.fn()
    const two: TodoBlock = {
      id: 'e2',
      type: 'todo',
      items: [
        { id: 'x1', label: 'eggs', checked: false },
        { id: 'x2', label: 'milk', checked: false },
      ],
    }
    const { container } = render(<Stateful data={two} onChange={onChange} />)
    const first = rowsOf(container)[0].querySelector<HTMLInputElement>('input[type="text"]')!
    first.setSelectionRange(0, 0)
    fireEvent.keyDown(first, { key: 'Backspace' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a quiet mouse add-item row reads the frame’s own empty-state copy, per marker (KAN-355)', () => {
    render(<Stateful data={legacy} />)
    expect(screen.getByRole('button', { name: '＋ add a step' })).toBeInTheDocument()
    render(<Stateful data={groceries} />)
    expect(screen.getByRole('button', { name: '＋ add an item' })).toBeInTheDocument()
  })

  it('the quiet add-item row is hidden at rest, shown on hover or focus-within (KAN-499)', () => {
    render(<Stateful data={legacy} />)
    has(
      screen.getByRole('button', { name: '＋ add a step' }),
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100',
      'focus-visible:opacity-100'
    )
  })

  it('clicking the quiet add-item row appends one item and focuses it (KAN-355)', async () => {
    const { container } = render(<Stateful data={legacy} />)
    fireEvent.click(screen.getByRole('button', { name: '＋ add a step' }))

    const fields = container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    expect(fields).toHaveLength(3)
    expect(fields[2].value).toBe('')
    await waitFor(() => expect(fields[2]).toHaveFocus())
  })

  it('with zero items the quiet add-item row does not render (KAN-355)', () => {
    const empty: TodoBlock = { id: 'e0', type: 'todo', items: [] }
    render(<Stateful data={empty} />)
    expect(screen.queryByRole('button', { name: /add/ })).not.toBeInTheDocument()
  })

  it('⌥↓ / ⌥↑ swaps an item with its neighbour, caret and focus stay put (KAN-355)', () => {
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'a', checked: false },
        { id: 'x2', label: 'b', checked: false },
        { id: 'x3', label: 'c', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} />)
    const fields = () => container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    act(() => fields()[0].focus())
    fireEvent.keyDown(fields()[0], { key: 'ArrowDown', altKey: true })
    expect(Array.from(fields()).map((f) => f.value)).toEqual(['b', 'a', 'c'])
    expect(document.activeElement).toBe(fields()[1])
    expect((document.activeElement as HTMLInputElement).value).toBe('a')
  })

  it('⌥↑ on the first item and ⌥↓ on the last item are no-ops (KAN-355)', () => {
    const onChange = jest.fn()
    const { container } = render(<Stateful data={legacy} onChange={onChange} />)
    const fields = container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    fireEvent.keyDown(fields[0], { key: 'ArrowUp', altKey: true })
    fireEvent.keyDown(fields[1], { key: 'ArrowDown', altKey: true })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('⌥↑ / ⌥↓ stop propagation, so the block-level reorder on the same chord never fires (KAN-355)', () => {
    const spy = jest.fn()
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'a', checked: false },
        { id: 'x2', label: 'b', checked: false },
      ],
    }
    const { container } = render(
      <div onKeyDown={spy}>
        <Stateful data={three} />
      </div>
    )
    const field = container.querySelector<HTMLInputElement>('input[type="text"]')!
    fireEvent.keyDown(field, { key: 'ArrowDown', altKey: true })
    expect(spy).not.toHaveBeenCalled()
  })

  /**
   * jsdom's `DragEvent` drops `clientY` from its init dict (unlike a real
   * browser's), so the point is defined directly on a plain `MouseEvent`
   * instead — the same workaround `block-canvas-drop-line.test.tsx`'s own
   * `dragOver` helper uses, extended here with the item drag's `dataTransfer`
   * (also attached via `defineProperty`, since the base `Event` fallback
   * `fireEvent.dragOver`/`.drop` builds in this jsdom has no such property).
   */
  function fireItemDrag(
    el: HTMLElement,
    type: 'dragover' | 'drop',
    dataTransfer: unknown,
    clientY: number
  ) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clientY', { value: clientY })
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
    fireEvent(el, event)
  }

  /** The item drag's own `dataTransfer` stub (KAN-355 fix) — one shared
   * object across a test's `pointerdown`/`dragstart`/`dragover`/`drop`,
   * since a real drag's `dataTransfer` is the same instance throughout. */
  function makeItemDataTransfer() {
    return {
      store: {} as Record<string, string>,
      setData(k: string, v: string) {
        this.store[k] = v
      },
      getData(k: string) {
        return this.store[k]
      },
      get types() {
        return Object.keys(this.store)
      },
    }
  }

  it('drag a BELOW c lands it below, matching the drawn bar (KAN-355 fix)', () => {
    const onChange = jest.fn()
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'a', checked: false },
        { id: 'x2', label: 'b', checked: false },
        { id: 'x3', label: 'c', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} onChange={onChange} />)
    const wrappers = container.querySelectorAll<HTMLElement>('[data-item-id]')
    const handle = wrappers[0].querySelector<HTMLElement>('[data-part="handle"]')!
    jest
      .spyOn(wrappers[2], 'getBoundingClientRect')
      .mockReturnValue({ top: 100, bottom: 136, height: 36 } as DOMRect)

    const dataTransfer = makeItemDataTransfer()
    fireEvent.pointerDown(handle)
    fireEvent.dragStart(wrappers[0], { dataTransfer })
    // 130 is past c's midpoint (118) — the lower half, the 'below' bar.
    fireItemDrag(wrappers[2], 'dragover', dataTransfer, 130)
    const bar = wrappers[2].querySelector<HTMLElement>('[data-part="drop-bar"]')!
    expect(bar).not.toBeNull()
    expect(bar.style.bottom).toBe('-9px')

    fireItemDrag(wrappers[2], 'drop', dataTransfer, 130)

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as TodoBlock
    expect(next.items.map((it) => it.label)).toEqual(['b', 'c', 'a'])
  })

  it('drag a ABOVE c lands it above, matching the drawn bar (KAN-355 fix)', () => {
    const onChange = jest.fn()
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'a', checked: false },
        { id: 'x2', label: 'b', checked: false },
        { id: 'x3', label: 'c', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} onChange={onChange} />)
    const wrappers = container.querySelectorAll<HTMLElement>('[data-item-id]')
    const handle = wrappers[0].querySelector<HTMLElement>('[data-part="handle"]')!
    jest
      .spyOn(wrappers[2], 'getBoundingClientRect')
      .mockReturnValue({ top: 100, bottom: 136, height: 36 } as DOMRect)

    const dataTransfer = makeItemDataTransfer()
    fireEvent.pointerDown(handle)
    fireEvent.dragStart(wrappers[0], { dataTransfer })
    // 105 is before c's midpoint (118) — the upper half, the 'above' bar.
    fireItemDrag(wrappers[2], 'dragover', dataTransfer, 105)
    const bar = wrappers[2].querySelector<HTMLElement>('[data-part="drop-bar"]')!
    expect(bar).not.toBeNull()
    expect(bar.style.top).toBe('-9px')

    fireItemDrag(wrappers[2], 'drop', dataTransfer, 105)

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as TodoBlock
    expect(next.items.map((it) => it.label)).toEqual(['b', 'a', 'c'])
  })

  it('the upper half of the NEXT row is a no-op — the drop recomputes its own zone, never the stale dragOver state (KAN-355 fix)', () => {
    const onChange = jest.fn()
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'a', checked: false },
        { id: 'x2', label: 'b', checked: false },
        { id: 'x3', label: 'c', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} onChange={onChange} />)
    const wrappers = container.querySelectorAll<HTMLElement>('[data-item-id]')
    const handle = wrappers[0].querySelector<HTMLElement>('[data-part="handle"]')!
    jest
      .spyOn(wrappers[1], 'getBoundingClientRect')
      .mockReturnValue({ top: 100, bottom: 136, height: 36 } as DOMRect)

    const dataTransfer = makeItemDataTransfer()
    fireEvent.pointerDown(handle)
    fireEvent.dragStart(wrappers[0], { dataTransfer })
    // 105 is before b's midpoint (118) — the upper half, which resolves
    // back to a's own position: a no-op, so no bar is drawn.
    fireItemDrag(wrappers[1], 'dragover', dataTransfer, 105)
    expect(wrappers[1].querySelector('[data-part="drop-bar"]')).toBeNull()

    // Before the fix, `onDrop` read the (null) `dropTarget` state and fell
    // back to `'below'`, committing a move anyway. The fix recomputes the
    // zone from this drop's own `clientY`, which is still the upper half.
    fireItemDrag(wrappers[1], 'drop', dataTransfer, 105)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('an upward drag onto the first row’s above-zone lands at the very start (KAN-355 fix)', () => {
    const onChange = jest.fn()
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'a', checked: false },
        { id: 'x2', label: 'b', checked: false },
        { id: 'x3', label: 'c', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} onChange={onChange} />)
    const wrappers = container.querySelectorAll<HTMLElement>('[data-item-id]')
    const handle = wrappers[2].querySelector<HTMLElement>('[data-part="handle"]')!
    jest
      .spyOn(wrappers[0], 'getBoundingClientRect')
      .mockReturnValue({ top: 0, bottom: 36, height: 36 } as DOMRect)

    const dataTransfer = makeItemDataTransfer()
    fireEvent.pointerDown(handle)
    fireEvent.dragStart(wrappers[2], { dataTransfer })
    // 5 is before a's midpoint (18) — the upper half, the 'above' bar.
    fireItemDrag(wrappers[0], 'dragover', dataTransfer, 5)
    const bar = wrappers[0].querySelector<HTMLElement>('[data-part="drop-bar"]')!
    expect(bar).not.toBeNull()
    expect(bar.style.top).toBe('-9px')

    fireItemDrag(wrappers[0], 'drop', dataTransfer, 5)

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as TodoBlock
    expect(next.items.map((it) => it.label)).toEqual(['c', 'a', 'b'])
  })

  it('a downward drag from the MIDDLE item onto the last row’s below-zone lands at the very end (KAN-355 fix)', () => {
    const onChange = jest.fn()
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'a', checked: false },
        { id: 'x2', label: 'b', checked: false },
        { id: 'x3', label: 'c', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} onChange={onChange} />)
    const wrappers = container.querySelectorAll<HTMLElement>('[data-item-id]')
    const handle = wrappers[1].querySelector<HTMLElement>('[data-part="handle"]')!
    jest
      .spyOn(wrappers[2], 'getBoundingClientRect')
      .mockReturnValue({ top: 100, bottom: 136, height: 36 } as DOMRect)

    const dataTransfer = makeItemDataTransfer()
    fireEvent.pointerDown(handle)
    fireEvent.dragStart(wrappers[1], { dataTransfer })
    // 130 is past c's midpoint (118) — the lower half, the 'below' bar.
    fireItemDrag(wrappers[2], 'dragover', dataTransfer, 130)
    const bar = wrappers[2].querySelector<HTMLElement>('[data-part="drop-bar"]')!
    expect(bar).not.toBeNull()
    expect(bar.style.bottom).toBe('-9px')

    fireItemDrag(wrappers[2], 'drop', dataTransfer, 130)

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as TodoBlock
    expect(next.items.map((it) => it.label)).toEqual(['a', 'c', 'b'])
  })

  it('a drag from a DIFFERENT block draws no bar, even though the MIME type matches (KAN-355 fix)', () => {
    const blockA: TodoBlock = {
      id: 'blockA',
      type: 'todo',
      items: [
        { id: 'a1', label: 'a', checked: false },
        { id: 'a2', label: 'b', checked: false },
      ],
    }
    const blockB: TodoBlock = {
      id: 'blockB',
      type: 'todo',
      items: [
        { id: 'b1', label: 'x', checked: false },
        { id: 'b2', label: 'y', checked: false },
      ],
    }
    const { container } = render(
      <div>
        <Stateful data={blockA} />
        <Stateful data={blockB} />
      </div>
    )
    const wrappers = container.querySelectorAll<HTMLElement>('[data-item-id]')
    const handle = wrappers[0].querySelector<HTMLElement>('[data-part="handle"]')!
    const dataTransfer = makeItemDataTransfer()

    fireEvent.pointerDown(handle)
    fireEvent.dragStart(wrappers[0], { dataTransfer })
    // `wrappers[2]` is blockB's first row — a different block's list.
    fireEvent.dragOver(wrappers[2], { dataTransfer })
    expect(wrappers[2].querySelector('[data-part="drop-bar"]')).toBeNull()

    fireEvent.dragEnd(wrappers[0], { dataTransfer })
  })

  it('pointerleave/pointercancel on the armed row do NOT disarm it — only pointerup/dragend do (KAN-355 fix)', () => {
    // Chrome fires `pointercancel` on the drag's source right after
    // `dragstart`, and `pointerleave` just before it — disarming on either
    // left `armedIndex` null for the whole real drag, so the no-op guard
    // (which used to read it) never fired.
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'a', checked: false },
        { id: 'x2', label: 'b', checked: false },
        { id: 'x3', label: 'c', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} />)
    const wrappers = container.querySelectorAll<HTMLElement>('[data-item-id]')
    const handle = wrappers[0].querySelector<HTMLElement>('[data-part="handle"]')!

    fireEvent.pointerDown(handle)
    expect(wrappers[0]).toHaveAttribute('draggable', 'true')
    fireEvent.pointerLeave(wrappers[0])
    fireEvent.pointerCancel(wrappers[0])
    expect(wrappers[0]).toHaveAttribute('draggable', 'true')

    fireEvent.pointerUp(window)
    expect(wrappers[0]).toHaveAttribute('draggable', 'false')
  })

  it('dragstart then pointercancel/pointerleave on the source still resolves drops from the real origin, not a cleared armedIndex (KAN-355 fix)', () => {
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'a', checked: false },
        { id: 'x2', label: 'b', checked: false },
        { id: 'x3', label: 'c', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} />)
    const wrappers = container.querySelectorAll<HTMLElement>('[data-item-id]')
    const handle = wrappers[0].querySelector<HTMLElement>('[data-part="handle"]')!
    jest
      .spyOn(wrappers[1], 'getBoundingClientRect')
      .mockReturnValue({ top: 100, bottom: 136, height: 36 } as DOMRect)

    const dataTransfer = makeItemDataTransfer()
    fireEvent.pointerDown(handle)
    fireEvent.dragStart(wrappers[0], { dataTransfer })
    fireEvent.pointerCancel(wrappers[0])
    fireEvent.pointerLeave(wrappers[0])

    // a's own row, either half: always a no-op.
    fireItemDrag(wrappers[0], 'dragover', dataTransfer, 0)
    expect(wrappers[0].querySelector('[data-part="drop-bar"]')).toBeNull()

    // 105 is before b's midpoint (118) — the upper half, which resolves
    // back to a's own position: a no-op, so no bar is drawn.
    fireItemDrag(wrappers[1], 'dragover', dataTransfer, 105)
    expect(wrappers[1].querySelector('[data-part="drop-bar"]')).toBeNull()

    // 130 is past b's midpoint — the lower half, a real reorder target.
    fireItemDrag(wrappers[1], 'dragover', dataTransfer, 130)
    const bar = wrappers[1].querySelector<HTMLElement>('[data-part="drop-bar"]')!
    expect(bar).not.toBeNull()
    expect(bar.style.bottom).toBe('-9px')
  })

  it('dropping an item on its own row is a no-op — no bar, no `onChange`, no undo step (KAN-355 fix)', () => {
    const onChange = jest.fn()
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'a', checked: false },
        { id: 'x2', label: 'b', checked: false },
        { id: 'x3', label: 'c', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} onChange={onChange} />)
    const wrappers = container.querySelectorAll<HTMLElement>('[data-item-id]')
    const handle = wrappers[0].querySelector<HTMLElement>('[data-part="handle"]')!

    const dataTransfer = makeItemDataTransfer()
    fireEvent.pointerDown(handle)
    fireEvent.dragStart(wrappers[0], { dataTransfer })
    fireEvent.dragOver(wrappers[0], { dataTransfer, clientY: 10 })
    expect(wrappers[0].querySelector('[data-part="drop-bar"]')).toBeNull()

    fireEvent.drop(wrappers[0], { dataTransfer, clientY: 10 })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('dragOver draws the drop-bar at the hovered row; drop clears it (KAN-355)', () => {
    const onChange = jest.fn()
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'a', checked: false },
        { id: 'x2', label: 'b', checked: false },
        { id: 'x3', label: 'c', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} onChange={onChange} />)
    const wrappers = container.querySelectorAll<HTMLElement>('[data-item-id]')
    const handle = wrappers[0].querySelector<HTMLElement>('[data-part="handle"]')!

    const dataTransfer = makeItemDataTransfer()
    fireEvent.pointerDown(handle)
    fireEvent.dragStart(wrappers[0], { dataTransfer })

    fireEvent.dragOver(wrappers[1], { dataTransfer })
    expect(wrappers[1].querySelector('[data-part="drop-bar"]')).not.toBeNull()
    expect(wrappers[0].querySelector('[data-part="drop-bar"]')).toBeNull()

    fireEvent.drop(wrappers[1], { dataTransfer })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-part="drop-bar"]')).toBeNull()
  })

  it('a drop without the private item MIME is ignored — a block drag or a foreign drop leaves items unchanged (KAN-355 fix)', () => {
    const onChange = jest.fn()
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'a', checked: false },
        { id: 'x2', label: 'b', checked: false },
        { id: 'x3', label: 'c', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} onChange={onChange} />)
    const wrappers = container.querySelectorAll<HTMLElement>('[data-item-id]')

    // A whole-block drag (or a dropped text node) carries `text/plain` and
    // nothing under the item MIME — `Number(getData('text/plain'))` used to
    // read this as "move item 0" regardless.
    const foreignDataTransfer = {
      store: { 'text/plain': '0' } as Record<string, string>,
      getData(k: string) {
        return this.store[k] ?? ''
      },
      setData(k: string, v: string) {
        this.store[k] = v
      },
    }
    fireEvent.drop(wrappers[2], { dataTransfer: foreignDataTransfer })
    expect(onChange).not.toHaveBeenCalled()

    // The item MIME present, but naming a DIFFERENT block.
    const otherBlockDataTransfer = {
      store: {
        'application/x-pond-item': JSON.stringify({ blockId: 'other', index: 0 }),
      } as Record<string, string>,
      getData(k: string) {
        return this.store[k] ?? ''
      },
      setData(k: string, v: string) {
        this.store[k] = v
      },
    }
    fireEvent.drop(wrappers[2], { dataTransfer: otherBlockDataTransfer })
    expect(onChange).not.toHaveBeenCalled()

    // The item MIME present, this block's own id, but an out-of-range index.
    const badIndexDataTransfer = {
      store: {
        'application/x-pond-item': JSON.stringify({ blockId: 'e3', index: 9 }),
      } as Record<string, string>,
      getData(k: string) {
        return this.store[k] ?? ''
      },
      setData(k: string, v: string) {
        this.store[k] = v
      },
    }
    fireEvent.drop(wrappers[2], { dataTransfer: badIndexDataTransfer })
    expect(onChange).not.toHaveBeenCalled()

    const fields = container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    expect(Array.from(fields).map((f) => f.value)).toEqual(['a', 'b', 'c'])
  })

  it('Tab and ⇧Tab in an item hold the caret — lists stay flat (KAN-355)', () => {
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'eggs', checked: false },
        { id: 'x2', label: 'milk', checked: false },
        { id: 'x3', label: 'bread', checked: false },
      ],
    }
    const onChange = jest.fn()
    const { container } = render(<Stateful data={three} onChange={onChange} />)
    const field = rowsOf(container)[1].querySelector<HTMLInputElement>('input[type="text"]')!
    act(() => field.focus())
    field.setSelectionRange(2, 2)

    fireEvent.keyDown(field, { key: 'Tab' })
    expect(document.activeElement).toBe(field)
    expect(field.selectionStart).toBe(2)
    expect(field.selectionEnd).toBe(2)

    fireEvent.keyDown(field, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(field)
    expect(field.selectionStart).toBe(2)
    expect(field.selectionEnd).toBe(2)

    expect(onChange).not.toHaveBeenCalled()
    expect(
      Array.from(container.querySelectorAll<HTMLInputElement>('input[type="text"]')).map(
        (f) => f.value
      )
    ).toEqual(['eggs', 'milk', 'bread'])
  })

  it('↑ moves the caret to the same offset in the previous item (KAN-355)', () => {
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'eggs', checked: false },
        { id: 'x2', label: 'milk', checked: false },
        { id: 'x3', label: 'bread', checked: false },
      ],
    }
    const onChange = jest.fn()
    const { container } = render(<Stateful data={three} onChange={onChange} />)
    const fields = () => container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    act(() => fields()[1].focus())
    fields()[1].setSelectionRange(2, 2)

    fireEvent.keyDown(fields()[1], { key: 'ArrowUp' })

    expect(document.activeElement).toBe(fields()[0])
    expect(fields()[0].selectionStart).toBe(2)
    expect(fields()[0].selectionEnd).toBe(2)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('↓ moves the caret to the same offset, clamped, in the next item (KAN-355)', () => {
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'eggs', checked: false },
        { id: 'x2', label: 'hi', checked: false },
        { id: 'x3', label: 'bread', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} />)
    const fields = () => container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    act(() => fields()[0].focus())
    fields()[0].setSelectionRange(4, 4)

    fireEvent.keyDown(fields()[0], { key: 'ArrowDown' })

    expect(document.activeElement).toBe(fields()[1])
    expect(fields()[1].selectionStart).toBe(2)
    expect(fields()[1].selectionEnd).toBe(2)
  })

  it('↑ on the first item and ↓ on the last item leave existing behaviour alone (no focus change, no `onChange`)', () => {
    const onChange = jest.fn()
    const { container } = render(<Stateful data={legacy} onChange={onChange} />)
    const fields = container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    act(() => fields[0].focus())
    fireEvent.keyDown(fields[0], { key: 'ArrowUp' })
    expect(document.activeElement).toBe(fields[0])

    act(() => fields[1].focus())
    fireEvent.keyDown(fields[1], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(fields[1])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('↑ on the first item calls the row’s leaveUp, ↓ on the last item calls leaveDown (KAN-367)', () => {
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'eggs', checked: false },
        { id: 'x2', label: 'milk', checked: false },
        { id: 'x3', label: 'bread', checked: false },
      ],
    }
    const leaveUp = jest.fn()
    const leaveDown = jest.fn()
    const { container } = render(
      <BlockRowProvider value={{ selected: false, stepOut: () => {}, leaveUp, leaveDown }}>
        <TodoView data={three} editable />
      </BlockRowProvider>
    )
    const fields = container.querySelectorAll<HTMLInputElement>('input[type="text"]')

    act(() => fields[0].focus())
    fireEvent.keyDown(fields[0], { key: 'ArrowUp' })
    expect(leaveUp).toHaveBeenCalledTimes(1)
    expect(typeof leaveUp.mock.calls[0][0]).toBe('number')
    expect(leaveDown).not.toHaveBeenCalled()
    // The first item itself stays focused — only the neighbouring block moves.
    expect(document.activeElement).toBe(fields[0])

    act(() => fields[2].focus())
    fireEvent.keyDown(fields[2], { key: 'ArrowDown' })
    expect(leaveDown).toHaveBeenCalledTimes(1)
    expect(typeof leaveDown.mock.calls[0][0]).toBe('number')
    expect(document.activeElement).toBe(fields[2])

    // The middle item still steps within the list, never reaching leaveUp/leaveDown.
    act(() => fields[1].focus())
    fireEvent.keyDown(fields[1], { key: 'ArrowUp' })
    fireEvent.keyDown(fields[1], { key: 'ArrowDown' })
    expect(leaveUp).toHaveBeenCalledTimes(1)
    expect(leaveDown).toHaveBeenCalledTimes(1)
  })

  it('a row is not draggable until a press starts on its handle (KAN-355)', () => {
    const three: TodoBlock = {
      id: 'e3',
      type: 'todo',
      items: [
        { id: 'x1', label: 'a', checked: false },
        { id: 'x2', label: 'b', checked: false },
        { id: 'x3', label: 'c', checked: false },
      ],
    }
    const { container } = render(<Stateful data={three} />)
    const wrappers = container.querySelectorAll<HTMLElement>('[data-item-id]')
    expect(wrappers[0]).toHaveAttribute('draggable', 'false')
  })
})

describe('TodoView — structural edits without a BlockRowProvider (KAN-355)', () => {
  it('falls back to onChange when no host provides commitStep', () => {
    const onChange = jest.fn()
    const two: TodoBlock = {
      id: 'e2',
      type: 'todo',
      items: [
        { id: 'x1', label: 'eggs', checked: false },
        { id: 'x2', label: '', checked: false },
      ],
    }
    const { container } = render(<TodoView data={two} editable onChange={onChange} />)
    const first = rowsOf(container)[0].querySelector<HTMLInputElement>('input[type="text"]')!
    fireEvent.keyDown(first, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].items).toHaveLength(3)

    onChange.mockClear()
    const empty = rowsOf(container)[1].querySelector<HTMLInputElement>('input[type="text"]')!
    fireEvent.keyDown(empty, { key: 'Backspace' })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].items).toHaveLength(1)
  })
})
