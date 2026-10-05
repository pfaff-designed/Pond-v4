/**
 * FEATURE — the shell's happy paths, end to end (`Pond 05 Shell`).
 *
 * Four paths, driven through the real engine the shell is built from — the
 * `['pages']` cache the rail / breadcrumb / palette all read, the pure tree and
 * trail logic, the deferred-commit undo window, and the persistence layer — and
 * asserted on what a PERSON ends up with: the address they land on, the blocks
 * they see, the trail above them, and what is written in the database.
 *
 *   1. opening a page from the rail            → address + blocks + breadcrumb
 *   2. create / rename / delete, nested        → persisted, with undo on delete
 *   3. drag to reorder and to reparent         → the rail and the rows agree
 *   4. ⌘K searches and jumps to a page         → the row found, the address pushed
 *
 * The rail's APPEARANCE, its ARIA tree contract and its keyboard machine are
 * `Rail.stories.tsx` now; nothing here renders. Rename has no rail affordance
 * (no `onRename` exists) — the one rename path is `updateTitle`, which the page
 * title drives, so that is what is exercised.
 *
 * Persistence is the shared `helpers/fake-supabase` harness, asserted via its
 * `_pages` map. That harness covers select / insert / delete; the move path
 * writes with `.update(…).eq(…)`, the one verb it lacks, so {@link withUpdate}
 * adds it over the SAME map rather than forking a second fake.
 */

import { QueryClient } from '@tanstack/react-query'

import { createPage, deletePage, getPage, movePage, updateTitle } from '@/lib/pages/client'
import { crumbTrail } from '@/lib/pages/crumbs'
import { DuplicateTitleError } from '@/lib/pages/dedupe-title'
import { pagesKey } from '@/lib/pages/keys'
import { workspaceUrl } from '@/lib/pages/nav'
import { paletteItems, paletteScope } from '@/lib/pages/palette-items'
import { applyMoveOptimistic, insertPageOptimistic, type PageRow } from '@/lib/pages/tree'
import { paletteEntries } from '@/components/molecules/palette-entries'
import { countDescendants, needsConfirm, subtreeIds } from '@/lib/deletion/blast-radius'
import {
  GRACE_WINDOW_MS,
  performUndo,
  scheduleDeferredCommit,
} from '@/lib/deletion/deferred-commit'
import { removeRow, restoreRow } from '@/lib/deletion/row-cache'
import {
  LIFE_ID,
  buildTree,
  computeMove,
  flattenVisible,
  type DropZone,
  type RailNode,
} from '@/lib/rail/tree'
import { makeFakeSupabase, type Row } from './helpers/fake-supabase'

// ── The pond ────────────────────────────────────────────────────────────────

const POND = 'p-life'
const USER = 'user-1'

/**
 *     life
 *       Health            Notes          databases
 *         Sleep                            Ingredients
 *         Marathon
 */
const SEED = [
  { id: 'health', parent: null, title: 'Health', order: 0 },
  { id: 'notes', parent: null, title: 'Notes', order: 1 },
  { id: 'databases', parent: null, title: 'databases', order: 2 },
  { id: 'sleep', parent: 'health', title: 'Sleep', order: 0 },
  { id: 'marathon', parent: 'health', title: 'Marathon', order: 1 },
  { id: 'ingredients', parent: 'databases', title: 'Ingredients', order: 0 },
] as const

type Seeded = (typeof SEED)[number]

/** A `pages` row, each page carrying one block so "shows its blocks" has a subject. */
const dbRow = (s: Seeded): Row => ({
  id: s.id,
  user_id: USER,
  pond_id: POND,
  parent_id: s.parent,
  type: 'page',
  title: s.title,
  blocks: [{ id: `${s.id}-b1`, type: 'text', content: s.title }],
  props: {},
  order: s.order,
})

/** What `fetchPages` hands the rail, the breadcrumb and the palette. */
const treeRow = (s: Seeded): PageRow => ({
  id: s.id,
  parent_id: s.parent,
  type: 'page',
  title: s.title,
  order: s.order,
  updated_at: '2026-10-04T00:00:00Z',
})

/**
 * The shared harness plus `.update(…).eq(…)` — the verb `movePage` and
 * `updateTitle` write through — over the same `_pages` map.
 */
