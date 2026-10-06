import { renderHook } from '@testing-library/react'
import type { PropertySchema } from '@/lib/properties/schema'
import type { CollectionRow } from './apply'
import { useDoneToggle } from './use-done-toggle'

const schema: PropertySchema = [
  {
    id: 's',
    name: 'status',
    type: 'status',
    options: [
      { id: 'todo', label: 'to do' },
      { id: 'doing', label: 'doing' },
      { id: 'done', label: 'Done' },
    ],
  },
]
const rowIn = (id: string, status: string): CollectionRow => ({
  id,
  title: id,
  values: { s: status },
})

describe('useDoneToggle', () => {
  it('has no toggle on a read-only host or without an edit seam', () => {
    expect(renderHook(() => useDoneToggle({ schema })).result.current.toggle).toBeUndefined()
    expect(
      renderHook(() => useDoneToggle({ schema, editable: true })).result.current.toggle
    ).toBeUndefined()
  })

  it('ticks to done, and unticks back to the status the record held', () => {
    const onEdit = jest.fn()
    const { result } = renderHook(() => useDoneToggle({ schema, editable: true, onEdit }))

    result.current.toggle!(rowIn('r1', 'doing'))
    expect(onEdit).toHaveBeenLastCalledWith('r1', 's', 'done')

    result.current.toggle!(rowIn('r1', 'done'))
    expect(onEdit).toHaveBeenLastCalledWith('r1', 's', 'doing')
  })

  it('unticks a record it never saw ticked to the first status that is not done', () => {
    const onEdit = jest.fn()
    const { result } = renderHook(() => useDoneToggle({ schema, editable: true, onEdit }))

    result.current.toggle!(rowIn('never-ticked-here', 'done'))
    expect(onEdit).toHaveBeenLastCalledWith('never-ticked-here', 's', 'todo')
  })
})
