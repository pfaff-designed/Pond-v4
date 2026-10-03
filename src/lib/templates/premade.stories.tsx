import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { PREMADE_TEMPLATES, templateMetaLine } from './premade'
import { instantiateTemplate, type InstantiatedTemplate } from './instantiate'
import type { TemplateKind } from './types'
import { PondBlock } from '@/components/organisms/PondBlock'
import { PropertyInspector } from '@/components/molecules/PropertyInspector'
import { ModuleView } from '@/lib/modules/renderers'
import {
  blockEmptyBox,
  blockFrame,
  propertiesFrame,
  viewFrameState,
  type PondBlockState,
} from '@/lib/modules/block-frame'
import { CHART_EMPTY_LINE } from '@/lib/modules/chart/card'
import { CollectionView } from '@/lib/modules/view/view'
import type { CollectionRow } from '@/lib/modules/view/apply'
import type { ViewBlock } from '@/lib/modules/view/schema'
import { HIGHLIGHT_EMPTY_LINE } from '@/lib/modules/highlight/schema'
import { ENTRIES_EMPTY_LINE } from '@/lib/modules/entries/schema'
import type { Block } from '@/lib/modules/content'
import type { PropertySchema, PropertyValue } from '@/lib/properties/schema'

/**
 * The twelve premade templates (#261), each rendered as a whole page through the
 * ORDINARY block path — `blockFrame()` → `PondBlock` → the registry's `ModuleView`
 * (a view block takes `CollectionView` with the story's rows, exactly as `ViewView`
 * would after fetching them). Nothing here knows which template it draws: the page
 * component takes a title, a meta line, blocks, a schema and rows, and that is all.
 *
 * The EMPTY variant is `instantiateTemplate()` — the template data itself, ids
 * minted. The FILLED variant is the board's `f` fixture, hand-built from the same
 * instantiated blocks plus records, so the two can only differ by content.
 *
 * Page chrome, from `PondTemplate.dc.html`'s `renderVals()` (its frames render under
 * a transform, so the literals in that script are the source, never DOM geometry):
 *
 *   page   520 · flex column · gap 14 · padding 24px 20px · radius 20 · paper · 13.5
 *   head   flex column · gap 6 · padding 0 4px 4px
 *   title  serif 200 / 36 / 1.05 / -.01em — full ink filled, ink .68 empty
 *   meta   mono 10.5 / ink .68 — `from template · <kind>` empty, `<kind>` filled
 *
 * The CARDS are level 3 (`PondBlock`: `16px 18px` / gap 12) inside this level-4
 * layout (the template board's `14px 16px` / gap 10 / head gap 10) — two boards, two
 * values, NOT reconciled (ADR 0004's level ladder). This story asserts the page
 * chrome only and leaves the card to `PondBlock.stories.tsx`.
 */

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

// ── The page, drawn through the ordinary block path ───────────────────────────

interface TemplatePageProps {
  title: string
  meta: string
  filled: boolean
  blocks: Block[]
  schema?: PropertySchema
  /** The page's own property values (the `props › details` card). */
  values?: Record<string, PropertyValue>
  /** The page's records — what every view block on it draws. */
  rows?: CollectionRow[]
}

const PAGE_CLASS =
  'flex w-[520px] flex-col gap-[14px] rounded-[20px] bg-mn-surface px-[20px] py-[24px] font-sans text-[13.5px] text-mn-text'
const HEAD_CLASS = 'flex flex-col gap-[6px] px-[4px] pb-[4px]'
// A SIZE and a COLOUR in one string: composed as a literal, never through `cn` (#252).
const TITLE_CLASS = 'font-serif text-[36px] font-extralight leading-[1.05] tracking-[-0.01em]'
const META_CLASS = 'font-mono text-[10.5px] text-mn-text-secondary'

function TemplatePage({
  title,
  meta,
  filled,
  blocks,
  schema,
  values = {},
  rows = [],
}: TemplatePageProps) {
  return (
    <div data-part="template-page" className={PAGE_CLASS}>
      <div data-part="template-head" className={HEAD_CLASS}>
        <span
          data-part="template-title"
          className={`${TITLE_CLASS} ${filled ? 'text-mn-text' : 'text-mn-text-secondary'}`}
        >
          {title}
        </span>
        <span data-part="template-meta" className={META_CLASS}>
          {meta}
        </span>
      </div>
      {schema && (
        <PondBlock {...propertiesFrame(schema)}>
          <PropertyInspector schema={schema} values={values} onChange={() => {}} editable={false} />
        </PondBlock>
      )}
      {blocks.map((block) => (
        <TemplateBlockView key={block.id} block={block} schema={schema} rows={rows} />
      ))}
    </div>
  )
}

