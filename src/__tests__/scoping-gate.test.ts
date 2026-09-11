/**
 * Scope-before-build gate (#59).
 *
 * "Create a project" with no subject must draw scoping questions, never an
 * invented project filled in blind. This pins the deterministic half of that
 * contract: the bare-request detector and the [Scoping] context note the chat
 * route injects when it fires. The matrix mirrors the routing eval's steward
 * cases — every CLEAR request the eval pins to a tool must NOT trip the gate,
 * or the gate itself would regress acceptance criterion (3).
 */
import { needsScoping, scopingContextNote, SCOPING_NOTE } from '@/app/api/chat/scoping'

describe('needsScoping — bare structural-creation requests (gate FIRES)', () => {
  it.each([
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
  ])('fires on %j', (text) => {
    expect(needsScoping(text)).toBe(true)
  })
})

describe('needsScoping — clear/concrete requests (gate must NOT fire — AC3)', () => {
  it.each([
    // Eval-pinned create_page cases: subject named → build immediately.
    'create a new project called Website Redesign',
    'make me a recipe page for lasagna',
    'create a separate page for my lasagna recipe',
    'create an inventory page for my workshop tools',
    'make a top-level page called Scratchpad',
    'make a page for my 2026 reading goals in my Personal area',
    'create a project for my kitchen renovation',
    // Edits / other tools — never this gate's business.
    'reword the intro to sound more casual',
    'add a step-by-step instructions checklist',
    'track my reading list with status and rating',
    'add a recipe for lasagna',
    'turn this into a project called Kitchen Renovation',
    'what have I written about my trip to Japan?',
    // Musing / chat.
    "I've been meaning to cook more Italian food lately.",
    'Hmm, maybe I should make a page for all my jigs someday. Not sure yet.',
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
  it('returns the note for a bare request', () => {
    expect(scopingContextNote('create a project')).toBe(SCOPING_NOTE)
  })
  it('returns null for a concrete request', () => {
    expect(scopingContextNote('create a new project called Website Redesign')).toBeNull()
  })
  it('the note forbids tool calls and invented subjects, and asks scoping questions', () => {
    expect(SCOPING_NOTE).toMatch(/^\[Scoping\]/)
    expect(SCOPING_NOTE).toMatch(/do NOT call any creation tool/i)
    expect(SCOPING_NOTE).toMatch(/do NOT invent/i)
    expect(SCOPING_NOTE).toMatch(/scoping questions/i)
    expect(SCOPING_NOTE).toMatch(/one continuous pass/i)
  })
})