function withUpdate(fake: ReturnType<typeof makeFakeSupabase>) {
  return {
    ...fake,
    from: () => {
      const base = fake.from()
      return Object.assign(base, {
        update(patch: Record<string, unknown>) {
          const filters: Array<(r: Row) => boolean> = []
          const chain = {
            eq(col: string, val: unknown) {
              filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val)
              return chain
            },
            then(resolve: (v: { data: null; error: null }) => unknown) {
              for (const r of fake._pages.values()) {
                if (filters.every((f) => f(r))) Object.assign(r, patch)
              }
              return Promise.resolve({ data: null, error: null }).then(resolve)
            },
          }
          return chain
        },
      })
    },
  }
}

type Shell = ReturnType<typeof shell>

function shell() {
  const sb = withUpdate(makeFakeSupabase(SEED.map(dbRow)))
  const qc = new QueryClient()
  qc.setQueryData(pagesKey(POND), SEED.map(treeRow))
  return { sb, qc }
}

const cached = (qc: QueryClient) => qc.getQueryData<PageRow[]>(pagesKey(POND)) ?? []

/** The child ids of a group as the RAIL draws them, from the cache it reads. */
function railGroup(qc: QueryClient, parentId: string | null): string[] {
  const roots = buildTree(cached(qc))
  if (parentId === null) return roots.map((n) => n.id)
  const find = (nodes: RailNode[]): RailNode | undefined => {
    for (const n of nodes) {
      if (n.id === parentId) return n
      const hit = find(n.children)
      if (hit) return hit
    }
    return undefined
  }
  return (find(roots)?.children ?? []).map((n) => n.id)
}

/** The child ids of a group as the DATABASE holds them. */
const persistedGroup = (sb: Shell['sb'], parentId: string | null): string[] =>
  [...sb._pages.values()]
    .filter((r) => (r.parent_id ?? null) === parentId)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .map((r) => r.id)

/** Every row's placement, for "nothing was written". */
const placements = (sb: Shell['sb']): string[] =>
  [...sb._pages.values()].map((r) => `${r.id}:${r.parent_id}:${r.order}`).sort()

const nodeRef = (id: string) => {
  const s = SEED.find((r) => r.id === id)!
  return { id: s.id, type: 'page', title: s.title }
}

/** jsdom's address is the ambient pond every `workspaceUrl` reads. */
beforeEach(() => {
  window.history.replaceState({}, '', `/workspace?pond=${POND}`)
})

// ── 1. Opening a page from the rail ─────────────────────────────────────────

describe('opening a page from the rail', () => {
  test.each([
    { id: 'sleep', root: null, crumbs: ['Health'] },
    { id: 'ingredients', root: 'databases', crumbs: [] },
    { id: 'health', root: null, crumbs: [] },
  ])('$id lands on its own address, blocks and trail', async ({ id, root, crumbs }) => {
    const { sb, qc } = shell()
    const node = nodeRef(id)

    // The rail pushes one address, and it keeps the pond you are in.
    expect(workspaceUrl(node)).toBe(
      `/workspace?nodeType=page&nodeId=${id}&nodeName=${encodeURIComponent(node.title)}&pond=${POND}`
    )

    // The surface there shows that page's own blocks.
    const opened = await getPage(sb as never, id)
    expect(opened?.blocks).toEqual([{ id: `${id}-b1`, type: 'text', content: node.title }])

    // And the breadcrumb trails it from the root it actually descends from —
    // `databases` is life's PEER, so a database never reads as being inside life.
    const trail = crumbTrail(cached(qc), id)
    expect(trail.root?.title ?? null).toBe(root)
    expect(trail.crumbs.map((c) => c.title)).toEqual(crumbs)
  })
})

// ── 2. Create / rename / delete, nested ─────────────────────────────────────

