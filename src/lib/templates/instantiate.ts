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
import type { ViewBlock, ViewSavedView } from '@/lib/modules/view/schema'
import { resolveViewConfig, type ConfigureViewProposal } from '@/lib/pages/configure-view'
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
 * A resolved view block before `hydrateBlock` mints ids: the block's own id (as for
 * every block) and, for a several-saved-views block, each view's own id — minted via
 * `viewDescriptor.nestedIdPaths`, so a saved view is authored and resolved with none.
 */
type ResolvedTemplateView = Omit<ViewBlock, 'id' | 'views'> & {
  views?: Array<Omit<ViewSavedView, 'id'>>
}

/**
 * A template's view block, its property NAMES resolved to the page's ids through the
 * `configure_view` resolver. The label and the type ride beside the config; `pageId`
 * is not needed (the page does not exist yet) and the resolver does not read it.
 *
 * `views` (KAN-32) resolves each saved view's own name-keyed config independently —
 * the same `resolveViewConfig` call, once per view — and sets the block's own `mode`
 * to the first view's `kind` (the back-compat mirror every other consumer reads).
 */
function resolveTemplateView(view: TemplateViewBlock, schema: PropertySchema): ResolvedTemplateView {
  if (view.views) {
    const { type, label, views: authoredViews } = view
    const views = authoredViews.map((authoredView) => {
      const { label: viewLabel, kind, ...viewProposal } = authoredView
      const { mode, ...config } = resolveViewConfig(schema, { mode: kind, ...viewProposal })
      return { label: viewLabel, kind: mode, config }
    })
    return { type, ...(label ? { label } : {}), mode: views[0].kind, views }
  }
  const { type, label, ...proposal } = view
  // `mode` is typed optional on `TemplateViewBlock` only so the `views` branch above can
  // skip it; every template reaching this branch (no `views`) still authors it, same as
  // before `views` existed.
  return {
    type,
    ...(label ? { label } : {}),
    ...resolveViewConfig(schema, proposal as Omit<ConfigureViewProposal, 'pageId' | 'collectionId'>),
  }
}

/**
 * Every property id a view block's config references — the same clauses
 * `resolveViewConfig` resolves, read back off the persisted block. The guard that an
 * instantiated template references only its OWN schema (nothing pre-seeded, nothing
 * dangling, #246) walks this.
 *
 * ⚠️ **This list is paired with `resolveViewConfig`'s clauses by hand** and nothing
 * enforces it — there is no table either side derives from. A tenth reference site,
 * the way #27 added the gantt dates and #94 added `target`, silently shrinks the
 * guard above with no compile error. `view/figures.tsx` carries the repo's own
 * warning about this class (*"#259's `presentation` would have been next"*).
 * **Add to both, or give them one table.** Verified clause by clause against
 * `resolveViewConfig` on 2026-10-02.
 *
 * Walks every saved view's OWN `config` too (KAN-32) — a `views`-shaped block's
 * clauses live there, never at the top level, so skipping that walk would silently
 * stop checking them.
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
  // Several saved views (KAN-32): each view's OWN config carries the same clauses,
  // never the block's top-level fields above — walk every one, or a views-shaped
  // block's references silently stop being checked.
  for (const view of block.views ?? []) {
    const config = view.config
    refs.push(
      config?.groupBy,
      config?.sort?.key,
      config?.filter?.property,
      config?.startDate,
      config?.endDate,
      config?.chart?.xProperty,
      ...(config?.chart?.series.map((s) => s.property) ?? []),
      config?.bigNumber?.property,
      config?.bigNumber?.delta?.property
    )
  }
  return refs.filter((r): r is string => typeof r === 'string')
}
