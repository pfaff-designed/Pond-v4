'use client'

/**
 * Client renderer registry (t12) — the client half of the two-map contract, joined
 * to `moduleDescriptors` by the `type` string. Only client React imports this;
 * server code reads `registry.ts` (descriptors) and never poisons its bundle with
 * these view components.
 */
import type { ComponentType } from 'react'
import type { ModuleRenderer, ModuleViewProps } from './types'

import { TextView } from './text/view'
import { TextDiffer } from './text/differ'
import { TodoView } from './todo/view'
import { TableView } from './table/view'
import { PageView } from './page/view'
import { ViewView } from './view/view'
import { ImageView } from './image/view'
import { HighlightView } from './highlight/view'
import { EntriesView } from './entries/view'
import { PageLinkView } from './page-link/view'

/**
 * `type → { view, editor?, differ? }`. A plain keyed object literal — no framework,
 * no runtime registration. Adding a module = one folder (schema with the required
 * descriptor facets + view) + one line here, one in `registry.ts`, and its schema in
 * the `content.ts` / `ai-composition.ts` unions — the exhaustiveness fences in
 * `__tests__/module-exhaustiveness.test.ts` fail tsc if any of those are missed.
 */
export const moduleRenderers = {
  text: { view: TextView, differ: TextDiffer },
  todo: { view: TodoView },
  table: { view: TableView },
  page: { view: PageView },
  // #19: collection view. Slice-2 stub renderer; real renderers land in slices 3–4.
  view: { view: ViewView },
  // #61: uploaded image / file attachment. Editing folds into the view (the
  // empty state IS the upload affordance), so no separate editor facet.
  image: { view: ImageView },
  // #249: the kept passage. Click-to-edit folds into the view (as text); the diff
  // card renders it read-only through ModuleView, so no differ facet.
  highlight: { view: HighlightView },
  // #250: dated prose. Editing folds into the view (a date field + a textarea per
  // row, as todo); the diff card renders it read-only through ModuleView.
  entries: { view: EntriesView },
  // KAN-122: the row `/ nested page` leaves behind. No editor facet — nothing on
  // the row is edited in place; it only links out.
  'page-link': { view: PageLinkView },
}
// Correctness is enforced at each view's definition (every view is typed as a
// ModuleRenderer for its own data). A homogeneous `satisfies Record<…>` can't be
// applied here because `onChange` is contravariant across the distinct data types.

export type RendererType = keyof typeof moduleRenderers

/**
 * The single dispatcher every host and container renders through. Looks the module
 * up by `type` and renders its `view`; an unregistered type renders nothing rather
 * than throwing (a stale persisted block must never hard-fail a page load — t12 §2:
 * no read-side validation).
 */
export function ModuleView({ type, ...props }: ModuleViewProps<unknown> & { type: string }) {
  const renderer = (moduleRenderers as Record<string, ModuleRenderer<unknown>>)[type]
  if (!renderer) return null
  const View = renderer.view as ComponentType<ModuleViewProps<unknown>>
  return <View {...props} />
}
