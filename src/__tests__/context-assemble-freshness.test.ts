/**
 * KAN-302 item 3: "Pond's next chat read of the open page reflects the
 * person's latest edit and rename." `fetchNodeContext` queries the `pages`
 * row fresh on every call (no cache) — this confirms that, so the real gap
 * (the debounced save not having landed yet) is isolated to the save path,
 * not this read.
 */
import { fetchNodeContext } from '@/lib/context/assemble'
import { makeFakeSupabase } from './helpers/fake-supabase'
import type { Row } from './helpers/fake-supabase'

const page: Row = {
  id: 'p1',
  user_id: 'user-1',
  parent_id: null,
  type: 'page',
  title: 'Untitled',
  blocks: [{ id: 'b1', type: 'text', content: 'Hello world' }],
  props: {},
  order: 0,
}

describe('fetchNodeContext reads the pages row fresh per call', () => {
  it('reflects a title + blocks change made between two calls, no caching', async () => {
    const sb = makeFakeSupabase([page])

    const before = await fetchNodeContext(sb as never, 'user-1', 'p1')
    expect(before?.title).toBe('Untitled')
    expect(before?.documents[0]?.blocks).toEqual([
      { id: 'b1', type: 'text', content: 'Hello world' },
    ])

    // Simulate a save landing in the DB between the two chat turns.
    sb._pages.set('p1', {
      ...page,
      title: 'Plans',
      blocks: [{ id: 'b1', type: 'text', content: 'Hello moon xyz' }],
    })

    const after = await fetchNodeContext(sb as never, 'user-1', 'p1')
    expect(after?.title).toBe('Plans')
    expect(after?.documents[0]?.blocks).toEqual([
      { id: 'b1', type: 'text', content: 'Hello moon xyz' },
    ])
  })
})