describe('rail create, rename and delete', () => {
  it('＋ on a row creates a child under it, shown nested before the refetch lands', async () => {
    const { sb, qc } = shell()

    const created = await createPage(sb as never, USER, {
      parentId: 'health',
      type: 'page',
      title: 'Untitled',
      pondId: POND,
    })

    // Written under the row that was clicked, in this pond — not at the root and
    // not pond-less (either would strand the page where it cannot be found).
    expect(sb._pages.get(created.id)).toMatchObject({
      parent_id: 'health',
      pond_id: POND,
      title: 'Untitled',
    })

    // F26: the rail nests it immediately, rather than showing it at the root
    // until a refetch arrives.
    insertPageOptimistic(
      qc,
      { id: created.id, parentId: 'health', type: 'page', title: 'Untitled' },
      POND
    )
    const visible = flattenVisible(buildTree(cached(qc)), new Set(['health']), true, 'life')
    expect(visible.find((r) => r.id === created.id)?.depth).toBe(2)
    // Nested under the clicked row, beside its siblings — the placeholder `order`
    // the refetch reconciles is why the position, not the parent, is left open.
    expect(railGroup(qc, 'health')).toEqual(
      expect.arrayContaining(['sleep', 'marathon', created.id])
    )
    expect(railGroup(qc, null)).not.toContain(created.id)
  })

  test.each([
    { name: 'a free name is taken', title: 'Rest', kept: 'Rest' },
    { name: "a sibling's name is refused", title: 'Marathon', kept: 'Sleep' },
  ])('renaming: $name', async ({ title, kept }) => {
    const { sb } = shell()
    const rename = updateTitle(sb as never, 'sleep', title)

    if (kept === title) await expect(rename).resolves.toBeUndefined()
    else await expect(rename).rejects.toThrow(DuplicateTitleError)

    expect(sb._pages.get('sleep')?.title).toBe(kept)
  })

  test.each([
    { name: 'undo inside the window keeps the page', undo: true },
    { name: 'the window elapsing deletes it', undo: false },
  ])('deleting a leaf: $name', async ({ undo }) => {
    const { sb, qc } = shell()
    const row = cached(qc).find((r) => r.id === 'sleep')!

    // The rail drops the row at once; the destructive write waits out the window.
    qc.setQueryData<PageRow[]>(pagesKey(POND), (rows) => removeRow(rows ?? [], 'sleep'))
    let elapse: (() => void) | null = null
    const controller = scheduleDeferredCommit({
      commit: () => deletePage(sb as never, 'sleep'),
      graceMs: GRACE_WINDOW_MS,
      setTimer: (fn) => {
        elapse = fn
        return 0 as unknown as ReturnType<typeof setTimeout>
      },
      clearTimer: () => {
        elapse = null
      },
    })
    expect(railGroup(qc, 'health')).toEqual(['marathon'])
    expect(sb._pages.has('sleep')).toBe(true)

    if (undo) {
      const restored = performUndo(controller, () => {
        qc.setQueryData<PageRow[]>(pagesKey(POND), (rows) => restoreRow(rows ?? [], row))
      })
      expect(restored).toBe(true)
      expect(elapse).toBeNull() // the write was cancelled, not merely hidden
    } else {
      await (elapse as unknown as () => void | Promise<void>)()
    }

    expect(sb._pages.has('sleep')).toBe(undo)
    expect(railGroup(qc, 'health')).toEqual(undo ? ['sleep', 'marathon'] : ['marathon'])
  })

  it('deleting a row with pages inside confirms the blast radius, then takes the whole subtree', async () => {
    const { sb, qc } = shell()
    const health = buildTree(cached(qc)).find((n) => n.id === 'health')!

    // A subtree delete is NOT the undo-toast path — it is gated by the confirm,
    // which names the real count.
    expect(countDescendants(health)).toBe(2)
    expect(needsConfirm(countDescendants(health))).toBe(true)

    await deletePage(sb as never, 'health')

    // The FK cascade is what removes the descendants; if it ever stopped, the
    // children would survive as unreachable orphans with nothing going red.
    expect([...sb._pages.keys()].sort()).toEqual(['databases', 'ingredients', 'notes'])
    // …and the open page inside that subtree is what sends you back to the root.
    expect(subtreeIds(health).has('sleep')).toBe(true)
  })
})

// ── 3. Drag to reorder and to reparent ──────────────────────────────────────

