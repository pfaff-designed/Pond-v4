/**
 * The block palette — the ONE authoring vocabulary shared by every insertion
 * surface (ticket-37, extended ticket-44).
 *
 * `paletteItems` is derived live from the module registry: every registered
 * content module's type + when-to-use description, the same catalog the AI
 * composes from. A module added by another ticket appears here at merge with zero
 * edits — the registry is the single source, never a hardcoded list. `page` is
 * excluded (structural, not a content block a user drops in).
 *
 * `emptyBlockForType` mints a module's empty authoring state (ticket-37/t38). It
 * returns null for a type with no local factory (an unknown module from a
 * not-yet-merged branch), so a palette pick degrades to a no-op, never a crash.
 *
 * Extracted from DocumentPanel so the Life home surface, area pages, and document
 * pages all open the SAME palette and insert the SAME empty states (ticket-44).
 */

import { emptyKanban } from '@/lib/modules/kanban/schema'
import { moduleDescriptors, RETIRED_FROM_CREATION } from '@/lib/modules/registry'
import type { SlashMenuItem } from '@/components/molecules/SlashMenu'
import type { Block } from '@/lib/documents/types'

// Excludes 'page' (structural, not a content block a user drops into a page) and
// every RETIRED_FROM_CREATION type — currently `kanban` (#19 slice 6): the standalone
// kanban block is retired from creation (superseded by the `view` block's board mode
// over a collection), so it is no longer offered here, though its descriptor and
// renderer stay in the registry for read-tolerance of already-persisted kanban blocks.
// The `view` block IS offered now (#19 slice 3): a picked view defaults to a table over
// the host page's rows, so it draws honestly on a collection and shows a calm "needs
// a collection with properties" notice elsewhere (see `emptyBlockForType`).
const EXCLUDED_FROM_PALETTE = new Set<string>(['page', ...RETIRED_FROM_CREATION])

export const paletteItems: SlashMenuItem[] = Object.values(moduleDescriptors)
  .filter((d) => !EXCLUDED_FROM_PALETTE.has(d.type))
  .map((d) => ({
    id: d.type,
    name: d.type.charAt(0).toUpperCase() + d.type.slice(1).replace(/-/g, ' '),
    description: d.description,
  }))

/**
 * The manual-authoring empty state per module: todo = one blank item, table =
 * 2×2, metric = manual 0, kanban = its schema default, charts = no-data. Returns
 * null for a type with no local empty state — callers must guard null.
 */
export function emptyBlockForType(type: string): Block | null {
  const id = crypto.randomUUID()
  switch (type) {
    case 'text':
      return { id, type: 'text', content: '' }
    case 'todo':
      return {
        id,
        type: 'todo',
        items: [{ id: crypto.randomUUID(), label: '', checked: false }],
      }
    case 'table':
      return {
        id,
        type: 'table',
        columns: ['Column 1', 'Column 2'],
        rows: [
          { id: crypto.randomUUID(), cells: ['', ''] },
          { id: crypto.randomUUID(), cells: ['', ''] },
        ],
      }
    case 'metric':
      return { id, type: 'metric', label: '', value: 0 }
    case 'metric-ring':
      return { id, type: 'metric-ring', label: '', pct: 0 }
    // Wave-2 modules (t35/t36), wired so a palette pick never no-ops.
    case 'kanban':
      return emptyKanban(id, () => crypto.randomUUID())
    // #19: a view defaults to a table over the host page's own rows (inline). No
    // groupBy/sort/filter yet — the user configures those (or the AI, slice 5).
    case 'view':
      return { id, type: 'view', mode: 'table' }
    case 'chart-line':
    case 'chart-bar':
    case 'chart-area':
      // ChartCard renders a calm "No data yet" for an empty points array.
      return { id, type, title: '', points: [] }
    // #12: Bklit promotion, wave 2 — same calm-empty / zero-value starts.
    case 'heatmap':
      return { id, type: 'heatmap', title: '', cells: [] }
    case 'stat':
      return { id, type: 'stat', label: '', value: 0 }
    // #11: standalone timeline (Gantt) — a calm-empty start, like the charts.
    case 'timeline':
      return { id, type: 'timeline', title: '', items: [] }
    default:
      return null
  }
}
