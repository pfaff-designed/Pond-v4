/**
 * Prompt architecture after the ticket-39 refactor.
 *
 * The prompt was refactored from one growing slab into composable named sections
 * (persona / steward / routing / catalog / structure / research / lifecycle /
 * correspondence / brief). This pins TWO invariants:
 *   1. Every load-bearing RULE STRING the routing eval depends on still appears
 *      in the composed SYSTEM_PROMPT (the refactor must keep each section's rules
 *      intact — their behaviour is eval-pinned).
 *   2. The ticket-39 sections (persona layer, lifecycle arc, correspondence,
 *      Brief) are actually present.
 */
import { SYSTEM_PROMPT, PROMPT_SECTIONS, buildSystemPrompt } from '@/app/api/chat/prompt'

describe('SYSTEM_PROMPT — preserved rule strings (eval-pinned, must survive the refactor)', () => {
  it.each([
    // STEWARD gate — the two-situations rule (steward-persona eval cases).
    'You never initiate production of documents, plans, action lists, or blocks'.replace(
      'You never',
      'you never'
    ),
    'the request IS the confirmation',
    'a passing mention of maybe making something someday',
    // ROUTING — create_page vs propose_changes + placement inference.
    'call the create_page tool',
    'create_page is DISTINCT from propose_changes',
    'INFER the placement',
    'top-level is the fallback, not the default',
    // Cross-page targeting (ticket-30) + requested-vs-inferred.
    "set 'targetPageId' to that SAME id",
    "A cross-page propose_changes with no 'targetPageId' will NOT be applied",
    'REQUESTED vs INFERRED',
    // STRUCTURE (ticket-21) — pipe-table + title-echo bans.
    'NEVER write a markdown pipe table',
    'A title-echo heading will be rejected',
    // #28 routing demotion — record-like tabular defaults to a collection;
    // freeform matrix / explicit "a table" stays the table block.
    'the DEFAULT for record-like tabular data',
    'RECORD-LIKE TABULAR DATA DEFAULTS HERE',
    // RESEARCH (ticket-29).
    'You have a web_search tool',
    'from memory, not today',
    // #19 slice 5: configure_view routing.
    'call the configure_view tool',
    // #29: promote_table — convert an existing freeform table block to a collection.
    'call the promote_table tool',
    'promote_table CONVERTS an existing filled table',
    // #40: link_records — forward-only, add-only linking of existing rows.
    'call the link_records tool',
    // #52 fix 1: a rollup needs a LOCAL relation; reverse/backlink count unsupported.
    'a rollup CANNOT count over a reverse/backlink',
    // #52 fix 3: never add a duplicate Title/Name text property.
    'Never add a text property named "Title" or "Name"',
    // #52 fix 2: a collection shows exactly ONE active view.
    'A collection shows exactly ONE active view at a time',
  ])('still contains rule string: %s', (needle) => {
    expect(SYSTEM_PROMPT).toContain(needle)
  })

  it('embeds the registry-derived module catalog', () => {
    expect(SYSTEM_PROMPT).toContain(
      'The available block types (used by BOTH create_page and propose_changes) are:'
    )
  })
})

