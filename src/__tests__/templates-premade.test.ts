/**
 * The twelve premade templates as DATA (#261, child 228e of #228) — ADR 0005's
 * falsifiable check: every template is a title plus blocks a person could have built
 * by hand, with ZERO rendering code written for any of them.
 *
 * What is pinned here, and why:
 *
 *   - the block list, labels and placeholder copy of each template match
 *     `PondTemplate.dc.html`'s `T` table (its EMPTY variant) exactly, in order;
 *   - no head note is persisted — notes are derived in `blockFrame()`;
 *   - the page schema five templates need (the addendum's finding 2) is the smallest
 *     honest one, named from the board where the board names fields;
 *   - instantiation mints every id (block, nested, property, option) through the
 *     EXISTING minters, resolves view property NAMES against the freshly minted
 *     schema, and leaves no reference to the template behind (6f frame 4 / ADR 0005);
 *   - every property a view block references exists in the page's own schema — so a
 *     later "fix" that pre-seeds a fake property has to argue with a test (#246);
 *   - no records are seeded: the two record-shaped placeholders the board draws are
 *     filed, not coded around.
 */
import { blockSchema } from '@/lib/modules/content'
import { todoMarker } from '@/lib/modules/todo/schema'
import { HIGHLIGHT_EMPTY_LINE } from '@/lib/modules/highlight/schema'
import { ENTRIES_EMPTY_LINE } from '@/lib/modules/entries/schema'
import type { ViewBlock } from '@/lib/modules/view/schema'
import { resolveViewConfig } from '@/lib/pages/configure-view'
import { TEMPLATE_KINDS, type TemplateKind } from '@/lib/templates/types'
import {
  PREMADE_TEMPLATES,
  templateMetaLine,
  type PremadeTemplate,
  type TemplateBlock,
} from '@/lib/templates/premade'
import { instantiateTemplate, viewPropertyRefs } from '@/lib/templates/instantiate'

/** A deterministic minter: `t-1`, `t-2`, … */
const counter = () => {
  let n = 0
  return () => `t-${++n}`
}

/**
 * One line per block, in the board's own vocabulary, so a template's shape reads
 * against the `T` table at a glance: `kind[:mode][:marker] › label`.
 */
function shape(block: TemplateBlock): string {
  const label = 'label' in block && block.label ? ` › ${block.label}` : ''
  switch (block.type) {
    case 'todo':
      return `todo:${todoMarker(block)}${label}`
    case 'view':
      return `view:${block.mode}${block.chart?.presentation === 'compact' ? `:${block.chart.kind}` : ''}${label}`
    case 'table':
      return `table › ${block.title}`
    default:
      return `${block.type}${label}`
  }
}

const shapes = (t: PremadeTemplate) => t.blocks.map(shape)

describe('the twelve, keyed off TEMPLATE_KINDS — no second hand-kept list', () => {
  it('has exactly one definition per kind, each naming its own kind', () => {
    expect(Object.keys(PREMADE_TEMPLATES).sort()).toEqual([...TEMPLATE_KINDS].sort())
    for (const kind of TEMPLATE_KINDS) expect(PREMADE_TEMPLATES[kind].kind).toBe(kind)
  })

  it("titles are the board's empty titles", () => {
    const titles = Object.fromEntries(TEMPLATE_KINDS.map((k) => [k, PREMADE_TEMPLATES[k].title]))
    expect(titles).toEqual({
      page: 'untitled',
      notes: 'notes',
      list: 'list',
      project: 'project name',
      tracker: 'tracker',
      journal: 'journal',
      collection: 'collection',
      database: 'database',
      dashboard: 'dashboard',
      'meeting notes': 'meeting',
      'reading list': 'reading list',
      habit: 'habit',
    })
  })

  it('the meta line reads `from template · <kind>` when empty and the kind alone when filled, expanded', () => {
    expect(templateMetaLine('reading list', false)).toBe('from template · reading list')
    expect(templateMetaLine('meeting notes', false)).toBe('from template · meeting notes')
    expect(templateMetaLine('project', true)).toBe('project')
  })
})

