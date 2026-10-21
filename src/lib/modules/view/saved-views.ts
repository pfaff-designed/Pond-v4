/**
 * Adds a saved view to a `ViewBlock` and makes it active (KAN-243 ＋ view). A
 * legacy block (no `views`) is converted first: its existing `mode`+config
 * becomes `views[0]`, built the same way `resolveActiveView`'s legacy branch
 * reads it — the top-level fields are left exactly as they were, dead data
 * from here on since every reader resolves through `views`/`activeViewId` once
 * `views` exists. The new view gets `mode`'s `VIEW_KINDS` label, suffixed " 2",
 * " 3"… on a case-insensitive collision against every existing view's
 * effective label (`v.label ?? VIEW_KINDS[v.kind].label`) — including the
 * just-wrapped `views[0]` on a legacy block.
 *
 * Client-side module (ADR'd by fix-3b, KAN-243): `VIEW_KINDS` (`./kinds`) value-
 * imports the picker's hand-drawn `ICON` table from `@/components/molecules`, so
 * this file — and everything that needs `VIEW_KINDS` labels — stays out of
 * `schema.ts`, which the server chat route (`src/app/api/chat/tools.ts`) imports.
 */
import { resolveActiveView, type ViewBlock, type ViewMode, type ViewSavedView } from './schema'
import { VIEW_KINDS } from './kinds'

export const addSavedView = (
  block: ViewBlock,
  mode: ViewMode,
  mintId: () => string = () => crypto.randomUUID()
): ViewBlock => {
  const existingViews: ViewSavedView[] =
    block.views && block.views.length > 0
      ? block.views
      : [{ ...resolveActiveView(block), id: mintId() }]

  const takenLabels = new Set(
    existingViews.map((view) => (view.label ?? VIEW_KINDS[view.kind].label).toLowerCase())
  )
  const baseLabel = VIEW_KINDS[mode].label
  let label = baseLabel
  for (let suffix = 2; takenLabels.has(label.toLowerCase()); suffix++) {
    label = `${baseLabel} ${suffix}`
  }

  const newView: ViewSavedView = { id: mintId(), label, kind: mode, config: {} }

  return { ...block, views: [...existingViews, newView], activeViewId: newView.id }
}