describe('SYSTEM_PROMPT — ticket-39 additions', () => {
  it('has a persona/thinking-partner layer with the ticket-06 orient-then-wait law', () => {
    expect(PROMPT_SECTIONS.PERSONA).toMatch(/thinking partner/i)
    expect(PROMPT_SECTIONS.PERSONA).toMatch(/the user calls the shot/i)
    expect(PROMPT_SECTIONS.PERSONA).toMatch(/orient/i)
  })

  it('persona teaches candor (#13): contextual honesty, no reflexive praise, and anti-cognitive-offloading', () => {
    const s = PROMPT_SECTIONS.PERSONA
    // candor sharpens with the stakes — warm in chat, honest when it counts
    expect(s).toMatch(/SHARPEN with the stakes/i)
    // the four anti-sycophancy specifics
    expect(s).toMatch(/reflexive praise/i)
    expect(s).toMatch(/trade-?offs and the downsides/i)
    expect(s).toMatch(/challenge weak assumptions/i)
    expect(s).toMatch(/warn hard/i)
    // anti-offloading: sharpen the user's thinking, never replace it
    expect(s).toMatch(/never to do their thinking for them/i)
    expect(s).toMatch(/a little sharper, never a little duller/i)
  })

  it('teaches the lifecycle arc: grill (adaptive, states its read, escape hatch) → wayfinding → build-out', () => {
    const s = PROMPT_SECTIONS.LIFECYCLE
    expect(s).toMatch(/GRILL/)
    expect(s).toMatch(/STATE YOUR READ/i)
    expect(s).toMatch(/just build it/i) // the escape hatch
    expect(s).toMatch(/WAYFINDING/)
    expect(s).toMatch(/agrees? to.*BEFORE anything is scaffolded/i)
    expect(s).toMatch(/BUILD-OUT/)
    // #59: build-out lands the whole structure in one reply — client-resolved
    // proposal cards end the turn, so "separate batches" stalled mid-scaffold.
    expect(s).toMatch(/one continuous pass/i)
    expect(s).toMatch(/never stop after the first card/i)
    expect(s).toMatch(/ask_question/)
  })

  it('teaches the correspondence mechanics: follow-up chips + branch-pause question cards', () => {
    expect(PROMPT_SECTIONS.CORRESPONDENCE).toMatch(/suggest_followups/)
    expect(PROMPT_SECTIONS.CORRESPONDENCE).toMatch(/ask_question/)
    expect(PROMPT_SECTIONS.CORRESPONDENCE).toMatch(/branch-pause/i)
  })

  it('grill chips MUST always include an escape, and an advance when the grill runs long (review fix)', () => {
    const s = PROMPT_SECTIONS.CORRESPONDENCE
    // Every grill turn offers a way out without typing…
    expect(s).toMatch(/MUST ALWAYS be an escape/i)
    expect(s).toMatch(/just build it/)
    // …and the injected [Lifecycle] long-grill note forces an advance chip.
    expect(s).toMatch(/\[Lifecycle\]/)
    expect(s).toMatch(/MUST advance/i)
    expect(s).toMatch(/turn this into the plan/)
  })

  it('routing prefers propose_changes when the user names an existing destination surface (eval regression fix)', () => {
    expect(PROMPT_SECTIONS.ROUTING).toMatch(/DESTINATION SURFACE/)
    expect(PROMPT_SECTIONS.ROUTING).toMatch(
      /prefer propose_changes on that page over minting a new page/
    )
  })

  it('teaches the visible Brief sub-page maintained via the normal gate + completeness reasoning', () => {
    const s = PROMPT_SECTIONS.BRIEF
    expect(s).toMatch(/Brief/)
    expect(s).toMatch(/append-only/i)
    expect(s).toMatch(/normal propose_changes gate|NORMAL propose_changes/i)
    expect(s).toMatch(/never invent/i)
  })

  it('scopes before building (#59): bare creation requests draw questions, clear ones build, and the build lands in one pass', () => {
    const s = PROMPT_SECTIONS.SCOPING
    // AC1: a bare "create a project" draws scoping questions and creates nothing.
    expect(s).toMatch(/names NO subject/i)
    expect(s).toMatch(/do NOT call any tool/i)
    expect(s).toMatch(/NEVER invent a subject/i)
    expect(s).toMatch(/scoping questions/i)
    // AC2: once answered, the whole structure lands in one continuous pass.
    expect(s).toMatch(/one continuous pass/i)
    expect(s).toMatch(/never pausing/i)
    // AC3: a clear request builds without needless interrogation.
    expect(s).toMatch(/already scoped/i)
    expect(s).toMatch(/never adds questions to a clear request/i)
  })

  it('every section appears in the composed whole', () => {
    for (const section of Object.values(PROMPT_SECTIONS)) {
      expect(SYSTEM_PROMPT).toContain(section)
    }
  })
})

describe('buildSystemPrompt', () => {
  it('returns the base prompt when no context is given', () => {
    expect(buildSystemPrompt()).toBe(SYSTEM_PROMPT)
  })
  it('appends the workspace context block when present', () => {
    const out = buildSystemPrompt('[Workspace outline]\n- Area: Personal')
    expect(out.startsWith(SYSTEM_PROMPT)).toBe(true)
    expect(out).toContain('[Workspace outline]')
  })
})
