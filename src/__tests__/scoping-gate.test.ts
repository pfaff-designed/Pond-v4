/**
 * Grill-before-build gate (supersedes part of #59).
 *
 * The direction reversed: a from-scratch creation request no longer builds
 * immediately — it draws an adaptive grill FIRST, then builds once the user
 * answers. This pins the deterministic half of that contract: the create-intent
 * detector and the [Scoping] note the chat route injects when it fires. The #1
 * correctness risk (spec §4.2) is OVER-firing on edits, so the matrix pins that
 * every edit / cross-page / promote / musing / escape input the routing eval
 * treats as contextual stays QUIET.
 */
import { needsScoping, scopingContextNote, SCOPING_NOTE } from '@/app/api/chat/scoping'

describe('needsScoping — creation requests (gate FIRES: grill before build)', () => {
  it.each([
    // Bare structural creation (the original #59 shape).
    'create a project',
    'Create a project.',
    'create a new project',
    'make me a page',
    'make a page',
    'build me a table',
    'set up a database',
    'setup a tracker',
    'start a new project',
    'make a dashboard',
    'create a collection',
    'make me a new doc',
    'can you create a project?',
    'could you make me a page',
    'please create a project',
    'hey, create a project',
    'create a project for me',
    'make a page please',
    'create a project now',
    // Named-subject creations — build-now under #59, now grilled first.
    'create a new project called Website Redesign',
    'make me a recipe page for lasagna',
    'create a separate page for my lasagna recipe',
    'create an inventory page for my workshop tools',
    'make an inventory page for my woodworking tools',
    'make a top-level page called Scratchpad',
    'make a page for my 2026 reading goals in my Personal area',
    'create a project for my kitchen renovation',
    'Actually, make me a separate page about my 2026 reading goals.',
    // Fully-specified contents still grill for intent (§6 decision 1).
    'make me a fall reading list page — a table of books with title, author, and status',
    'create a page comparing three standing desks — name, height range, and price for each',
    'make a page comparing Free, Pro, and Enterprise across these features: price, seats, SSO, and support',
    'make me a keyboard shortcuts cheat sheet for VS Code',
    'make me a page called Japan Trip Ideas for jotting down places to visit',
    // Trackers/logs that mint a new page (#63).
    'set up a tracker for my house maintenance tasks — each one has a status, a cost estimate, and a deadline',
    'start a workout log for me — I want to record date, exercise, sets, and weight',
    // In-place structural conversion also grills (§6 decision 4: "grill first too").
    'turn this into a project called Kitchen Renovation',
    // The user's motivating examples.
    'I need a grocery list',
    'come up with a workout routine',
  ])('fires on %j', (text) => {
    expect(needsScoping(text)).toBe(true)
  })
})

describe('needsScoping — edits / chat / escape (gate must NOT fire — AC3)', () => {
  it.each([
    // Edits of existing content — contextual, never grilled (spec §2.1).
    'reword the intro to sound more casual',
    'add a step-by-step instructions checklist',
    'add a packing checklist',
    'bump the hydration metric to 78%',
    'add a recipe for lasagna',
    // Record-like edits on an existing collection (define_schema / add_row).
    'track my reading list with status and rating',
    'track my workouts here — date, exercise, sets, and weight for each',
    'log today’s workout in my training log',
    // View config on an existing collection.
    'show my tasks as a board grouped by status',
    // Cross-page edit (propose_changes with targetPageId).
    'mark the pottery wheel purchased',
    'add a step to my Ceramics Studio Plan',
    // promote_table — converting an EXISTING table block carries rows across.
    'make this table a database',
    'turn this table into a collection',
    'promote this table',
    'convert this table to a tracker',
    // link_records.
    'link this task to the Kitchen Reno project',
    // Recall.
    'what have I written about my trip to Japan?',
    // Musing / chat.
    "I've been meaning to cook more Italian food lately.",
    'Hmm, maybe I should make a page for all my jigs someday. Not sure yet.',
    'Ugh, today was exhausting. I just need to complain for a second.',
    // Escape hatch: explicit "just build it" must never draw questions.
    'just build it',
    'just create it',
    'no questions, just build it',
    // Empty / whitespace.
    '',
    '   ',
  ])('stays quiet on %j', (text) => {
    expect(needsScoping(text)).toBe(false)
  })
})

describe('scopingContextNote — the [Scoping] note the route injects', () => {
  it('returns the note for a creation request', () => {
    expect(scopingContextNote('make me a recipe page for lasagna')).toBe(SCOPING_NOTE)
  })
  it('returns the note for a bare creation request', () => {
    expect(scopingContextNote('create a project')).toBe(SCOPING_NOTE)
  })
  it('returns null for an edit', () => {
    expect(scopingContextNote('add a packing checklist')).toBeNull()
  })
  it('the note tells the model to grill intent, forbids building + inventing, keeps the one-pass build and escape hatch', () => {
    expect(SCOPING_NOTE).toMatch(/^\[Scoping\]/)
    expect(SCOPING_NOTE).toMatch(/grill their intent/i)
    expect(SCOPING_NOTE).toMatch(/do NOT call any creation tool/i)
    expect(SCOPING_NOTE).toMatch(/do NOT invent/i)
    expect(SCOPING_NOTE).toMatch(/do NOT re-ask/i)
    expect(SCOPING_NOTE).toMatch(/one continuous pass/i)
    expect(SCOPING_NOTE).toMatch(/just build it/i)
  })
})
