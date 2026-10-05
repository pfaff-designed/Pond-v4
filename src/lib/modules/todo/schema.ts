import { z } from 'zod'
import { labelledBlockFields, type ModuleDescriptor } from '../types'

/**
 * The board's three row markers (#219). `PondTemplate.dc.html`'s `renderVals()`
 * models `list` and `check` as ONE row that differs by what leads it:
 *
 *   hasBox: k === 'check',                      // the checkbox
 *   hasDot: k === 'list' && !d.links,           // the ink-.5 dot
 *   aStyle: { …, fontWeight: d.links ? 500 : 400 }
 *
 * So there are exactly three cases and they are the board's own:
 *
 *   check  the checkbox, label 400     `meeting › actions`, `habit › today`
 *   dot    the dot, label 400          `list › items`
 *   none   nothing, label 500          `dashboard › pages` (`links: 1`)
 *
 * NOT a new block type. The board renders both through one `isRows` branch over
 * identical data (`[label, meta, done]`), and `PondMolecule.dc.html` sets `isList` /
 * `isCheck` over one identical `row` box. A second persisted type holding the same
 * data under another name is the duplicate `AGENTS.md` deletes (#111 spent 8,952
 * deleted lines removing one). The marker is a block-level field, optional,
 * defaulting to `check` so every persisted checklist is unchanged — no migration.
 */
export const TODO_MARKERS = ['check', 'dot', 'none'] as const
export type TodoMarker = (typeof TODO_MARKERS)[number]
export const todoMarkerSchema = z.enum(TODO_MARKERS)

export const todoItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  checked: z.boolean(),
  /**
   * The board's `b` column (#219): quiet mono text at the row's right — a due date
   * in `meeting › actions` (`'27 oct'`), a summary in `dashboard › pages`
   * (`'18.4 km this week'`), nothing in `list › items`. Optional; the board omits
   * the column when empty (`b: y || ''`). Short authored copy, not a typed date —
   * anything that needs date arithmetic is a database's job.
   */
  meta: z
    .string()
    .optional()
    .describe(
      'Optional short note shown quietly at the right of the item — a due date like "27 oct" or "today", or a one-line summary. Omit when there is nothing to say.'
    ),
})

/**
 * A checklist, or — under a `dot` / `none` marker — the board's plain `list`. Items
 * carry their own stable ids for targeted edits.
 *
 * The block-level `label` (#258) is the board's eyebrow for the whole block
 * (`check → actions` in `meeting`, `list → items` in `groceries`); an item's `label`
 * is that row's text. Two different things that happen to share a word — the
 * block's is the shared mixin from `types.ts`, read by `blockFrame()`.
 */
export const todoSchema = z
  .object({
    id: z.string(),
    type: z.literal('todo'),
    items: z.array(todoItemSchema),
    marker: todoMarkerSchema
      .optional()
      .describe(
        'What leads each row. "check" (the default) draws a checkbox — a to-do list. "dot" draws a plain bullet — a list of things with nothing to tick off. "none" draws no marker and sets the label in medium weight — a list of links or named things with a summary beside each.'
      ),
  })
  .extend(labelledBlockFields)

export type TodoItem = z.infer<typeof todoItemSchema>
export type TodoBlock = z.infer<typeof todoSchema>

/** The block's marker, read off the block — `check` when it has none (every pre-#219 checklist). */
export function todoMarker(block: Pick<TodoBlock, 'marker'>): TodoMarker {
  return block.marker ?? 'check'
}

/**
 * The item's own line for the model. `' · '` joins label and meta: a plain,
 * product-voice separator (`showing the last copy · …`) that no fixture label
 * contains — unlike ` — `, which `'Sam — final copy'` already does.
 */
const itemLine = (item: TodoItem, bullet: string) =>
  `${bullet} ${item.label}${item.meta ? ` · ${item.meta}` : ''}`

export const todoDescriptor: ModuleDescriptor<TodoBlock> = {
  type: 'todo',
  // `checklist` is this block's name in Pond's words (`Pond 03` 3a has no "todo");
  // the `/` menu also offers it as `list` at the dot marker (#219, palette.ts).
  label: 'checklist',
  schema: todoSchema,
  description:
    'A list of items. With the default marker "check" it is a checklist, each item toggleable done/undone — tasks, steps, packing lists, anything to track completion on. ' +
    'Set marker "dot" for a plain bulleted list with nothing to tick off (groceries, names, things to remember), or marker "none" for a list of links or named things with a short summary beside each. ' +
    'Each item may carry a short "meta" note shown at its right (a due date like "27 oct", or a one-line summary).',
  // The marker and every item's meta MUST reach the model here: both are
  // model-writable (they ride the emit union in `ai-composition.ts`), and
  // `serialize`'s contract is that a block the model cannot read is silently
  // destroyed on the next wholesale edit. A plain checklist with neither stays
  // byte-identical (`- [ ] label`) so no prompt or eval output moves; a `dot` /
  // `none` list is headed so it comes back a list and not a checklist, as
  // `entries` carries its `serif` flag.
  serialize: (data) => {
    switch (todoMarker(data)) {
      case 'check':
        return data.items
          .map((item) => itemLine(item, `- [${item.checked ? 'x' : ' '}]`))
          .join('\n')
      case 'dot':
        return ['List:', ...data.items.map((item) => itemLine(item, '-'))].join('\n')
      case 'none':
        return ['List (no marker):', ...data.items.map((item) => itemLine(item, '-'))].join('\n')
    }
  },
  preview: (data) => data.items.map((item) => item.label).join(', '),
  nestedIdPaths: ['items'],
}
