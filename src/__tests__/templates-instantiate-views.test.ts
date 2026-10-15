/**
 * `TemplateViewBlock`'s alternate `views` authoring shape (KAN-32): a view block
 * can author several saved views, name-keyed exactly like the single-mode shape
 * `configure_view` already proposes. `instantiateTemplate` resolves each view's
 * config independently and mints each a distinct id — this is that resolution,
 * exercised against a fixture rather than a real premade template (premade.ts's
 * own `project` template moves to this shape in a later ticket item).
 */
import type { ViewBlock } from '@/lib/modules/view/schema'
import { instantiateTemplate } from '@/lib/templates/instantiate'
import type { PremadeTemplate } from '@/lib/templates/premade'

function counter() {
  let n = 0
  return () => `id-${++n}`
}

const FIXTURE: PremadeTemplate = {
  kind: 'project',
  title: 'project name',
  schema: [
    {
      name: 'status',
      type: 'select',
      options: [{ label: 'to do' }, { label: 'doing' }, { label: 'done' }],
    },
    { name: 'start', type: 'date' },
    { name: 'due', type: 'date' },
  ],
  blocks: [
    {
      type: 'view',
      label: 'tasks',
      views: [
        { label: 'board', kind: 'board', groupBy: 'status' },
        { label: 'timeline', kind: 'gantt', startDate: 'start', endDate: 'due' },
      ],
    },
  ],
}

describe('instantiateTemplate › a `views`-authored view block', () => {
  it('mints two distinct view ids, resolves each view to the schema\'s real ids, and mirrors the first view\'s kind onto `mode`', () => {
    const made = instantiateTemplate(FIXTURE, counter())
    const block = made.blocks[0] as ViewBlock
    const statusId = made.schema!.find((p) => p.name === 'status')!.id
    const startId = made.schema!.find((p) => p.name === 'start')!.id
    const dueId = made.schema!.find((p) => p.name === 'due')!.id

    expect(block.type).toBe('view')
    expect(block.label).toBe('tasks')
    expect(block.views).toHaveLength(2)

    const [board, timeline] = block.views!
    expect(board.id).toBeTruthy()
    expect(timeline.id).toBeTruthy()
    expect(board.id).not.toBe(timeline.id)

    expect(board.label).toBe('board')
    expect(board.kind).toBe('board')
    expect(board.config?.groupBy).toBe(statusId)

    expect(timeline.label).toBe('timeline')
    expect(timeline.kind).toBe('gantt')
    expect(timeline.config?.startDate).toBe(startId)
    expect(timeline.config?.endDate).toBe(dueId)

    // The back-compat mirror: the block's own top-level `mode` is the FIRST view's kind.
    expect(block.mode).toBe('board')
  })
})
