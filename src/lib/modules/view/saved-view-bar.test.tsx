/**
 * KAN-243 fix-2a — `SavedViewBar`'s undo must read "what is current right now"
 * off a HOST-owned getter, not a ref this component owns itself. BlockCanvas
 * draws two separate `SavedViewBar` instances for one block (the empty-state
 * bar and `ViewControls`' own live bar) that swap as the block's empty/rest
 * state changes, so a ref owned by one instance freezes the moment that
 * instance unmounts — see `active-view-context.ts`'s `SavedViewHost` doc.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { SavedViewBar } from './saved-view-bar'
import type { ViewBlock } from './schema'
import type { PropertySchema } from '@/lib/properties/schema'

const dateless: PropertySchema = [{ id: 'p-title', name: 'Title', type: 'text' }]

const onePickerView: ViewBlock = {
  id: 'v-picker',
  type: 'view',
  mode: 'table',
  views: [{ id: 'view-table', label: 'table', kind: 'table', config: {} }],
  activeViewId: 'view-table',
}

/**
 * The host this item asks for: a `latestBlock` ref and a `getLatestSchema`
 * getter that outlive any one `SavedViewBar` mount, plus a `select` the test
 * can use to simulate the OTHER instance's own activation. `updateSchema`
 * writes straight into the host's own schema ref, mirroring the real
 * `useCollectionRows`/react-query cache write being synchronous.
 */
function makeHost(block: ViewBlock, schema: PropertySchema) {
  const latestBlock = { current: block }
  let latestSchema = schema
  return {
    latestBlock,
    getLatestSchema: () => latestSchema,
    updateSchema: (next: PropertySchema) => {
      latestSchema = next
    },
    setBlock: (next: ViewBlock) => {
      latestBlock.current = next
    },
  }
}

function Harness({
  host,
  onChange,
  onSelect,
  activeId,
}: {
  host: ReturnType<typeof makeHost>
  onChange: (next: ViewBlock) => void
  onSelect: (id: string) => void
  activeId: string
}) {
  // `schema`/`block` below are this instance's own render-time snapshot (what a
  // bare prop render would pass) — the whole point of the fix is that undo must
  // NOT rely on these once the host's own "current" has moved on.
  const [schemaProp] = useState(() => host.getLatestSchema())
  return (
    <SavedViewBar
      block={host.latestBlock.current}
      schema={schemaProp}
      updateSchema={host.updateSchema}
      activeId={activeId}
      onSelect={onSelect}
      editable
      onChange={onChange}
      latestBlock={host.latestBlock}
      getLatestSchema={host.getLatestSchema}
    />
  )
}

/**
 * `DeletionUndoProvider` renders the toast viewport itself (outside `Harness`),
 * so it must stay mounted across the swap below — only `Harness` (standing in
 * for one `SavedViewBar` instance) unmounts, via `rerender`'s `showBar={false}`,
 * not `render`'s own `unmount` (which would tear down the toast too).
 */
function Wrapper({
  showBar,
  host,
  onChange,
}: {
  showBar: boolean
  host: ReturnType<typeof makeHost>
  onChange: (next: ViewBlock) => void
}) {
  return (
    <DeletionUndoProvider>
      {showBar && (
        <Harness host={host} onChange={onChange} onSelect={jest.fn()} activeId="view-table" />
      )}
    </DeletionUndoProvider>
  )
}

function renderBar(host: ReturnType<typeof makeHost>, onChange: (next: ViewBlock) => void) {
  return render(<Wrapper showBar host={host} onChange={onChange} />)
}

describe('SavedViewBar — undo reads the host-owned "current", not a ref frozen at unmount (KAN-243 fix-2a)', () => {
  it('undoing an older add leaves a later add (staged by a DIFFERENT instance) intact', async () => {
    const user = userEvent.setup()
    const host = makeHost(onePickerView, dateless)
    const onChange = jest.fn()
    const { rerender } = renderBar(host, onChange)

    // Pick "calendar" — mints a date field, adds the view, stages the first toast.
    await user.click(screen.getByRole('button', { name: 'add a view' }))
    await user.click(screen.getByRole('option', { name: /calendar/ }))

    const afterCalendar = onChange.mock.calls.at(-1)![0] as ViewBlock
    expect(afterCalendar.views).toHaveLength(2)
    const calendarViewId = afterCalendar.views![1].id
    const dateFieldId = host.getLatestSchema()!.find((d) => d.type === 'date')!.id

    // The instance that staged the toast unmounts — mirrors BlockCanvas swapping
    // the empty-state bar out for `ViewControls`' own live bar. `DeletionUndoProvider`
    // (and the toast it already staged) stays mounted, as it does in the real app.
    rerender(<Wrapper showBar={false} host={host} onChange={onChange} />)

    // A SECOND add happens through what the real app would draw as the OTHER
    // instance: simulate it by writing straight into the host, exactly as that
    // other instance's own `runAddView` would (mint a status field, append a
    // board view), without ever touching the unmounted instance's own refs.
    const schemaWithStatus: PropertySchema = [
      ...host.getLatestSchema()!,
      { id: 'f-status', name: 'status', type: 'status', options: [] },
    ]
    host.updateSchema(schemaWithStatus)
    const afterBoard: ViewBlock = {
      ...afterCalendar,
      views: [
        ...afterCalendar.views!,
        { id: 'view-board', label: 'board', kind: 'board', config: {} },
      ],
      activeViewId: 'view-board',
    }
    host.setBlock(afterBoard)

    // Undo the FIRST (calendar) toast.
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    const afterUndo = onChange.mock.calls.at(-1)![0] as ViewBlock
    expect(afterUndo.views!.map((v) => v.id)).toEqual(['view-table', 'view-board'])
    expect(afterUndo.views!.some((v) => v.id === calendarViewId)).toBe(false)

    const schemaAfterUndo = host.getLatestSchema()!
    expect(schemaAfterUndo.some((d) => d.id === dateFieldId)).toBe(false)
    expect(schemaAfterUndo.some((d) => d.type === 'status')).toBe(true)
  })
})
