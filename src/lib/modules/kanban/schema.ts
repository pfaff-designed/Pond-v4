import { z } from 'zod'
import type { ModuleDescriptor } from '../types'

/**
 * One card on the board. Cards carry their own stable ids for targeted edits and
 * drag identity (like todo items / table rows), plus an optional one-line note.
 */
export const kanbanCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Optional one-line note shown under the card title. */
  note: z.string().optional(),
  /**
   * F27: the page this card links to. A REFERENCE to an existing page's id — not a
   * minted collection id, so the id walkers (`hydrate.ts` mint, `preview.ts` stamp)
   * leave it untouched (they only stamp the `id` key). When set, the linked page is
   * the source of truth for the card's title; `title` above is a denormalized cache
   * for fast render + AI serialize. The AI cannot author it this cycle — `pageId` is
   * stripped from the emit schema in `ai-composition.ts`.
   */
  pageId: z.string().optional(),
})

/**
 * One column (stage) of the board. Columns carry ids so a card can move between
 * them by column id, and hold their own ordered list of cards.
 */
export const kanbanColumnSchema = z.object({
  id: z.string(),
  title: z.string(),
  cards: z.array(kanbanCardSchema),
})

/**
 * A kanban board: ordered columns (stages), each holding ordered cards. The
 * primitive for a workflow with stages — a set of items that MOVE through phases
 * (backlog → doing → done). Use ONE kanban per workflow; do not model the same
 * tasks as a kanban AND a checklist (finding F4).
 *
 * Two-level nesting (columns → cards) means both levels carry minted ids. The
 * descriptor declares the deep paths `['columns', 'columns.cards']`; the shared
 * id walkers (`hydrate.ts` mint, `preview.ts` stamp) traverse them, so no per-type
 * id ladder lives outside this file.
 */
export const kanbanSchema = z.object({
  id: z.string(),
  type: z.literal('kanban'),
  /** Optional short caption shown above the board. */
  title: z.string().optional(),
  columns: z.array(kanbanColumnSchema),
})

export type KanbanCard = z.infer<typeof kanbanCardSchema>
export type KanbanColumn = z.infer<typeof kanbanColumnSchema>
export type KanbanBlock = z.infer<typeof kanbanSchema>

/**
 * The empty starting board for MANUAL creation (t37): three columns
 * To do / Doing / Done, no cards. Ids are minted here so the block is immediately
 * persistable when a user drops a kanban into a page. AI-created boards do NOT go
 * through this — the model emits id-less data hydrated by `hydrateBlock`.
 */
export function emptyKanban(id: string, mintId: () => string): KanbanBlock {
  return {
    id,
    type: 'kanban',
    columns: [
      { id: mintId(), title: 'To do', cards: [] },
      { id: mintId(), title: 'Doing', cards: [] },
      { id: mintId(), title: 'Done', cards: [] },
    ],
  }
}

export const kanbanDescriptor: ModuleDescriptor<KanbanBlock> = {
  type: 'kanban',
  schema: kanbanSchema,
  description:
    'A kanban board: named columns (stages) each holding cards that move between them. Use for a workflow whose items advance through stages — a backlog moving to in-progress to done, a hiring pipeline, an editorial queue. Use ONE kanban per workflow: do NOT also model the same items as a checklist (a card IS the task, tracked by which column it sits in). Prefer a checklist over a kanban when items are simply done/undone with no stages.',
  // Honest text: per-column counts and every card title (+ note), so a wholesale
  // edit re-emits what it can see — a card the model cannot read here is destroyed.
  serialize: (data) => {
    const head = data.title ? `${data.title} — ` : ''
    const cols = data.columns.map((col) => {
      const cards = col.cards.map((c) => (c.note ? `${c.title} (${c.note})` : c.title)).join(', ')
      return `${col.title} (${col.cards.length}): ${cards || '—'}`
    })
    return `${head}${cols.join(' | ')}`
  },
  // Shorter line for the id-addressed editable-blocks context: just column counts.
  preview: (data) => data.columns.map((col) => `${col.title} ${col.cards.length}`).join(' · '),
  nestedIdPaths: ['columns', 'columns.cards'],
}