/**
 * The frame's state for a view block with the given rows — **the product's own rule**
 * (`viewFrameState`, `block-frame.ts`), not a copy of it. It used to be a local
 * re-derivation of `BlockCanvas`'s `useBlockEmptyState` view branch, which is the
 * defect shape #239's review caught: this story is the evidence that the twelve
 * render correctly, so a copy here would keep passing against a stale rule the day
 * someone changed the hook. The only thing the story adds is the chart mark's copy,
 * which lives in a React module the server-safe rule cannot import; a static story
 * has no write path, so `addRow` is dropped rather than offered and faked.
 */
function storyViewState(
  block: ViewBlock,
  rows: CollectionRow[]
): { state: PondBlockState; emptyLine?: string } {
  const verdict = viewFrameState(block, rows, rows, blockFrame(block))
  if (verdict.state === 'rest') return { state: 'rest' }
  return { state: 'empty', emptyLine: verdict.chartLine ? CHART_EMPTY_LINE : verdict.line }
}

function TemplateBlockView({
  block,
  schema,
  rows,
}: {
  block: Block
  schema?: PropertySchema
  rows: CollectionRow[]
}) {
  const frame = blockFrame(block)
  const view =
    block.type === 'view' ? (
      <CollectionView config={block} schema={schema ?? null} rows={rows} />
    ) : (
      <ModuleView type={block.type} data={block} />
    )
  // Bare prose: `padding 2px 4px`, no card — exactly `BlockEditor`'s unframed branch.
  if (!frame) return <div className="px-1 py-0.5">{view}</div>
  const { state, emptyLine } =
    block.type === 'view' ? storyViewState(block, rows) : { state: 'rest' as const }
  return (
    <PondBlock {...frame} state={state} emptyLine={emptyLine} emptyBox={blockEmptyBox(block)}>
      {view}
    </PondBlock>
  )
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A deterministic minter per kind, so ids are stable across renders. */
const minter = (kind: string) => {
  let n = 0
  return () => `${kind}-${++n}`
}

const empty = (kind: TemplateKind): InstantiatedTemplate =>
  instantiateTemplate(PREMADE_TEMPLATES[kind], minter(kind.replace(' ', '-')))

const pid = (schema: PropertySchema | undefined, name: string) =>
  schema!.find((d) => d.name === name)!.id
const oid = (schema: PropertySchema | undefined, prop: string, label: string) =>
  schema!.find((d) => d.name === prop)!.options!.find((o) => o.label === label)!.id

const row = (id: string, title: string, values: Record<string, unknown>): CollectionRow => ({
  id,
  title,
  values,
})

/** `YYYY-MM-DD` for `days` days before today — the heat grid's window is relative to now. */
const daysAgo = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Filled = Omit<TemplatePageProps, 'meta' | 'filled'>

/** Swap a template block's content for the board's `f` copy, keeping its ids and config. */
const fill = <T extends Block>(block: Block, patch: Partial<T>): Block =>
  ({ ...block, ...patch }) as Block
const items = (base: Block, rows: [string, string?, boolean?][]): Block =>
  fill(base, {
    items: rows.map(([label, meta, done], i) => ({
      id: `${base.id}-i${i}`,
      label,
      checked: !!done,
      ...(meta ? { meta } : {}),
    })),
  })
const cells = (base: Block, columns: string[], rows: string[][]): Block =>
  fill(base, { columns, rows: rows.map((c, i) => ({ id: `${base.id}-r${i}`, cells: c })) })
const entries = (base: Block, rows: [string, string][]): Block =>
  fill(base, { entries: rows.map(([date, text], i) => ({ id: `${base.id}-e${i}`, date, text })) })

/** The board's `f` variant per kind — the acceptance target, built on the instantiated blocks. */
function filled(kind: TemplateKind): Filled {
  const t = empty(kind)
  const b = t.blocks
  const s = t.schema
  switch (kind) {
    case 'page':
      return {
        title: 'on moving',
        blocks: [
          fill(b[0], {
            content:
              'Every flat so far has taught one thing. This one: the light matters more than the size of the kitchen. The next place should face south.',
          }),
        ],
      }
    case 'notes':
      return {
        title: 'ideas',
        blocks: [
          fill(b[0], {
            content: 'A shelf above the desk for the radio. Ask about the allotment waiting list.',
          }),
          fill(
            { ...b[0], id: 'notes-2' },
            {
              content:
                'The café on the corner does a good flat white on Tuesdays, when the other barista is in.',
            }
          ),
        ],
      }
    case 'list':
      return {
        title: 'groceries',
        blocks: [items(b[0], [['oat milk'], ['lemons'], ['rice'], ['coffee beans'], ['bin bags']])],
      }
    case 'project': {
      const task = (id: string, title: string, lane: string, start: string, due: string) =>
        row(id, title, {
          [pid(s, 'status')]: oid(s, 'status', lane),
          [pid(s, 'start')]: start,
          [pid(s, 'due')]: due,
        })
      return {
        title: 'move house',
        schema: s,
        values: { [pid(s, 'status')]: oid(s, 'status', 'doing'), [pid(s, 'due')]: '2026-11-14' },
        blocks: [
          fill(b[0], { content: 'Out of the flat by the 14th, with every box labelled by room.' }),
          b[1],
          b[2],
          entries(b[3], [
            ['28 oct', 'Van booked for the morning of the 14th.'],
            ['24 oct', 'Landlord confirmed the inventory date.'],
          ]),
        ],
        rows: [
          task('t1', 'book the van', 'done', '2026-10-20', '2026-10-22'),
          task('t2', 'cancel broadband', 'done', '2026-10-21', '2026-10-23'),
          task('t3', 'sort the loft', 'doing', '2026-10-25', '2026-11-03'),
          task('t4', 'pack the kitchen', 'to do', '2026-11-01', '2026-11-10'),
          task('t5', 'meter readings', 'to do', '2026-11-14', '2026-11-16'),
        ],
      }
    }
    case 'tracker': {
      const run = (id: string, date: string, km: number) =>
        row(id, date, { [pid(s, 'date')]: date, [pid(s, 'value')]: km })
      return {
        title: 'running',
        schema: s,
        blocks: [
          b[0],
          b[1],
          cells(
            b[2],
            ['date', 'distance'],
            [
              ['24 oct', '5.2 km'],
              ['22 oct', '6.0 km'],
              ['20 oct', '7.2 km'],
            ]
          ),
        ],
        rows: [
          run('r1', '2026-10-20', 7.2),
          run('r2', '2026-10-22', 6),
          run('r3', '2026-10-24', 5.2),
        ],
      }
    }
    case 'journal':
      return {
        title: 'journal',
        blocks: [
          entries(b[0], [
            [
              '25 oct',
              'Slept badly, walked it off. The light on the canal was worth getting up for.',
            ],
            ['24 oct', 'Quiet day. Finished the chapter and started the next.'],
            ['23 oct', 'Long call with Mum. She has decided on the trip after all.'],
          ]),
        ],
      }
    case 'collection':
      return {
        title: 'plants',
        schema: s,
        blocks: b,
        rows: [
          row('p1', 'monstera', { [pid(s, 'field')]: 'water weekly' }),
          row('p2', 'snake plant', { [pid(s, 'field')]: 'every 3 weeks' }),
          row('p3', 'fiddle leaf', { [pid(s, 'field')]: 'no draughts' }),
        ],
      }
    case 'database':
      return {
        title: 'contacts',
        blocks: [
          cells(
            b[0],
            ['name', 'from', 'last spoke'],
            [
              ['Ana Ruiz', 'work', '12 oct'],
              ['Sam Okafor', 'climbing', '3 oct'],
              ['Lee Park', 'school', '18 sep'],
            ]
          ),
        ],
      }
    case 'dashboard': {
      const week = (id: string, date: string, v: number) =>
        row(id, date, { [pid(s, 'date')]: date, [pid(s, 'value')]: v })
      return {
        title: 'this month',
        schema: s,
        blocks: [
          fill(b[0], { label: 'spent' }),
          fill(b[1], { label: 'by week' }),
          items(b[2], [
            ['running', '18.4 km this week'],
            ['move house', '2 of 4 tasks'],
            ['reading list', '3 in progress'],
          ]),
        ],
        rows: [
          week('w1', '2026-10-05', 6),
          week('w2', '2026-10-12', 9),
          week('w3', '2026-10-19', 7),
          week('w4', '2026-10-26', 11),
        ],
      }
    }
    case 'meeting notes':
      return {
        title: 'weekly sync',
        schema: s,
        values: { [pid(s, 'date')]: '2026-10-23', [pid(s, 'with')]: 'Ana, Sam' },
        blocks: [
          fill(b[0], { content: 'Launch moves a week. Copy is the last thing blocking it.' }),
          items(b[1], [
            ['Sam — final copy', '27 oct', false],
            ['Ana — book the room', undefined, true],
          ]),
        ],
      }
    case 'reading list':
      return {
        title: 'reading list',
        blocks: [
          cells(
            b[0],
            ['title', 'author', 'status'],
            [
              ['The Overstory', 'Richard Powers', 'reading'],
              ['Braiding Sweetgrass', 'Robin Wall Kimmerer', 'next'],
              ['Piranesi', 'Susanna Clarke', 'finished'],
            ]
          ),
          fill(b[1], { content: 'Three books at once is one too many.' }),
        ],
      }
    case 'habit':
      return {
        title: 'walk every day',
        schema: s,
        blocks: [b[0], b[1], items(b[2], [['walked today', undefined, true]])],
        // Twelve kept days inside the grid's window, the most recent in the current week.
        rows: [0, 1, 2, 4, 6, 9, 13, 20, 27, 41, 55, 70].map((d, i) =>
          row(`h${i}`, daysAgo(d), { [pid(s, 'date')]: daysAgo(d) })
        ),
      }
  }
}

// ── Assertions ────────────────────────────────────────────────────────────────

const LIGHT = {
  paper: 'rgb(250, 249, 239)',
  ink: 'rgb(27, 29, 20)',
  ink68: 'rgba(27, 29, 20, 0.68)',
}
const DARK = {
  paper: 'rgb(27, 29, 20)',
  ink: 'rgb(250, 249, 239)',
  ink68: 'rgba(250, 249, 239, 0.68)',
}
type Theme = typeof LIGHT

/** The page chrome, measured against the board's literals, plus the head's copy. */
async function assertChrome(
  root: HTMLElement,
  theme: Theme,
  title: string,
  meta: string,
  filledPage: boolean
) {
  const page = root.querySelector<HTMLElement>('[data-part="template-page"]')!
  const ps = getComputedStyle(page)
  await expect(ps.width).toBe('520px')
  await expect(ps.display).toBe('flex')
  await expect(ps.flexDirection).toBe('column')
  await expect(ps.rowGap).toBe('14px')
  await expect(ps.paddingTop).toBe('24px')
  await expect(ps.paddingBottom).toBe('24px')
  await expect(ps.paddingLeft).toBe('20px')
  await expect(ps.paddingRight).toBe('20px')
  await expect(ps.borderTopLeftRadius).toBe('20px')
  await expect(ps.backgroundColor).toBe(theme.paper)
  await expect(ps.fontSize).toBe('13.5px')
  await expect(ps.color).toBe(theme.ink)

  const head = root.querySelector<HTMLElement>('[data-part="template-head"]')!
  const hs = getComputedStyle(head)
  await expect(hs.display).toBe('flex')
  await expect(hs.flexDirection).toBe('column')
  await expect(hs.rowGap).toBe('6px')
  await expect(hs.paddingLeft).toBe('4px')
  await expect(hs.paddingRight).toBe('4px')
  await expect(hs.paddingBottom).toBe('4px')
  await expect(hs.paddingTop).toBe('0px')

  const t = root.querySelector<HTMLElement>('[data-part="template-title"]')!
  const ts = getComputedStyle(t)
  await expect(t.textContent).toBe(title)
  await expect(ts.fontFamily).toContain('PP Editorial New')
  await expect(ts.fontWeight).toBe('200')
  await expect(ts.fontSize).toBe('36px')
  await expect(parseFloat(ts.lineHeight)).toBeCloseTo(36 * 1.05, 1)
  await expect(parseFloat(ts.letterSpacing)).toBeCloseTo(-0.36, 2) // -.01em of 36
  await expect(ts.color).toBe(filledPage ? theme.ink : theme.ink68)

  const m = root.querySelector<HTMLElement>('[data-part="template-meta"]')!
  const ms = getComputedStyle(m)
  await expect(m.textContent).toBe(meta)
  await expect(ms.fontFamily).toContain('PP Neue Montreal Mono')
  await expect(ms.fontSize).toBe('10.5px')
  await expect(ms.color).toBe(theme.ink68)
}

/**
 * Every block renders through the ordinary path: a framed block is a `PondBlock`
 * card whose eyebrow is the block's own label (or its kind), in page order; an
 * unlabelled text block is bare — no card around it. Block-held placeholder copy is
 * on screen; a block that draws its own empty line draws the board's.
 */
async function assertBlocks(root: HTMLElement, page: Pick<TemplatePageProps, 'blocks' | 'schema'>) {
  const canvas = within(root)
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-block-kind]'))
  const framed = page.blocks.map(blockFrame).filter((f) => f !== null)
  await expect(cards).toHaveLength(framed.length + (page.schema ? 1 : 0))
  const eyebrows = cards.map((c) => (c.firstElementChild as HTMLElement).children[0].textContent)
  await expect(eyebrows).toEqual([
    ...(page.schema ? ['properties'] : []),
    ...framed.map((f) => f.heading),
  ])

  // Read-only views draw text, not inputs; a line can recur (`—`, `today`), so presence
  // is "at least once in this page".
  const present = (text: string) => expect(canvas.getAllByText(text).length).toBeGreaterThan(0)
  for (const block of page.blocks) {
    switch (block.type) {
      case 'text': {
        const el = canvas.getAllByText(block.content)[0]
        await expect(el.closest('[data-block-kind]') === null).toBe(!block.label)
        break
      }
      case 'todo':
        for (const item of block.items) await present(item.label)
        break
      case 'table':
        for (const r of block.rows) for (const c of r.cells) await present(c)
        break
      case 'entries':
        for (const e of block.entries) {
          await present(e.date)
          await present(e.text || ENTRIES_EMPTY_LINE)
        }
        break
      case 'highlight':
        await present(block.content || HIGHLIGHT_EMPTY_LINE)
        break
    }
  }
}

