'use client'

/**
 * The shared overview surface, data-driven: kicker header, one focal numeral, a card
 * per child page, a closing serif exhale. Used for both an area page and the Life
 * root (slice 5); the callers derive the model from real ['pages'] rows via
 * lib/pages/overview. The LAYOUT still descends from the superseded "v85 Clearing"
 * aesthetic and needs resolving against `Pond 05 Shell` — a separate issue.
 *
 * Deliberately structural: no Pond note, no AI synthesis — that's a named
 * follow-up with its own grill.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { KindDot } from '@/components/atoms/PondAtom'
import { updateTitle } from '@/lib/pages/client'
import { commitBlocks } from '@/lib/pages/commit'
import { getOrCreateHomePage } from '@/lib/pages/home'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import type { Block } from '@/lib/documents/types'
import { FocalNumeral } from '@/components/molecules/FocalNumeral'
import { ChildrenGrid, ChildrenGridLabel } from '@/components/molecules/ChildrenGrid'
import { Breadcrumb } from '@/components/molecules/Breadcrumb'
import { requestCommandPalette } from '@/lib/shell-commands'
import { ShellBreadcrumb } from '@/lib/layout/breadcrumb-slot'
import { useSurfaceColumn } from '@/lib/layout/surface-column'
import {
  areaOverview,
  lifeOverview,
  crumbTrail,
  type Crumb,
  type OverviewCardModel,
  type OverviewModel,
} from '@/lib/pages/overview'
import { fetchPages } from '@/lib/pages/tree'
import { useWorkspace } from '@/lib/workspace/context'
import { workspaceUrl, workspaceBasePath } from '@/lib/pages/nav'
import { markIndex, resolveMark } from '@/lib/pages/mark'
import { areaRoleColor } from '@/lib/rail/glyph-library'
import { CrumbMark, PageMarkButton } from '@/components/organisms/PageMarkButton'
import { SlashMenu, type SlashMenuItem } from '@/components/molecules/SlashMenu'
import { paletteItems } from '@/lib/modules/palette'

/** Staggered rise-on-mount wrapper. index drives the delay. */
function Rise({
  i,
  className = '',
  children,
}: {
  i: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`mn-rise ${className}`} style={{ animationDelay: `${i * 70}ms` }}>
      {children}
    </div>
  )
}

/**
 * The kicker — the current node's name at the tail of the breadcrumb pill.
 * Static text when read-only; an inline click-to-rename field when `onRename`
 * is supplied (ticket-26), styled as the crumb it replaces so a renamed area
 * reads the same resting as a static one. Enter commits + blurs; Escape
 * reverts; blur commits.
 */
function EditableKicker({
  value,
  onRename,
}: {
  value: string
  onRename?: (title: string) => void
}) {
  // #96: the kicker is the breadcrumb pill's editable tail (2t: the current
  // crumb in full ink, sans 500 / 11, .04em) — one voice with the crumbs.
  const kickerClass = 'font-sans text-mn-11 font-medium tracking-[0.04em] text-foreground'
  const [draft, setDraft] = useState(value)
  // Escape blurs to end the edit, and blur normally commits — but an Escape
  // blur must NOT commit (the whole point is to revert). The blur event fires
  // synchronously inside the keydown handler, before React re-renders, so the
  // blur-commit would otherwise read the STALE edited draft from its closure
  // and perform the rename Escape meant to cancel. This ref flags that one
  // blur as a revert.
  const reverting = useRef(false)

  if (!onRename) {
    return <span className={kickerClass}>{value}</span>
  }
  const rename = onRename

  function commit() {
    if (reverting.current) {
      reverting.current = false
      return
    }
    const next = draft.trim()
    // Only persist a genuine change; an empty title is refused (revert to value).
    if (next && next !== value) rename(next)
    else setDraft(value)
  }

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          reverting.current = true
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
      aria-label="Rename page"
      className={`${kickerClass} bg-transparent outline-none rounded-sm px-1 -mx-1 min-w-[6ch] hover:bg-mn-wash focus:bg-mn-wash focus:text-mn-text-meta transition-colors`}
    />
  )
}

/**
 * The palette-first "+ Add content" affordance for a pure area (ticket-44 §2).
 * Opens the block palette directly (not a text block); the pick flows to the
 * caller, which inserts that module's empty state and flips to the composite
 * editor. Anchored below the button so the picker grows in place.
 */
