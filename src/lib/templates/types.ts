/**
 * Template types (issue #154, epic #117 Phase 4).
 *
 * A template is a SHAPE YOU COPY, never a tie: its `blocks` are the same
 * content-block union a page holds (`src/lib/modules/content.ts`), copied onto a
 * new page on apply. Nothing about a page points back at a template except the
 * one-way, advisory provenance stamp in `src/lib/templates/provenance.ts`.
 *
 * Pure types + the fixed vocabulary — no React, no Supabase, server-safe.
 */

import type { Block } from '@/lib/modules/content'

/**
 * THE TWELVE premade shapes, in spec order (AGENTS.md "Premade templates are
 * generic shapes"). Stored and displayed EXPANDED — 'meeting notes', 'reading
 * list'. The PondTemplate mockup's 'meeting' / 'reading' abbreviations are a
 * prop artefact, not the vocabulary. Mirrors the CHECK in migration 0016.
 */
export const TEMPLATE_KINDS = [
  'page',
  'notes',
  'list',
  'project',
  'tracker',
  'journal',
  'collection',
  'database',
  'dashboard',
  'meeting notes',
  'reading list',
  'habit',
] as const

export type TemplateKind = (typeof TEMPLATE_KINDS)[number]

export function isTemplateKind(value: unknown): value is TemplateKind {
  return typeof value === 'string' && (TEMPLATE_KINDS as readonly string[]).includes(value)
}

/**
 * Where a template came from. `premade` = one of the twelve shipped shapes
 * (code constants from #155, never rows on a fresh pond); `yours` = saved by
 * the person (#157).
 */
export const TEMPLATE_ORIGINS = ['premade', 'yours'] as const

export type TemplateOrigin = (typeof TEMPLATE_ORIGINS)[number]

export function isTemplateOrigin(value: unknown): value is TemplateOrigin {
  return typeof value === 'string' && (TEMPLATE_ORIGINS as readonly string[]).includes(value)
}

export interface PondTemplate {
  id: string
  name: string
  kind: TemplateKind
  /** The shape — the same 14-member content-block union a page's `blocks` holds. */
  blocks: Block[]
  origin: TemplateOrigin
  createdAt: string
  updatedAt: string
}
