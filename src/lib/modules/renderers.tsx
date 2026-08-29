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
import { MetricView } from './metric/view'
import { MetricRingView } from './metric-ring/view'
import { TableView } from './table/view'
import { KanbanView } from './kanban/view'
import { PageView } from './page/view'
import { ChartLineView } from './chart-line/view'
import { ChartBarView } from './chart-bar/view'
import { ChartAreaView } from './chart-area/view'

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
  metric: { view: MetricView },
  'metric-ring': { view: MetricRingView },
  table: { view: TableView },
  kanban: { view: KanbanView },
  page: { view: PageView },
  // ticket-36: Bklit chart promotion. Read-only views (AI-maintained, like metric).
  'chart-line': { view: ChartLineView },
  'chart-bar': { view: ChartBarView },
  'chart-area': { view: ChartAreaView },
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