describe("each template's block list matches the board's `T` table, in order", () => {
  it.each<[TemplateKind, string[]]>([
    ['page', ['text']],
    ['notes', ['text']],
    ['list', ['todo:dot › items']],
    [
      'project',
      [
        'text › goal',
        'view:board › tasks — board',
        'view:gantt › tasks — timeline',
        'entries › updates',
      ],
    ],
    ['tracker', ['view:big-number › this week', 'view:chart:bar › by week', 'table › log']],
    ['journal', ['entries › entries']],
    ['collection', ['view:gallery › records']],
    ['database', ['table › records']],
    ['dashboard', ['view:big-number › figure', 'view:chart:bar › chart', 'todo:none › pages']],
    ['meeting notes', ['text › notes', 'todo:check › actions']],
    ['reading list', ['table › books', 'highlight › kept']],
    ['habit', ['view:big-number › streak', 'view:chart:heatmap › every day', 'todo:check › today']],
  ])('%s', (kind, expected) => {
    expect(shapes(PREMADE_TEMPLATES[kind])).toEqual(expected)
  })

  it("`props` is not a block: it is the page's schema, framed by propertiesFrame (ADR 0007)", () => {
    for (const kind of TEMPLATE_KINDS) {
      for (const block of PREMADE_TEMPLATES[kind].blocks) {
        expect((block as { type: string }).type).not.toBe('props')
        expect((block as { type: string }).type).not.toBe('properties')
      }
    }
  })
})

describe("placeholder copy is the board's `e:` value, held as the block's own data", () => {
  const blocksOf = (kind: TemplateKind) => PREMADE_TEMPLATES[kind].blocks

  it('bare text — `page` and `notes` carry no label and the board line as content', () => {
    expect(blocksOf('page')).toEqual([
      { type: 'text', content: 'type, or / for blocks and templates' },
    ])
    expect(blocksOf('notes')).toEqual([{ type: 'text', content: 'anything, in any order' }])
  })

  it('labelled text — `project › goal` and `meeting › notes` are cards (#258)', () => {
    expect(blocksOf('project')[0]).toEqual({
      type: 'text',
      label: 'goal',
      content: 'what done looks like',
    })
    expect(blocksOf('meeting notes')[0]).toEqual({
      type: 'text',
      label: 'notes',
      content: 'what was said',
    })
  })

  it("todo rows — the board's `[label, meta?, done?]` tuples; an empty `b` omits meta", () => {
    expect(blocksOf('list')[0]).toEqual({
      type: 'todo',
      marker: 'dot',
      label: 'items',
      items: [{ label: 'first item', checked: false }],
    })
    expect(blocksOf('dashboard')[2]).toEqual({
      type: 'todo',
      marker: 'none',
      label: 'pages',
      items: [{ label: 'link a page', checked: false }],
    })
    expect(blocksOf('meeting notes')[1]).toEqual({
      type: 'todo',
      marker: 'check',
      label: 'actions',
      items: [{ label: 'first action', checked: false }],
    })
    expect(blocksOf('habit')[2]).toEqual({
      type: 'todo',
      marker: 'check',
      label: 'today',
      items: [{ label: 'done today', checked: false }],
    })
  })

  it("tables — `title` IS the label (the one exception, #258), cols + the board's row", () => {
    expect(blocksOf('tracker')[2]).toEqual({
      type: 'table',
      title: 'log',
      columns: ['date', 'value'],
      rows: [{ cells: ['today', '—'] }],
    })
    expect(blocksOf('database')[0]).toEqual({
      type: 'table',
      title: 'records',
      columns: ['name', 'field'],
      rows: [{ cells: ['first record', '—'] }],
    })
    expect(blocksOf('reading list')[0]).toEqual({
      type: 'table',
      title: 'books',
      columns: ['title', 'author', 'status'],
      rows: [{ cells: ['first book', '—', '—'] }],
    })
  })

  it("entries — `project › updates` is template copy; the journal's first entry is the block's OWN empty line, so it stays blank", () => {
    expect(blocksOf('project')[3]).toEqual({
      type: 'entries',
      label: 'updates',
      entries: [{ date: 'today', text: 'first update' }],
    })
    // `write the first entry` is `ENTRIES_EMPTY_LINE`: the view already draws it for a
    // blank entry, at placeholder ink. Writing it as content would paint it as prose.
    expect(blocksOf('journal')[0]).toEqual({
      type: 'entries',
      label: 'entries',
      serif: true,
      entries: [{ date: 'today', text: '' }],
    })
    expect(ENTRIES_EMPTY_LINE).toBe('write the first entry')
  })

  it("highlight — `a line worth keeping` is the block's own empty line; content stays empty so no wheat is painted", () => {
    expect(blocksOf('reading list')[1]).toEqual({ type: 'highlight', label: 'kept', content: '' })
    expect(HIGHLIGHT_EMPTY_LINE).toBe('a line worth keeping')
  })

  it('no head note is persisted on any block — notes are derived in blockFrame()', () => {
    for (const kind of TEMPLATE_KINDS) {
      for (const block of PREMADE_TEMPLATES[kind].blocks) {
        expect(block).not.toHaveProperty('note')
        expect(block).not.toHaveProperty('id')
      }
    }
  })
})