// ── Stories ───────────────────────────────────────────────────────────────────

const meta = {
  title: 'Templates/Premade',
  component: TemplatePage,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TemplatePage>

export default meta
type Story = StoryObj<typeof meta>

/** Empty (the data) and filled (the board's `f` fixture) side by side, in one theme. */
function story(kind: TemplateKind, theme: 'paper' | 'ink'): Story {
  const e = empty(kind)
  const f = filled(kind)
  const t = theme === 'ink' ? DARK : LIGHT
  return {
    args: { ...e, meta: templateMetaLine(kind, false), filled: false },
    decorators: theme === 'ink' ? [inkTheme] : [],
    render: () => (
      <div className="flex flex-wrap items-start gap-mn-6">
        <div data-variant="empty">
          <TemplatePage {...e} meta={templateMetaLine(kind, false)} filled={false} />
        </div>
        <div data-variant="filled">
          <TemplatePage {...f} meta={templateMetaLine(kind, true)} filled />
        </div>
      </div>
    ),
    play: async ({ canvasElement }) => {
      const emptyRoot = canvasElement.querySelector<HTMLElement>('[data-variant="empty"]')!
      const filledRoot = canvasElement.querySelector<HTMLElement>('[data-variant="filled"]')!
      await assertChrome(emptyRoot, t, e.title, templateMetaLine(kind, false), false)
      await assertBlocks(emptyRoot, e)
      await assertChrome(filledRoot, t, f.title, templateMetaLine(kind, true), true)
      await assertBlocks(filledRoot, f)
      // No tie back: the page is a title, blocks and (maybe) a schema — nothing else.
      await expect(Object.keys(e).sort()).toEqual(
        e.schema ? ['blocks', 'schema', 'title'] : ['blocks', 'title']
      )
    },
  }
}

export const Page = story('page', 'paper')
export const PageInk = story('page', 'ink')
export const Notes = story('notes', 'paper')
export const NotesInk = story('notes', 'ink')
export const List = story('list', 'paper')
export const ListInk = story('list', 'ink')
export const Project = story('project', 'paper')
export const ProjectInk = story('project', 'ink')
export const Tracker = story('tracker', 'paper')
export const TrackerInk = story('tracker', 'ink')
export const Journal = story('journal', 'paper')
export const JournalInk = story('journal', 'ink')
export const Collection = story('collection', 'paper')
export const CollectionInk = story('collection', 'ink')
export const Database = story('database', 'paper')
export const DatabaseInk = story('database', 'ink')
export const Dashboard = story('dashboard', 'paper')
export const DashboardInk = story('dashboard', 'ink')
export const MeetingNotes = story('meeting notes', 'paper')
export const MeetingNotesInk = story('meeting notes', 'ink')
export const ReadingList = story('reading list', 'paper')
export const ReadingListInk = story('reading list', 'ink')
export const Habit = story('habit', 'paper')
export const HabitInk = story('habit', 'ink')
