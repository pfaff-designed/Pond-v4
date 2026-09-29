export const meta = {
  name: 'mn-reskin-waves',
  description: 'Port the Make Noise component library into Pond — waves only (Foundation already committed as 6ee8bb3)',
  phases: [
    { title: 'Building blocks', detail: 'atoms, controls, molecules, charts' },
    { title: 'Organisms', detail: 'rail, composer, palette, slash menu, breadcrumb, diff cards, blocks, shell' },
    { title: 'Verify', detail: 'tsc --noEmit + fix trivial errors' },
  ],
}

// The Foundation phase (globals.css token+font layer, layout.tsx, fonts) was
// completed by hand and committed as 6ee8bb3 on feat/mn-token-layer after the
// original mn-reskin run's Foundation agent stalled. This script resumes from
// wave1. node_modules in the worktree is now a REAL dir (APFS clone), so
// next build/dev + tsc all work.

const WT = '/Users/charlespfaff/Documents/Code/Projects/Pond-v4-mn'
const DS = '/Users/charlespfaff/Documents/Code/Projects/Pond-v4/wayfinder/design_handoff_pond'

const RULES = [
  `You are working in an isolated git worktree at ${WT} (branch feat/mn-token-layer, off main).`,
  `EDIT files only under ${WT}. READ the Make Noise mockups (read-only) under ${DS} — they are the source of truth for all visual values (final colours/type/spacing/copy). The mockup .dc.html files are large HTML; GREP them for the values you need, do not read them whole.`,
  `The token+font foundation is ALREADY DONE and committed: --raw-*/--mn-* MN tokens are defined in ${WT}/src/app/globals.css, --press-* + all shadcn/sidebar utilities are re-pointed to correct Make Noise values, and .dark is MN dark. So DO NOT rename --press-* or shadcn utility classes in components — they already carry MN colours. Reskin = apply MN radii (card 20 / inner 14 / rows 10 / pills 999), the PP type voices (serif prose weight 200, NEVER 400; sans for UI/titles/labels; mono lowercase .1em tracking for machine surfaces — composer, palette, @-picker, diff cards, provenance chips), MN spacing, and "paper-not-frames" (surfaces separated by shadow, not hard borders). Prefer the MN utility classes (bg-raw-*, text-mn-*, rounded-mn-*, shadow-mn-*, the voice tokens) where a component is being touched.`,
  `Keep component behaviour and public props/APIs IDENTICAL — visual reskin only, no behavioural changes. Use Pond vocabulary in any copy (page/area/block/diff/change log/pond/thread — never "module" or "space").`,
  `When done, reply with: files changed (absolute paths) + any spec items you could NOT complete as short TODO bullets. Do NOT run git commit.`,
].join('\n')

const wave1 = [
  { label: 'atoms', spec: `${DS}/PondAtom.dc.html`, target: `atom components under ${WT}/src/components/atoms/`, note: 'Reskin existing atoms; list any missing atom kinds/states from the mockup as TODO (do not build net-new atoms tonight).' },
  { label: 'controls', spec: `${DS}/PondControl.dc.html`, target: `control components (button, fields, toggles, checkbox) under ${WT}/src/components/ui/ plus ProposalActions`, note: 'Primary CTA is ink-on-paper (the foundation already maps --primary to ink); do not reintroduce the old lime.' },
  { label: 'molecules', spec: `${DS}/PondMolecule.dc.html`, target: `existing molecules under ${WT}/src/components (TreeRow, OverviewCard, RelationValue, etc.)`, note: 'Reskin existing molecules only; list missing ones (provenance/notice/reminder/entry/task-card) as TODO.' },
  { label: 'charts', spec: `${DS}/PondChart.dc.html`, target: `chart components under ${WT}/src/components/charts/`, note: 'Retint the existing 5 chart kinds to the MN ink/area palette; list the 8 missing kinds as TODO.' },
]

const wave2 = [
  { label: 'rail', spec: `${DS}/PondRail.dc.html and "${DS}/Pond 05 Shell.dc.html"`, target: `${WT}/src/components/organisms/Rail.tsx`, note: 'Area-colour marks + page-kind dots may stay TODO if they need the glyph system.' },
  { label: 'composer', spec: `${DS}/PondComposer.dc.html`, target: `${WT}/src/components/organisms/AITerminal.tsx and TerminalDrawer.tsx`, note: 'Composer is a machine surface: mono, lowercase.' },
  { label: 'palette', spec: `${DS}/PondPicker.dc.html`, target: `${WT}/src/components/organisms/CommandPalette.tsx and SourceList.tsx`, note: '' },
  { label: 'slash-menu', spec: `${DS}/PondPicker.dc.html`, target: `${WT}/src/components/organisms/SlashMenu.tsx`, note: '' },
  { label: 'breadcrumb', spec: `"${DS}/Pond 05 Shell.dc.html"`, target: `${WT}/src/components/organisms/Breadcrumb.tsx`, note: '' },
  { label: 'diff-cards', spec: `${DS}/PondBlock.dc.html and "${DS}/Pond 06.03 Propose and accept.dc.html"`, target: `proposal/diff-card components (ModuleDiffCard, ProposalGroup, conversation/*) under ${WT}/src/components`, note: 'Red is for diff removals only.' },
  { label: 'blocks', spec: `${DS}/PondBlock.dc.html`, target: `block/module components under ${WT}/src/components/modules/ (registered via registry)`, note: 'Serif prose blocks render Editorial 200.' },
  { label: 'shell', spec: `"${DS}/Pond 05 Shell.dc.html"`, target: `shell surfaces under ${WT}/src/components/organisms (WorkspaceShell, DocumentPanel, OverviewSurface, TopBar)`, note: 'Paper-not-frames; data surfaces lead with one oversized figure, not a chart.' },
]

const familyPrompt = (f) =>
  `${RULES}\n\nReskin the **${f.label}** family. Spec to read (read-only, grep it): ${f.spec}. Target files to find & edit: ${f.target}. ${f.note}`

phase('Building blocks')
const w1 = await parallel(wave1.map(f => () => agent(familyPrompt(f), { label: f.label, phase: 'Building blocks' })))

phase('Organisms')
const w2 = await parallel(wave2.map(f => () => agent(familyPrompt(f), { label: f.label, phase: 'Organisms' })))

phase('Verify')
const verify = await agent(
  `In the worktree ${WT}, run \`cd ${WT} && npx --no-install tsc --noEmit\`. Fix any type errors introduced by the reskin (token/visual changes only — never alter behaviour). Re-run until tsc is clean or you hit an error you cannot safely fix. Report: final tsc status, a summary of what you fixed, and any remaining errors as file:line. Do NOT git commit.`,
  { label: 'tsc-verify', phase: 'Verify' }
)

return { buildingBlocks: w1, organisms: w2, verify }
