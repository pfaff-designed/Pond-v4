/**
 * Instantiate a premade template into the page it makes (#261, child 228e of #228).
 *
 * A template is DATA (ADR 0005): a title, an optional page schema, and blocks a
 * person could have built by hand. Making a page from one is therefore the same
 * work the AI write path already does when it accepts a `create_page` +
 * `define_schema` + `configure_view` proposal — so this reuses those three seams
 * rather than minting a fourth:
 *
 *   schema  `hydratePropertySchema` (create-page.ts) mints every property and
 *           option id the template left out;
 *   views   `resolveViewConfig` (configure-view.ts) swaps the property NAMES a
 *           template's view block is authored with for the ids just minted — the
 *           board's `status`, `date`, `value` — dropping nothing on a known name;
 *   blocks  `hydrateBlock` (hydrate.ts) stamps the block id and walks each
 *           descriptor's `nestedIdPaths` for item / row / entry ids.
 *
 * NO TIE BACK (6f frame 4, ADR 0005, `AUDIT.md` 6f): the result carries the title,
 * the schema and the blocks — nothing names the template it came from. Applying the
 * result to a real page (and the one-way advisory provenance stamp, `provenance.ts`)
 * is #156's; the cursor going to the title on apply is #156's too.
 *
 * Pure: injected `mintId`, no React, no Supabase.
 */
import type { Block } from '@/lib/modules/content'
import { hydrateBlock } from '@/lib/modules/hydrate'
import type { ViewBlock } from '@/lib/modules/view/schema'
import { resolveViewConfig } from '@/lib/pages/configure-view'
import { hydratePropertySchema } from '@/lib/pages/create-page'
import type { PropertySchema } from '@/lib/properties/schema'
import type { PremadeTemplate, TemplateViewBlock } from './premade'

/** The page a template makes: ordinary blocks, an ordinary schema, no template reference. */
export interface InstantiatedTemplate {
  title: string
  /** Present only for a template whose page is a collection (five of the twelve). */
  schema?: PropertySchema
  blocks: Block[]
}

export function instantiateTemplate(
  template: PremadeTemplate,
  mintId: () => string = () => crypto.randomUUID()
): InstantiatedTemplate {
  const schema = template.schema ? hydratePropertySchema(template.schema, mintId) : undefined
  const blocks: Block[] = []
  template.blocks.forEach((authored, i) => {
    const data = authored.type === 'view' ? resolveTemplateView(authored, schema ?? []) : authored
    const block = hydrateBlock(data, mintId(), mintId)
    // A premade template is an authored constant typed against the block union, so
    // a block that fails the persisted schema is a defect in the data, never a case
    // to skip quietly (contrast the AI path, which tolerates a malformed emit).
    if (!block) {
      throw new Error(
        `premade template '${template.kind}': block ${i} (${authored.type}) is invalid`
      )
    }
    blocks.push(block)
  })
  return schema ? { title: template.title, schema, blocks } : { title: template.title, blocks }
}

/**
 * A template's view block, its property NAMES resolved to the page's ids through the
 * `configure_view` resolver. The label and the type ride beside the config; `pageId`
 * is not needed (the page does not exist yet) and the resolver does not read it.
 */
export function resolveTemplateView(
  view: TemplateViewBlock,
  schema: PropertySchema
): Omit<ViewBlock, 'id'> {
  const { type, label, ...proposal } = view
  return { type, ...(label ? { label } : {}), ...resolveViewConfig(schema, proposal) }
}

/**
 * Every property id a view block's config references — the same clauses
 * `resolveViewConfig` resolves, read back off the persisted block. The guard that an
 * instantiated template references only its OWN schema (nothing pre-seeded, nothing
 * dangling, #246) walks this.
 */
export function viewPropertyRefs(block: ViewBlock): string[] {
  const refs: Array<string | undefined> = [
    block.groupBy,
    block.sort?.key,
    block.filter?.property,
    block.startDate,
    block.endDate,
    block.chart?.xProperty,
    ...(block.chart?.series.map((s) => s.property) ?? []),
    block.bigNumber?.property,
    block.bigNumber?.delta?.property,
  ]
  return refs.filter((r): r is string => typeof r === 'string')
}