function AddContentButton({ onAddContent }: { onAddContent: (item: SlashMenuItem) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-mn-13 font-medium text-mn-text-secondary hover:text-foreground border-b border-transparent hover:border-border transition-colors whitespace-nowrap"
      >
        + Add content
      </button>
      {open && (
        <SlashMenu
          items={paletteItems}
          onSelect={(item) => {
            onAddContent(item)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
          className="absolute right-0 top-full z-10 mt-1 w-72"
        />
      )}
    </div>
  )
}

export interface OverviewSurfaceProps {
  /** Micro-label above the numeral, e.g. the page title or "Life". */
  kicker: string
  /**
   * When set, the kicker becomes an inline click-to-rename field (ticket-26):
   * a page must be renamable from every surface it renders as, and an area's
   * overview is one such surface. Called with the committed new title on blur or
   * Enter; a no-op change is ignored by the caller. Omit for non-renamable
   * surfaces (the Life root), which keep a static label.
   */
  onRenameKicker?: (title: string) => void
  /** Muted accent for the kicker dot (an area's hue); omit for Life. */
  accent?: string
  /**
   * The kicker's mark (#134) — a connected `PageMarkButton`, so the glyph can be
   * clicked and changed. When omitted the accent square stays, which is what an
   * unmapped page has always shown.
   */
  markSlot?: React.ReactNode
  /** The breadcrumb's lead mark (#134) — the top-level crumb's. */
  leadMark?: React.ReactNode
  /**
   * The breadcrumb trail (ticket-25). When `onNavigateCrumb` is set the header
   * renders a clickable Breadcrumb (life › … › current) in place of the bare
   * kicker label: `crumbs` are the ancestors, `kicker` doubles as the current
   * node's title tail (for Life, pass an empty `crumbs` — the trail reads just
   * "life"). Omit `onNavigateCrumb` to keep the plain kicker (Storybook).
   */
  crumbs?: Crumb[]
  /** The trail's root when it is a real page — see Breadcrumb's `root` (#101). */
  root?: Crumb | null
  onNavigateCrumb?: (crumb: Crumb | null) => void
  /** The current node's title in the trail; when omitted, `kicker` is used. */
  current?: string
  model: OverviewModel
  /** The closing serif line, e.g. "That's Health at a glance…". */
  closing: string
  onOpenCard: (card: OverviewCardModel) => void
  /**
   * The quiet "+ Add content" affordance. Present when this node could hold its
   * own blocks but has none yet (a pure area/container). Palette-first (ticket-44
   * §2): clicking opens the block palette; picking a module hands the item back
   * here, and the caller inserts that module's empty state — flipping the node to
   * the composite editor+children surface (ticket-22).
   */
  onAddContent?: (item: SlashMenuItem) => void
  /**
   * The Life home page's own editable blocks (ticket-44 §1), rendered BETWEEN the
   * focal numeral and the areas grid so Life reads as a real page: its content
   * above, its areas below. Only the Life root passes this; area/document surfaces
   * omit it. The slot already carries its own always-visible "+ Add a block".
   */
  homeCanvas?: React.ReactNode
}

export function OverviewSurface({
  kicker,
  onRenameKicker,
  accent,
  markSlot,
  leadMark,
  crumbs,
  root,
  onNavigateCrumb,
  current,
  model,
  closing,
  onOpenCard,
  onAddContent,
  homeCanvas,
}: OverviewSurfaceProps) {
  let ri = 0
  const showBreadcrumb = !!onNavigateCrumb
  // #96: the column's insets — 76 under the floating pill, the composer's
  // published clearance below — shared with the editor (lib/layout/surface-column).
  const { column } = useSurfaceColumn(720)
  // The pill cluster: the current node's mark beside the trail (#134), then the
  // trail itself — with the current node as the tail; when the surface supports
  // rename (ticket-26) the tail is the EditableKicker instead of the static
  // current label. Keyed on value so an external rename (rail/AI) re-seeds the
  // draft. Without a trail (Storybook) the kicker stands alone.
  const pillCluster = (
    <div className="flex items-center justify-center gap-2 min-w-0">
      {markSlot ?? (accent && <KindDot accent={accent} />)}
      {showBreadcrumb ? (
        onRenameKicker ? (
          <Breadcrumb
            crumbs={crumbs ?? []}
            root={root}
            onNavigate={onNavigateCrumb}
            leadMark={leadMark}
            tail={<EditableKicker key={kicker} value={kicker} onRename={onRenameKicker} />}
            onCommandK={requestCommandPalette}
          />
        ) : (
          <Breadcrumb
            crumbs={crumbs ?? []}
            root={root}
            onNavigate={onNavigateCrumb}
            current={current}
            leadMark={leadMark}
            onCommandK={requestCommandPalette}
          />
        )
      ) : (
        <EditableKicker key={kicker} value={kicker} onRename={onRenameKicker} />
      )}
    </div>
  )
  return (
    <div className="h-full overflow-y-auto font-sans">
      <div {...column}>
        {/* The pill is a SHELL-level absolute (2t / `Pond 05 Shell`): it portals
            into the shell's slot and the page scrolls under it. Rendered alone it
            falls back into the header row below. */}
        <ShellBreadcrumb>{pillCluster}</ShellBreadcrumb>
        {/* ── Header row: "+ Add content" at the right (and, rendered alone, the
            pill cluster centred) ─────────────────────────────────────────────── */}
        <Rise i={ri++} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <span aria-hidden />
          <span aria-hidden />
          <div className="flex items-center justify-end gap-4">
            {onAddContent && <AddContentButton onAddContent={onAddContent} />}
          </div>
        </Rise>

        {/* ── Focal numeral + caption ─────────────────────────────────────── */}
        <Rise i={ri++} className="mt-7 mb-1.5">
          <FocalNumeral value={model.focal} caption={model.focalCaption} />
        </Rise>

        {/* ── Life home blocks (ticket-44 §1): the Life root's own content, above
            its areas. Its own always-visible "+ Add a block" lives inside. Only
            Life passes homeCanvas; area/document surfaces omit it. ────────────── */}
        {homeCanvas && (
          <Rise i={ri++} className="mt-10">
            {homeCanvas}
          </Rise>
        )}

        {/* ── Everything within — a card per child page ───────────────────── */}
        {model.cards.length > 0 && (
          <div className="mt-11">
            <Rise i={ri++}>
              <ChildrenGridLabel />
            </Rise>
            <ChildrenGrid
              cards={model.cards}
              onOpenCard={onOpenCard}
              label={false}
              cell={(_card, node) => <Rise i={ri++}>{node}</Rise>}
            />
          </div>
        )}

        {/* ── Closing serif exhale ────────────────────────────────────────── */}
        <Rise i={ri++} className="mt-12">
          <div className="border-t border-mn-hair pt-5">
            <span className="font-serif font-extralight italic text-mn-16 leading-[1.75] text-mn-text-secondary">
              {closing}
            </span>
          </div>
        </Rise>
      </div>
    </div>
  )
}

/** Card → workspace navigation shared by the overview containers and the
 * composite content+children surface (ticket-22). */
export function useOpenCard() {
  const router = useRouter()
  const workspace = useWorkspace()
  const basePath = workspaceBasePath(workspace)
  return function openCard(card: OverviewCardModel) {
    router.push(workspaceUrl(card, basePath))
  }
}

/**
 * Breadcrumb → workspace navigation (ticket-25). A `null` crumb goes to the
 * Life root; a crumb carries its own type/title, so the URL gets the same
 * params a rail click would (via the shared workspaceUrl). Shared by the
 * overview and editor headers so the trail always lands on the real surface.
 */
export function useNavigateCrumb() {
  const router = useRouter()
  const workspace = useWorkspace()
  const basePath = workspaceBasePath(workspace)
  return function navigate(crumb: Crumb | null) {
    router.push(workspaceUrl(crumb, basePath))
  }
}

// ── Area container ───────────────────────────────────────────────────────────

/**
 * The overview for one area page, derived from the same ['pages'] rows the
 * rail reads. Cards navigate the workspace; "ask Pond" focuses the terminal.
 * Rendered only for an area with NO blocks of its own — an area with blocks gets
 * the composite editor+children surface in DocumentPanel instead (ticket-22);
 * the "+ Add content" affordance is the bridge from this surface to that one.
 */
export function AreaOverviewPanel({
  areaId,
  title,
  onAddContent,
}: {
  areaId: string
  title: string
  /** When set, the surface offers a palette-first "+ Add content" affordance
   *  (ticket-22/ticket-44); the pick is the module to insert. */
  onAddContent?: (item: SlashMenuItem) => void
}) {
  const openCard = useOpenCard()
  const queryClient = useQueryClient()
  const workspace = useWorkspace()
  const { data: rows = [] } = useQuery({
    queryKey: ['pages', workspace],
    queryFn: () => fetchPages(workspace),
  })
  const navigateCrumb = useNavigateCrumb()

  const model = useMemo(() => areaOverview(rows, areaId, new Date()), [rows, areaId])
  // #134: the mark resolves through the inheritance rule, and its colour is a
  // theme ROLE — `pageAccent`'s Press six no longer tint any mark.
  const mark = useMemo(() => resolveMark(areaId, markIndex(rows)), [rows, areaId])
  const accent = areaRoleColor(mark.role)
  // #101 review: the trail starts at the root this area descends from — a database
  // under `databases` reads "databases › …", never "life › databases › …" (3c).
  const trail = useMemo(() => crumbTrail(rows, areaId), [rows, areaId])
  // When this page IS the root its own trail names — the reserved `databases` root
  // (3c) — the root crumb already says where you are, so the pill carries NO tail
  // (it would read "databases › databases") and offers no rename: that title is
  // what `isDatabasesRoot` reads, and renaming it would orphan the root.
  const isTrailRoot = trail.root?.id === areaId

  // Rename from the overview surface (ticket-26): same updateTitle path the
  // editor uses, then invalidate ['pages'] so the rail label updates and
  // ['page'] so the editor title stays in step if it opens this page next.
  async function handleRename(next: string) {
    const supabase = createClient()
    await updateTitle(supabase, areaId, next)
    await queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
    await queryClient.invalidateQueries({ queryKey: ['page', areaId] })
  }

  const name = title || 'Untitled'
  return (
    <OverviewSurface
      kicker={name}
      onRenameKicker={isTrailRoot ? undefined : handleRename}
      accent={accent}
      markSlot={<PageMarkButton pageId={areaId} pageTitle={name} mark={mark} size={12} />}
      leadMark={<CrumbMark rows={rows} crumbs={trail.crumbs} />}
      {...trail}
      onNavigateCrumb={navigateCrumb}
      current={isTrailRoot ? undefined : name}
      model={model}
      closing={`That’s ${name} at a glance. Open any of it, or ask.`}
      onOpenCard={openCard}
      onAddContent={onAddContent}
    />
  )
}

// ── Life container ───────────────────────────────────────────────────────────

/**
 * The Life/home overview at the workspace root — now a REAL home page that holds
 * its own blocks (ticket-44 §1). Composite: Life's own blocks (the full
 * <BlockCanvas> editor) render BETWEEN the focal numeral and the areas grid, so
 * Life reads as a page with content above and its areas below. An empty Life
 * shows just the overview + the always-visible "+ Add a block" (inside the
 * canvas). Pond composes Life's blocks through the normal propose_changes gate —
 * the home row is a real page in the workspace outline, reached by targetPageId.
 *
 * Structural counts still exclude the home row (fetchPages strips it), so Life's
 * own blocks never inflate the areas overview and the home row is never a rail
 * child. The "Across your life" AI synthesis remains a deferred follow-up.
 */
export function LifeOverviewPanel() {
  const openCard = useOpenCard()
  const workspace = useWorkspace()
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['pages', workspace],
    queryFn: () => fetchPages(workspace),
  })
  const navigateCrumb = useNavigateCrumb()

  const model = useMemo(() => lifeOverview(rows, new Date()), [rows])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-mn-13 text-mn-text-secondary">
        Loading…
      </div>
    )
  }

  return (
    <OverviewSurface
      kicker="Life · everything"
      crumbs={[]}
      onNavigateCrumb={navigateCrumb}
      model={model}
      closing="That’s the whole of it. Open an area, or ask."
      onOpenCard={openCard}
      homeCanvas={<LifeHomeCanvas />}
    />
  )
}