describe('dragging a rail row', () => {
  test.each<{
    name: string
    dragged: string
    target: string
    zone: DropZone
    parent: string | null
    group: string[]
  }>([
    {
      name: 'reorders within a group',
      dragged: 'marathon',
      target: 'sleep',
      zone: 'before',
      parent: 'health',
      group: ['marathon', 'sleep'],
    },
    {
      name: 'reparents into a leaf, which becomes a folder',
      dragged: 'notes',
      target: 'sleep',
      zone: 'into',
      parent: 'sleep',
      group: ['notes'],
    },
    {
      name: 'reparents out to the top level, appended after the areas',
      dragged: 'sleep',
      target: LIFE_ID,
      zone: 'into',
      parent: null,
      group: ['health', 'notes', 'databases', 'sleep'],
    },
    {
      name: 'reparents as a sibling, landing in the dropped position',
      dragged: 'ingredients',
      target: 'notes',
      zone: 'after',
      parent: null,
      group: ['health', 'notes', 'ingredients', 'databases'],
    },
  ])('$name', async ({ dragged, target, zone, parent, group }) => {
    const { sb, qc } = shell()
    const move = computeMove(cached(qc), dragged, target, zone)!
    expect(move.newParentId).toBe(parent)

    applyMoveOptimistic(
      qc,
      { movedId: dragged, newParentId: move.newParentId, siblingOrder: move.siblingOrder },
      POND
    )
    await movePage(sb as never, {
      id: dragged,
      newParentId: move.newParentId,
      siblingOrder: move.siblingOrder,
    })

    // What persists, and what the rail draws, are the same list — a divergence
    // here reads as a drop that "worked" and comes back undone on reload.
    expect(persistedGroup(sb, parent)).toEqual(group)
    expect(railGroup(qc, parent)).toEqual(group)
    expect(sb._pages.get(dragged)?.parent_id).toBe(parent)
    // Densely reindexed, which also repairs the legacy all-zeros `order`.
    expect(group.map((id) => sb._pages.get(id)?.order)).toEqual(group.map((_, i) => i))
  })

  test.each<{ name: string; dragged: string; target: string; zone: DropZone }>([
    { name: 'into its own subtree (a cycle)', dragged: 'health', target: 'sleep', zone: 'into' },
    { name: 'onto itself', dragged: 'sleep', target: 'sleep', zone: 'into' },
    { name: 'back where it already is', dragged: 'sleep', target: 'marathon', zone: 'before' },
    {
      name: 'beside the root, which is into-only',
      dragged: 'sleep',
      target: LIFE_ID,
      zone: 'after',
    },
  ])('a drop $name writes nothing', async ({ dragged, target, zone }) => {
    const { sb, qc } = shell()
    const before = placements(sb)

    expect(computeMove(cached(qc), dragged, target, zone)).toBeNull()

    expect(placements(sb)).toEqual(before)
    expect(railGroup(qc, null)).toEqual(['health', 'notes', 'databases'])
    expect(railGroup(qc, 'health')).toEqual(['sleep', 'marathon'])
  })
})

// ── 4. The ⌘K palette ───────────────────────────────────────────────────────

describe('the ⌘K palette', () => {
  test.each([
    { query: 'marat', id: 'marathon', kind: 'page', sub: 'Health' },
    { query: 'ingred', id: 'ingredients', kind: 'database', sub: 'databases' },
  ])('typing “$query” finds $id and ↵ jumps to it', ({ query, id, kind, sub }) => {
    const { qc } = shell()
    const items = paletteItems(cached(qc), ['notes'])

    // With nothing typed the recents lead, so the last page you opened is one ↵ away.
    const opened = paletteEntries(items, '', { pondName: 'life', parentTitle: 'life' })
    expect(opened[0]).toEqual({ kind: 'group', label: 'recent' })
    expect(opened[1]).toMatchObject({ kind: 'row', item: { id: 'notes' } })

    const rows = paletteEntries(items, query, { pondName: 'life', parentTitle: 'life' }).filter(
      (e) => e.kind === 'row'
    )
    const hit = rows[0]
    expect(hit).toMatchObject({ kind: 'row', item: { id, kind }, sub })

    // ↵ on it pushes the one address a rail click would, pond and all.
    const page = cached(qc).find((r) => r.id === id)!
    expect(workspaceUrl({ id: page.id, type: page.type, title: page.title })).toBe(
      `/workspace?nodeType=page&nodeId=${id}&nodeName=${encodeURIComponent(page.title)}&pond=${POND}`
    )
  })

  it('opening it on a page with children scopes the search to that page and its own', () => {
    const { qc } = shell()
    const items = paletteItems(cached(qc), [])

    expect(paletteScope(cached(qc), 'health')).toEqual({ id: 'health', label: 'Health' })
    // A leaf has nothing under it, so the palette opens whole rather than empty.
    expect(paletteScope(cached(qc), 'sleep')).toBeNull()

    const scoped = paletteEntries(items, '', {
      scope: { id: 'health', label: 'Health' },
      pondName: 'life',
    })
    expect(
      scoped
        .filter((e) => e.kind === 'row')
        .map((e) => e.item.id)
        .sort()
    ).toEqual(['health', 'marathon', 'sleep'])
  })
})
