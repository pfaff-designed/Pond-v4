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

import { moduleDescriptors } from '@/lib/modules/registry'
import type { SlashMenuItem } from '@/components/molecules/SlashMenu'
import type { Block } from '@/lib/documents/types'

// Excludes 'page' alone — structural, not a content block a user drops into a page.
// Nothing else is withheld: the nine data-holding display blocks that used to be
// retired-but-registered are deleted outright (#111), so the registry IS the palette.
// The `view` block IS offered (#19 slice 3): a picked view defaults to a table over
// the host page's rows, so it draws honestly on a collection and shows a calm "needs
// a collection with properties" notice elsewhere (see `emptyBlockForType`).
const EXCLUDED_FROM_PALETTE = new Set<string>(['page'])

/**
 * The `/board` preset (board-authoring Slice 1). Not a distinct module type — it
 * mints a `view` block in `board` mode and seeds a Status group-by on the host page
 * (see `board-preset.ts`). Because minting is async (a schema write) and needs the
 * host page id, the insert surfaces (BlockCanvas) special-case this id rather than
 * routing it through the synchronous `emptyBlockForType`.
 */
export const BOARD_PRESET_ID = 'board'

const boardPreset: SlashMenuItem = {
  id: BOARD_PRESET_ID,
  name: 'Board',
  description:
    'A Kanban board — cards grouped into status columns. Add cards and drag them between columns; switch the same tasks to Table, Gantt, or Calendar anytime.',
}

const derivedItems: SlashMenuItem[] = Object.values(moduleDescriptors)
  .filter((d) => !EXCLUDED_FROM_PALETTE.has(d.type))
  .map((d) => ({
    id: d.type,
    name: d.type.charAt(0).toUpperCase() + d.type.slice(1).replace(/-/g, ' '),
    // Prefer the short palette label; fall back to the long AI catalog line
    // (UI-audit Slice 2 — keeps the picker terse without degrading composition).
    description: d.paletteDescription ?? d.description,
  }))

// Board leads the collection-view family, ahead of the raw `view` (table) entry.
export const paletteItems: SlashMenuItem[] = [boardPreset, ...derivedItems]

/**
 * The manual-authoring empty state per module: todo = one blank item, table = 2×2,
 * view = a table over the host page's rows, image = the upload affordance,
 * highlight = an empty passage. Returns
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
    // #19: a view defaults to a table over the host page's own rows (inline). No
    // groupBy/sort/filter yet — the user configures those (or the AI, slice 5).
    case 'view':
      return { id, type: 'view', mode: 'table' }
    // #61: empty url = the authoring state; the view renders the upload
    // affordance until a file lands.
    case 'image':
      return { id, type: 'image', url: '' }
    // #249: empty content = the authoring state; the view shows the board's empty
    // line with no wheat until a passage lands.
    case 'highlight':
      return { id, type: 'highlight', content: '' }
    default:
      return null
  }
}