/**
 * The Life home page's own editable blocks (ticket-44 §1). Loads the reserved
 * home row (created on first access), renders the shared <BlockCanvas>, and owns
 * a debounced whole-array save to that row through the same commitBlocks tail as
 * every other page. Kept a leaf component so its ['home'] query and save state
 * don't entangle the overview's ['pages'] read.
 *
 * Adopts an EXTERNAL write (an accepted Pond proposal against Life) the same way
 * DocumentPanel does: when settled, if the server blocks differ from what we last
 * reconciled, take them — so a composed Life block appears without a reload.
 */
function LifeHomeCanvas() {
  // Lazily created on first use, not at render — so an envless mount (Storybook,
  // CI) never constructs a real client and throws (#38); the ['home'] queryFn and
  // the debounced save construct it only when they actually run.
  const getSupabase = useLazySupabase()
  const queryClient = useQueryClient()
  const { data: home } = useQuery({
    queryKey: ['home'],
    queryFn: () => getOrCreateHomePage(getSupabase()),
  })

  const [blocks, setBlocks] = useState<Block[]>([])
  // Which home row our local blocks were seeded from (null = not yet). A ref, so
  // the seed condition is a ref compare (like DocumentPanel) rather than a state
  // the effect must also depend on.
  const loadedId = useRef<string | null>(null)
  const serverSig = useRef<string>('')
  const savedRef = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [insertedIds] = useState<Set<string>>(() => new Set())

  // Seed local blocks from the home row on load; on a settled same-row refetch
  // adopt server blocks only when they changed vs. what we last reconciled — i.e.
  // an external write (an accepted Pond proposal against Life). Mirrors the
  // DocumentPanel seeding effect exactly (its structure keeps the setState off
  // the effect's guaranteed path, satisfying react-hooks/set-state-in-effect).
  useEffect(() => {
    if (home && home.id !== loadedId.current) {
      loadedId.current = home.id
      serverSig.current = JSON.stringify(home.blocks)
      setBlocks(home.blocks)
    } else if (home && home.id === loadedId.current && savedRef.current) {
      const sig = JSON.stringify(home.blocks)
      if (sig !== serverSig.current) {
        serverSig.current = sig
        setBlocks(home.blocks)
      }
    }
  }, [home])

  // Schedule the debounced whole-array save for `next` (shared by every edit
  // path). Kept separate from the setState so the undo path can call it from
  // inside a functional updater without nesting setState.
  function scheduleSave(next: Block[]) {
    if (!home) return
    savedRef.current = false
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      // `ownEdit` (G2, #98) — the same reason DocumentPanel passes it: this is
      // the person's own typed edit landing on the Life home row, so a pending
      // diff aimed at it was written against blocks that have moved on and goes
      // outdated. Without it, a diff proposed against Life stayed accept-able
      // after the person had edited the very blocks it targets.
      await commitBlocks(getSupabase(), queryClient, home.id, next, 'main', { ownEdit: true })
      serverSig.current = JSON.stringify(next)
      // Keep the ['home'] cache in step so the adopt above only fires for genuinely
      // external writes.
      queryClient.setQueryData(['home'], (prev: typeof home) =>
        prev ? { ...prev, blocks: next } : prev
      )
      savedRef.current = true
    }, 600)
  }

  function commitLocalEdit(next: Block[]) {
    if (!home) return
    setBlocks(next)
    scheduleSave(next)
  }

  // Undo a block removal (ticket-44 review): re-insert against the LATEST blocks
  // via a functional update + re-save, so an edit between delete and Undo isn't
  // clobbered by a re-base on the stale stage-time snapshot.
  function undoRemove(index: number, block: Block) {
    setBlocks((current) => {
      const at = Math.min(index, current.length)
      const next = [...current.slice(0, at), block, ...current.slice(at)]
      scheduleSave(next)
      return next
    })
  }

  // Clear a pending debounced save on unmount / home-row change (ticket-44
  // review): mirror DocumentPanel's discipline so a save can't fire against an
  // unmounted component or a stale closure when the Life view changes.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  // Until the home row loads, render nothing (the overview still shows). An empty
  // home row renders the canvas with just the "+ Add a block" foot affordance.
  if (!home) return null

  return (
    <BlockCanvas
      blocks={blocks}
      pageId={home.id}
      onChange={commitLocalEdit}
      onUndoRemove={undoRemove}
      insertedIds={insertedIds}
    />
  )
}