describe('the page schema five templates need (addendum finding 2) — the smallest honest one', () => {
  const schemaOf = (kind: TemplateKind) =>
    PREMADE_TEMPLATES[kind].schema?.map((d) => [d.name, d.type, d.options?.map((o) => o.label)])

  it("project — the board's `status` + `due`, plus `start` so the gantt's own copy (`a start and a due date`) is true", () => {
    expect(schemaOf('project')).toEqual([
      ['status', 'select', ['to do', 'doing', 'done']],
      ['start', 'date', undefined],
      ['due', 'date', undefined],
    ])
  })

  it("meeting notes — the board's `date` + `with`", () => {
    expect(schemaOf('meeting notes')).toEqual([
      ['date', 'date', undefined],
      ['with', 'text', undefined],
    ])
  })

  it("collection — one field, named with the board's own placeholder word for an unnamed field", () => {
    expect(schemaOf('collection')).toEqual([['field', 'text', undefined]])
  })

  it("tracker and dashboard — the tracker's `log` cols, `date` + `value`; habit — `date` alone", () => {
    expect(schemaOf('tracker')).toEqual([
      ['date', 'date', undefined],
      ['value', 'number', undefined],
    ])
    expect(schemaOf('dashboard')).toEqual(schemaOf('tracker'))
    expect(schemaOf('habit')).toEqual([['date', 'date', undefined]])
  })

  it('the other six carry no schema — they are not collections', () => {
    for (const kind of ['page', 'notes', 'list', 'journal', 'database', 'reading list'] as const) {
      expect(PREMADE_TEMPLATES[kind].schema).toBeUndefined()
    }
  })
})

