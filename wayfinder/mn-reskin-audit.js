export const meta = {
  name: 'mn-reskin-audit',
  description: 'Read-only re-audit of the MN reskin against the design docs — foundation sweep + per-family, then synthesis',
  phases: [
    { title: 'Audit', detail: 'foundation + atoms + molecules + charts/modules + organisms, in parallel' },
    { title: 'Synthesis', detail: 'dedupe + prioritise deviations into one report' },
  ],
}

const WT = '/Users/charlespfaff/Documents/Code/Projects/Pond-v4-mn'
const DS = '/Users/charlespfaff/Documents/Code/Projects/Pond-v4/wayfinder/design_handoff_pond'
const GAP = '/Users/charlespfaff/Documents/Code/Projects/Pond-v4/wayfinder/GAP-ANALYSIS.md'

const LAW = [
  `READ-ONLY AUDIT. Do NOT edit, write, or commit anything. You compare the reskinned code under ${WT}/src against the Make Noise design law and REPORT deviations.`,
  `Authoritative sources, in order (they win over the code): (1) ${DS}/PROJECT_RULES.md — the product law; (2) ${DS}/AUDIT.md — flow-by-flow spec, its "Decided, 26 sep" section is the decision log and beats any mockup frame it disagrees with; (3) the ${DS}/*.dc.html mockups (final colours/type/spacing/copy) — GREP them for values, never read whole; (4) ${GAP}. Read PROJECT_RULES.md whole first; grep AUDIT.md and mockups for the specifics you need.`,
  `The MN law you are checking against:`,
  `• PAPER-NOT-FRAMES: surfaces separate by SHADOW, never hard borders or accent-coloured borders. Flag any border/border-left that draws a frame or a sage/area rule (e.g. leftover .press-* utilities), any card not lifted by an --mn-shadow-*.`,
  `• COLOUR ROLES (never invent a colour; all from tokens): ink 3 tiers only (100 / 80 meta / 68) + paper carry everything. Signals — burnt-orange #D96629 = the one dated thing per screen; wheat #FFEFAE = highlighted passages only (always carries ink text); red #C55347 = diff REMOVALS only. Area colours are MARKS ONLY (glyph + page-kind dots): sage #648F7B, mist #A5C8D1, navy #12354E. Flag any raw Tailwind palette (zinc/amber/emerald/fuchsia/etc.), any leftover Press "lime", any area colour used as a fill/border/text outside a mark, any red outside diff removals.`,
  `• TYPE (split by medium): page prose (incl. Pond's own) = PP Editorial New serif, weights 200/800 ONLY, NEVER 400. Composer answers = PP Neue Montreal sans. MACHINE SURFACE (composer, palette, @-picker, diff cards, provenance chips) = PP Neue Montreal Mono, lowercase, tight tracking. Everything else (titles, labels, rail, tables, numbers) = PP Neue Montreal sans. Flag serif at 400/normal/medium, serif tables (tables are sans), machine surfaces not in mono-lowercase, prose not in serif.`,
  `• RADII: card 20 (rounded-mn-card), inner 14 (rounded-mn-inner), rows 10 (rounded-mn-row), pills 999 (rounded-mn-pill), chrome 6, hair 2. Flag raw rounded-md/lg/xl/2xl/sm on surface chrome (functional micro-shapes like drag handles are exempt).`,
  `• ICONS: area/page marks = glyph library via CSS mask over currentColor; functional marks (send/search/chevron/plus/close) = hand-drawn inline SVG stroke-width 1.4 round caps. NO icon library — flag any remaining lucide import/usage.`,
  `• MOTION: durations 90/150/280/460/560ms; easing cubic-bezier(.22,.8,.2,1); nothing overshoots; honour prefers-reduced-motion. Flag other durations/easings or overshoot.`,
  `• VOCABULARY (product copy only): Pond words — page/area/block/diff/change log/pond/thread/source/record/field/view/relation. Never "module" or "space" in user-facing copy (in code identifiers is fine). Diff buttons: accept / reject / request changes.`,
  `Report EVERY deviation you can substantiate with file:line. Prefer precision over volume — no speculative or "might want to" items. For each, cite the doc rule it breaks.`,
].join('\n')

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['deviations', 'summary'],
  properties: {
    summary: { type: 'string', description: 'One-paragraph read of how well this area matches the MN docs.' },
    deviations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'file', 'line', 'issue', 'expected', 'citation'],
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          file: { type: 'string', description: 'absolute path' },
          line: { type: 'string', description: 'line number or range, or "n/a"' },
          issue: { type: 'string', description: 'what is wrong now' },
          expected: { type: 'string', description: 'the MN value/behaviour it should have' },
          citation: { type: 'string', description: 'which doc rule (PROJECT_RULES / AUDIT decision / mockup / paper-not-frames etc.)' },
        },
      },
    },
  },
}

