/**
 * The apply builder (KAN-124): a template pick → the page it becomes.
 *
 * Pure glue over the three seams the rest of this module already owns —
 * `instantiateTemplate` for a premade shape, `templateBlocksFrom` for a saved one,
 * `applyKindLabel` + `stampProvenance` for the `props` both carry — so applying in
 * place and making a nested page (the non-blank-page case, unchanged) read off the
 * same builder. No React, no Supabase: a `yours` pick arrives already resolved to
 * its `PondTemplate` row, because fetching one is the caller's job, not this one's.
 */
import type { Block } from '@/lib/modules/content'
import type { PropertySchema } from '@/lib/properties/schema'
import { instantiateTemplate } from './instantiate'
import { templateBlocksFrom } from './from-page'
import { applyKindLabel } from './kind-label'
import { stampProvenance } from './provenance'
import { PREMADE_TEMPLATES } from './premade'
import type { PondTemplate, TemplateKind } from './types'

export type TemplateApplyPick =
  | { origin: 'premade'; kind: TemplateKind }
  | { origin: 'yours'; template: PondTemplate }

export interface AppliedTemplate {
  title: string
  blocks: Block[]
  /** Present only when the template's page is a collection (five of the twelve). */
  schema?: PropertySchema
  props: Record<string, unknown>
}

/**
 * A premade shape has no row of its own, so its stamp names the kind in place of a
 * real id — `premade:{kind}` — the format the spec's "premade templates are stamped
 * `premade:{kind}`" names.
 */
function premadeStampSource(kind: TemplateKind): Pick<PondTemplate, 'id' | 'name'> {
  return { id: `premade:${kind}`, name: kind }
}

export function applyTemplate(
  pick: TemplateApplyPick,
  mintId: () => string = () => crypto.randomUUID()
): AppliedTemplate {
  if (pick.origin === 'premade') {
    const { title, schema, blocks } = instantiateTemplate(PREMADE_TEMPLATES[pick.kind], mintId)
    const props = stampProvenance(applyKindLabel({}, pick.kind), premadeStampSource(pick.kind))
    return schema ? { title, schema, blocks, props } : { title, blocks, props }
  }

  const { template } = pick
  const blocks = templateBlocksFrom(template.blocks, mintId, { keepContent: true })
  const props = stampProvenance(applyKindLabel({}, template.name), template)
  return { title: template.name, blocks, props }
}
