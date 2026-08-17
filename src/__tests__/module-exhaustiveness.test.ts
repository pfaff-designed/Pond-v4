/**
 * Registry ↔ union exhaustiveness fence (arch-refinement Candidate 3, cheap tier).
 *
 * `blockSchema` (content.ts) and `moduleDataSchema` (ai-composition.ts) are
 * hand-maintained discriminated unions — intentional (Zod union construction from
 * a registry isn't ergonomic) — but nothing kept their MEMBERSHIP in sync with
 * `moduleDescriptors`. A type registered but missing from `moduleDataSchema`
 * compiled fine and was silently un-composable by the AI.
 *
 * These type-level fences make that drift a `tsc` failure. The `@ts-expect-error`
 * cases are the proof the fence has teeth: each deliberately drops a member, and
 * if the fence ever stopped noticing, the expect-error itself would fail tsc.
 */

import { moduleDescriptors } from '@/lib/modules/registry'
import { moduleRenderers } from '@/lib/modules/renderers'
import type { DescriptorType } from '@/lib/modules/registry'
import type { RendererType } from '@/lib/modules/renderers'
import type { BlockType } from '@/lib/modules/content'
import type { ModuleData } from '@/lib/modules/ai-composition'

type Expect<T extends true> = T
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

/** Content types = every registered module except the `page` container. */
type ContentType = Exclude<DescriptorType, 'page'>

// ── The fences ───────────────────────────────────────────────────────────────
// A type added to the registry but missing from a union (or vice versa) fails tsc.
export type ComposableFence = Expect<Equal<ModuleData['type'], ContentType>>
export type PersistableFence = Expect<Equal<BlockType, ContentType>>
export type RenderableFence = Expect<Equal<RendererType, DescriptorType>>

// ── Proof the fences fire ────────────────────────────────────────────────────
// @ts-expect-error — a union missing `table` must not satisfy the fence
export type ProofComposable = Expect<Equal<Exclude<ModuleData['type'], 'table'>, ContentType>>
// @ts-expect-error — a registry missing `metric-ring` must not satisfy the fence
export type ProofRenderable = Expect<Equal<RendererType, Exclude<DescriptorType, 'metric-ring'>>>

// ── Runtime complement ───────────────────────────────────────────────────────
// The two-map contract joins by `type` string at runtime; keep the key sets equal.
describe('module registry two-map contract', () => {
  it('descriptor and renderer maps register the same types', () => {
    expect(Object.keys(moduleRenderers).sort()).toEqual(Object.keys(moduleDescriptors).sort())
  })
})
