import { z } from 'zod'
import type { ModuleDescriptor } from '../types'
// Type-only: erased at compile, so no runtime cycle with content.ts (which
// imports this schema). derive.ts imports only TYPES from this file (its value
// imports — the source narrowers — live in source-guards.ts, which itself has no
// runtime imports), so the schema→derive value import below is acyclic and safe.
import type { Block } from '../content'
import { deriveMetricValue } from './derive'
import { isAggregateSource, isCrossPageSource } from './source-guards'

/** What a metric counts from its bound source block. */
export const metricSourceKindSchema = z.enum(['checklist-checked', 'checklist-total', 'table-rows'])
export type MetricSourceKind = z.infer<typeof metricSourceKindSchema>

/**
 * Same-page binding (ticket-23) — the original PERSISTED form. Points a metric at a
 * sibling block in the same page so its displayed value is DERIVED from that block's
 * current state instead of being manually maintained. The AI declares the binding
 * (which block, which count); it never computes the number — derivation lives in
 * `derive.ts`.
 *
 * `blockId` only, deliberately. The EMIT-time schema (ai-composition.ts) additionally
 * accepts `metricSourceRefSchema` below — a batch-local `ref` for same-batch bindings
 * (ticket-31) — but that form is resolved to a real `blockId` at accept time and must
 * NEVER reach storage. Keeping the persisted schema blockId-only makes that invariant
 * structural: a forgotten resolve pass FAILS `blockSchema` validation in
 * `hydrateBlock` (the change is skipped) instead of silently persisting a `ref`.
 */
export const metricSourceSamePageSchema = z.object({
  /** The sibling block whose state feeds this metric (an existing block's id). */
  blockId: z.string(),
  kind: metricSourceKindSchema,
})

export type MetricSourceSamePage = z.infer<typeof metricSourceSamePageSchema>

/**
 * Cross-page binding (ticket-38) — a PERSISTED form. Points a metric at a block on
 * ANOTHER page (`pageId` + that page's `blockId`). Unlike the ephemeral `ref`, both
 * ids are STABLE references (they name blocks that already exist and have minted ids),
 * so this form persists safely — the same justification the same-page `blockId` form
 * earned. Derivation reads the other page's blocks through the cross-page seam
 * (`use-cross-page-metric.tsx`), then runs the same pure count path as same-page.
 */
export const metricSourceCrossPageSchema = z.object({
  /** The id of the OTHER page holding the source block. */
  pageId: z.string(),
  /** The source block on that page (an existing block's id). */
  blockId: z.string(),
  kind: metricSourceKindSchema,
})

export type MetricSourceCrossPage = z.infer<typeof metricSourceCrossPageSchema>

/**
 * Aggregate binding (ticket-38) — a PERSISTED form. Sums a `kind` across the blocks of
 * ALL direct child pages of the page holding this metric (`pages: 'children'`). This is
 * the live-rollup a parent project page holds over its milestone/child pages — the move
 * that lets the AI PREFER a live rollup over a hand-kept summary table. Each child
 * page's blocks are read through the cross-page seam and every matching block (by
 * `kind`) contributes: `checklist-checked`/`checklist-total` sum across every child
 * checklist, `table-rows` across every child table. A `'children'` literal (not a raw
 * page-id list) keeps the binding stable as children come and go — no id churn to
 * persist. Stable, so it persists (unlike a `ref`).
 */
export const metricSourceAggregateSchema = z.object({
  /** The aggregation scope. `'children'` = every direct child page of this page. */
  pages: z.literal('children'),
  kind: metricSourceKindSchema,
})

export type MetricSourceAggregate = z.infer<typeof metricSourceAggregateSchema>

/**
 * The PERSISTED metric source — one of the three stable forms: cross-page block,
 * child-pages aggregate, or same-page block. MOST-SPECIFIC FIRST is load-bearing:
 * zod objects strip unknown keys, so the permissive same-page `{ blockId }` branch
 * would happily accept a `{ pageId, blockId }` and SILENTLY DROP the `pageId`,
 * collapsing a cross-page binding into a same-page one. Cross-page (needs `pageId`)
 * and aggregate (needs `pages`) must therefore be tried BEFORE same-page. They share
 * no single discriminant field, so this is a plain `z.union`, not a discriminated one.
 */
export const metricSourceSchema = z.union([
  metricSourceCrossPageSchema,
  metricSourceAggregateSchema,
  metricSourceSamePageSchema,
])

export type MetricSource = z.infer<typeof metricSourceSchema>

// The shape narrowers (isCrossPageSource / isAggregateSource / isSamePageSource) live
// in source-guards.ts — NOT here — so derive.ts never has to value-import from this
// file (which value-imports deriveMetricValue back; see the header note).

/**
 * The EMIT-only same-batch binding form (ticket-31). `ref` names a `bindKey` the AI
 * put on a sibling create in the SAME batch — a propose_changes create op, or a
 * create_page block entry. The client resolves `ref` → the freshly-minted `blockId`
 * at accept time (`same-batch-refs.ts`); an unknown `ref` (its create was rejected or
 * failed validation) drops the whole `source` so the metric lands manual, never
 * dangling. Composed into the emit union in ai-composition.ts; NOT part of the
 * persisted `metricSchema` (see above).
 */