describe('instantiateTemplate — ids minted through the existing paths, nothing tied back', () => {
  it.each(TEMPLATE_KINDS)(
    '%s instantiates to valid blocks with every id minted and unique',
    (kind) => {
      const page = instantiateTemplate(PREMADE_TEMPLATES[kind], counter())
      expect(page.title).toBe(PREMADE_TEMPLATES[kind].title)
      expect(page.blocks).toHaveLength(PREMADE_TEMPLATES[kind].blocks.length)
      const ids: string[] = []
      for (const block of page.blocks) {
        expect(blockSchema.safeParse(block).success).toBe(true)
        ids.push(block.id)
        for (const key of ['items', 'rows', 'entries'] as const) {
          const nested = (block as Record<string, unknown>)[key]
          if (Array.isArray(nested)) for (const el of nested) ids.push((el as { id: string }).id)
        }
      }
      for (const def of page.schema ?? []) {
        ids.push(def.id)
        for (const opt of def.options ?? []) ids.push(opt.id)
      }
      expect(ids.every((id) => /^t-\d+$/.test(id))).toBe(true)
      expect(new Set(ids).size).toBe(ids.length)
    }
  )

  it('leaves NO reference to the template — the page is ordinary blocks (6f frame 4, ADR 0005)', () => {
    const page = instantiateTemplate(PREMADE_TEMPLATES.project, counter())
    expect(Object.keys(page).sort()).toEqual(['blocks', 'schema', 'title'])
    const json = JSON.stringify(page)
    expect(json).not.toMatch(/template/i)
    expect(json).not.toMatch(/madeFrom/i)
    expect(json).not.toMatch(/premade/i)
  })

  it('every property a view block references exists in the page’s OWN freshly minted schema — nothing pre-seeded, nothing dangling', () => {
    for (const kind of TEMPLATE_KINDS) {
      const page = instantiateTemplate(PREMADE_TEMPLATES[kind], counter())
      const ids = new Set((page.schema ?? []).map((d) => d.id))
      for (const block of page.blocks) {
        if (block.type !== 'view') continue
        const refs = viewPropertyRefs(block)
        if (!page.schema) expect(refs).toEqual([])
        for (const ref of refs) expect(ids.has(ref)).toBe(true)
      }
    }
  })

  it('project — the board groups by `status` (lanes = its three options); the gantt and the figure stay inferred', () => {
    const page = instantiateTemplate(PREMADE_TEMPLATES.project, counter())
    const status = page.schema!.find((d) => d.name === 'status')!
    const board = page.blocks[1] as ViewBlock
    expect(board.mode).toBe('board')
    expect(board.groupBy).toBe(status.id)
    expect(status.options!.map((o) => o.label)).toEqual(['to do', 'doing', 'done'])
    const gantt = page.blocks[2] as ViewBlock
    expect(gantt.mode).toBe('gantt')
    expect(gantt.startDate).toBeUndefined()
    expect(gantt.endDate).toBeUndefined()
  })

  it('tracker / dashboard `bars` are the compact `bar` chart over `value` by `date`; habit `heat` the compact `heatmap` by `date`', () => {
    for (const kind of ['tracker', 'dashboard'] as const) {
      const page = instantiateTemplate(PREMADE_TEMPLATES[kind], counter())
      const byName = (n: string) => page.schema!.find((d) => d.name === n)!.id
      const bars = page.blocks[1] as ViewBlock
      expect(bars.mode).toBe('chart')
      expect(bars.chart).toEqual({
        kind: 'bar',
        xProperty: byName('date'),
        series: [{ property: byName('value'), agg: 'sum' }],
        presentation: 'compact',
      })
      const figure = page.blocks[0] as ViewBlock
      expect(figure.mode).toBe('big-number')
      expect(figure.bigNumber).toBeUndefined()
    }
    const habit = instantiateTemplate(PREMADE_TEMPLATES.habit, counter())
    const date = habit.schema![0].id
    const heat = habit.blocks[1] as ViewBlock
    expect(heat.chart).toEqual({
      kind: 'heatmap',
      xProperty: date,
      series: [{ property: date, agg: 'count' }],
      presentation: 'compact',
    })
  })

  it('seeds no records — the board’s `first task` card and three gallery cards are filed (#246 family), not coded around', () => {
    const project = instantiateTemplate(PREMADE_TEMPLATES.project, counter())
    const collection = instantiateTemplate(PREMADE_TEMPLATES.collection, counter())
    for (const page of [project, collection]) {
      expect(page).not.toHaveProperty('rows')
      expect(page).not.toHaveProperty('children')
    }
    expect(collection.blocks).toHaveLength(1)
    expect(collection.blocks[0].type).toBe('view')
  })

  it('defaults to crypto.randomUUID when no minter is given', () => {
    const page = instantiateTemplate(PREMADE_TEMPLATES.list)
    expect(page.blocks[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('resolveViewConfig threads `presentation` (#259 flag through the #19 name→id seam)', () => {
  it('keeps the compact presentation beside the resolved series', () => {
    const resolved = resolveViewConfig(
      [
        { id: 'p-date', name: 'date', type: 'date' },
        { id: 'p-value', name: 'value', type: 'number' },
      ],
      {
        mode: 'chart',
        chart: {
          kind: 'bar',
          xProperty: 'date',
          series: [{ property: 'value', agg: 'sum' }],
          presentation: 'compact',
        },
      }
    )
    expect(resolved.chart?.presentation).toBe('compact')
    expect(resolved.chart?.xProperty).toBe('p-date')
  })
})