const AREAS = [
  { label: 'foundation', scope: `The foundation layer: ${WT}/src/app/globals.css (ALL token blocks + every .press-*/.mn-*/.glass utility class + @font-face/@theme) and ${WT}/src/app/layout.tsx + font wiring. This is the highest-value target: hunt LEFTOVER Press/Clearing values that the reskin missed because agents were told not to touch press-* utilities (e.g. .press-letter carried a hard border + sage border-left + accent gradient — now fixed; check .press-rise, .press-arrive, .press-glass, .press-kicker and every token for the same rot). Verify --raw-* palette matches MN, role tokens (--press-*, shadcn/sidebar utilities) point to correct MN values, .dark is MN dark, radii/shadow/motion tokens match the law.` },
  { label: 'atoms', scope: `${WT}/src/components/atoms/*.tsx (exclude *.stories.tsx and *.test.*). Chips, Markdown, ProposalActions, Ghost, Voice, attachment pills, Quote/Stage text.` },
  { label: 'molecules+controls', scope: `${WT}/src/components/molecules/*.tsx + ${WT}/src/components/ui/*.tsx (exclude *.stories.tsx/*.test.*). Proposal cards, ProposalGroup, ModuleDiffCard, CommandPalette, SlashMenu, Breadcrumb, TreeRow, QuestionCard, notices/toasts, button.` },
  { label: 'charts+modules', scope: `${WT}/src/components/charts/**/* and ${WT}/src/lib/modules/**/view.tsx + card.tsx (chart/stat/metric/table/kanban/view/todo/heatmap/timeline/image/page/metric-ring). Check chart token retint, table=sans, block-card chrome radii/paper-not-frames, "one oversized figure" for data.` },
  { label: 'organisms', scope: `${WT}/src/components/organisms/*.tsx (Rail, AITerminal, TerminalDrawer, CommandPalette host, WorkspaceShell, DocumentPanel, OverviewSurface, TopBar). Check composer/rail/shell chrome, machine-surface voice, paper-not-frames, ⌘K/＋ icons, diff-card surfaces.` },
]

phase('Audit')
const reports = await parallel(
  AREAS.map((a) => () =>
    agent(
      `${LAW}\n\nAUDIT AREA: **${a.label}**.\nFiles in scope: ${a.scope}\n\nWork: read PROJECT_RULES.md, then grep the scoped files and the relevant mockups, and produce the deviation list. Be exact with file:line.`,
      { label: `audit:${a.label}`, phase: 'Audit', schema: SCHEMA }
    ).then((r) => ({ area: a.label, ...r }))
  )
)

const all = reports.filter(Boolean)
const flat = all.flatMap((r) => (r.deviations || []).map((d) => ({ area: r.area, ...d })))

phase('Synthesis')
const synthesis = await agent(
  `${LAW}\n\nYou are the SYNTHESIS pass. Below is the concatenated deviation list from five parallel auditors of the MN reskin. Deduplicate (same file+issue reported twice), group by theme (paper-not-frames, colour, type, radii, icons, vocabulary, motion), and PRIORITISE into a single actionable punch-list ordered high→low. Drop anything speculative or already-correct. For systemic issues (one root cause fixing many sites, e.g. a shared utility class or token), call that out explicitly as a single high-value fix.\n\nDEVIATIONS (JSON):\n${JSON.stringify(flat, null, 1)}\n\nArea summaries:\n${all.map((r) => `- ${r.area}: ${r.summary}`).join('\n')}`,
  { label: 'synthesis', phase: 'Synthesis', schema: SCHEMA }
)

return { perArea: all, flat, synthesis }