export const metricSourceRefSchema = z.object({
  /** A `bindKey` from a sibling create in the same batch. Resolved to a real
   *  `blockId` on accept; never persisted in this form. */
  ref: z.string(),
  kind: metricSourceKindSchema,
})

export type MetricSourceRef = z.infer<typeof metricSourceRefSchema>

/**
 * A single labelled number with an optional unit and trend. Read-only display.
 * When `source` is set the value is derived live from a sibling block; otherwise the
 * manual `value` shows (and if a bound source goes missing, it falls back to it).
 */
export const metricSchema = z.object({
  id: z.string(),
  type: z.literal('metric'),
  label: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  trend: z.enum(['up', 'down', 'flat']).optional(),
  source: metricSourceSchema.optional(),
})

export type MetricBlock = z.infer<typeof metricSchema>

export const metricDescriptor: ModuleDescriptor<MetricBlock> = {
  type: 'metric',
  schema: metricSchema,
  paletteDescription: 'A compact labelled number that can update live from a checklist or table.',
  description:
    'A single labelled figure (with optional unit and up/down/flat trend). Use to surface one key number — a total, a balance, a count. ' +
    'A metric can be LIVE: set `source` to derive its value from a sibling block instead of a manual number — ' +
    "`checklist-checked` counts ticked items in a checklist, `checklist-total` counts all its items, `table-rows` counts a table's rows. " +
    'Prefer a bound metric over a hand-entered count when the same fact already lives in a checklist or table on the page, so the number stays live. ' +
    'Two ways to name the source: (1) `source: { blockId, kind }` binds to an EXISTING block from the injected context; ' +
    '(2) `source: { ref, kind }` binds to a sibling block created in the SAME batch — put `bindKey: "chores"` on that sibling (on the create operation in propose_changes, or directly on the block entry in create_page blocks), then reference it here as `source: { ref: "chores", kind: "checklist-checked" }`. ' +
    'You can and SHOULD create a checklist (or table) and its bound metric together in one turn this way — in propose_changes AND in create_page. Never invent a blockId for a block you are creating; use bindKey/ref for those. ' +
    // ticket-38: cross-page & child-pages rollups. Kept as an appended clause so
    // tickets 35/36 editing this file in parallel merge cleanly.
    'A metric can also roll up LIVE across OTHER pages (ticket-38): ' +
    '(3) `source: { pageId, blockId, kind }` binds to a block on ANOTHER page — copy the page id and its block id from the [Workspace outline]/read_page context; ' +
    '(4) `source: { pages: "children", kind }` SUMS the kind across ALL direct child pages of this page (every child checklist\'s checked/total items, or every child table\'s rows) — use this on a parent project/area page to roll up its milestone or sub-pages. ' +
    'STRONGLY PREFER a live `pages: "children"` rollup metric over a hand-written summary table that restates child-page numbers — the rollup stays correct as children change; a manual table silently rots.',
  // A bound metric must serialize the SAME number the UI derives — the AI's page
  // context and the embeddings must never disagree with what the user sees. With
  // `siblings` in hand we derive exactly as the view does (stale → manual value,
  // flagged); without them we state the binding + fallback instead of guessing.
  //
  // Cross-page & aggregate sources (ticket-38) can NEVER be derived here: `siblings`
  // holds only this page's blocks, and serialize is a pure server-safe facet with no
  // react-query reach into other pages. Emitting a number would risk lying, so we
  // state the binding honestly (what it's live from + the manual fallback) and let the
  // number live where it's actually computed — the UI, backed by the cross-page seam.
  serialize: (data, siblings) => {
    const unit = data.unit ? ` ${data.unit}` : ''
    if (!data.source) return `${data.label}: ${data.value}${unit}`

    // Cross-page block: names the other page + block; no cross-page read here.
    if (isCrossPageSource(data.source)) {
      return `${data.label}: derived live from block ${data.source.blockId} on page ${data.source.pageId} (cross-page; manual fallback: ${data.value}${unit})`
    }
    // Child-pages rollup: states the scope; the live sum lives in the UI.
    if (isAggregateSource(data.source)) {
      return `${data.label}: rolled up live across child pages (manual fallback: ${data.value}${unit})`
    }

    // Same-page block (ticket-23) — derive exactly as the view does when we can.
    if (siblings === undefined) {
      return `${data.label}: derived live from block ${data.source.blockId} (manual fallback: ${data.value}${unit})`
    }
    const derived = deriveMetricValue(data, siblings as readonly Block[])
    return derived.state === 'derived'
      ? `${data.label}: ${derived.value}${unit} (live, derived from block ${derived.sourceId})`
      : `${data.label}: ${data.value}${unit} (bound source ${data.source.blockId} missing; manual value shown)`
  },
}
