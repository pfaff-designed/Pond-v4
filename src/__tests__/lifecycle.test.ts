/**
 * The project lifecycle (ticket-39, THE SPINE) — pure state machine.
 *
 * Pins the four load-bearing behaviours the spec + ticket-06 law require:
 *   1. Intent detection — a project-shaped ask enters GRILL; musing and plain
 *      page/edit requests do NOT (the routing eval's steward cases must survive).
 *   2. The escape hatch — "just build it" jumps straight to BUILD-OUT.
 *   3. Phase transitions — the user calls the shot; advance walks the arc,
 *      abandon returns to idle.
 *   4. Persist/parse round-trip — the phase survives the transcript envelope so
 *      a returning session resumes mid-lifecycle; malformed input degrades to idle.
 */

import {
  idleLifecycle,
  detectLifecycleIntent,
  detectLifecycleSignal,
  applyLifecycleSignal,
  beginLifecycle,
  parseLifecycle,
  isLifecycleActive,
  grillNudgeDue,
  lifecycleContextNote,
  GRILL_NUDGE_THRESHOLD,
  WORKING_PHASES,
  type LifecycleState,
} from '@/lib/conversation/lifecycle'

describe('detectLifecycleIntent — the intent matrix', () => {
  it.each([
    ['start a new project called Kiln Studio', 'enter-grill'],
    ['turn this into a project', 'enter-grill'],
    ['help me plan a kitchen renovation', 'enter-grill'],
    ["let's figure out how to organize my move", 'enter-grill'],
    ['I want to plan a garden this spring', 'enter-grill'],
    ['work through a woodworking commission with me', 'enter-grill'],
    ['plan out a reading challenge for the year', 'enter-grill'],
  ])('%s → enter-grill', (text, expected) => {
    expect(detectLifecycleIntent(text)).toBe(expected)
  })

  it.each([
    // The escape hatch: explicit "skip the thinking, just make it".
    ['just build it', 'escape-hatch'],
    ['skip the questions, just make it', 'escape-hatch'],
    ["don't grill me, just scaffold it", 'escape-hatch'],
    ['just get it started', 'escape-hatch'],
  ])('%s → escape-hatch', (text, expected) => {
    expect(detectLifecycleIntent(text)).toBe(expected)
  })

  it.each([
    // MUSING — the steward persona must not enter the lifecycle (mirrors the
    // routing eval's "maybe I should make a page someday" guard).
    ['maybe I should make a page for all my jigs someday. Not sure yet.'],
    ['I might plan a trip eventually'],
    ['just thinking out loud about maybe starting a project'],
    // Plain content-page request → create_page, NOT the lifecycle.
    ['make me a recipe page for lasagna'],
    ['create a separate page for my notes'],
    // Plain edit → propose_changes, NOT the lifecycle.
    ['add a packing checklist'],
    ['reword the intro to sound more casual'],
    // Pure chat.
    ["I've been meaning to cook more Italian food lately."],
    ['Ugh, today was exhausting.'],
    [''],
  ])('%s → none', (text) => {
    expect(detectLifecycleIntent(text)).toBe('none')
  })
})

describe('beginLifecycle', () => {
  it('enter-grill starts the arc at GRILL', () => {
    const s = beginLifecycle(idleLifecycle(), 'enter-grill', { projectName: 'Kiln Studio' })
    expect(s.phase).toBe('grill')
    expect(s.projectName).toBe('Kiln Studio')
  })

  it('escape-hatch jumps straight to BUILD-OUT (skips grill + wayfinding)', () => {
    const s = beginLifecycle(idleLifecycle(), 'escape-hatch')
    expect(s.phase).toBe('build-out')
  })

  it('none leaves ordinary chat untouched', () => {
    const before = idleLifecycle()
    expect(beginLifecycle(before, 'none')).toEqual(before)
  })

  it('carries the stated stakes read', () => {
    const s = beginLifecycle(idleLifecycle(), 'enter-grill', { stakes: 'small' })
    expect(s.stakes).toBe('small')
  })
})

describe('detectLifecycleSignal — the user calls the shot', () => {
  it.each([
    ['turn this into the plan', 'grill', 'advance'],
    ['looks good, build it', 'wayfinding', 'advance'],
    ["let's build the pages", 'wayfinding', 'advance'],
    ['ready, go ahead', 'wayfinding', 'advance'],
    ["that's the plan", 'grill', 'advance'],
  ] as const)('%s in %s → advance', (text, phase, expected) => {
    expect(detectLifecycleSignal(text, phase)).toBe(expected)
  })

  it('the escape hatch mid-grill is an escape signal', () => {
    expect(detectLifecycleSignal('just build it', 'grill')).toBe('escape')
  })

  it.each([
    ['never mind, drop it', 'grill'],
    ['forget it', 'wayfinding'],
  ] as const)('%s → abandon', (text, phase) => {
    expect(detectLifecycleSignal(text, phase)).toBe('abandon')
  })

  it('an ordinary answer within a phase stays', () => {
    expect(detectLifecycleSignal('the goal is a wood-fired kiln in the yard', 'grill')).toBe('stay')
  })

  it('idle has no phase to move — always stay', () => {
    expect(detectLifecycleSignal('build it', 'idle')).toBe('stay')
  })
})

describe('applyLifecycleSignal — the transition table', () => {
  const grill: LifecycleState = { phase: 'grill', projectName: 'Kiln Studio' }

  it('advance walks the arc grill → wayfinding → build-out → idle (done)', () => {
    const s1 = applyLifecycleSignal(grill, 'advance')
    expect(s1.phase).toBe('wayfinding')
    const s2 = applyLifecycleSignal(s1, 'advance')
    expect(s2.phase).toBe('build-out')
    const s3 = applyLifecycleSignal(s2, 'advance')
    expect(s3.phase).toBe('idle') // arc complete
  })

  it('advance preserves the project name across phases', () => {
    expect(applyLifecycleSignal(grill, 'advance').projectName).toBe('Kiln Studio')
  })

  it('escape jumps to build-out from grill or wayfinding', () => {
    expect(applyLifecycleSignal(grill, 'escape').phase).toBe('build-out')
    expect(applyLifecycleSignal({ phase: 'wayfinding' }, 'escape').phase).toBe('build-out')
  })

  it('escape is a no-op at build-out and idle', () => {
    expect(applyLifecycleSignal({ phase: 'build-out' }, 'escape').phase).toBe('build-out')
    expect(applyLifecycleSignal({ phase: 'idle' }, 'escape').phase).toBe('idle')
  })

  it('abandon returns to a clean idle, clearing project context', () => {
    expect(applyLifecycleSignal(grill, 'abandon')).toEqual({ phase: 'idle' })
  })

  it('stay keeps phase + project, but counts a grill turn while grilling (review fix)', () => {
    // In the grill, each stay is one more grill turn (the stuck-in-grill counter)…
    expect(applyLifecycleSignal(grill, 'stay')).toEqual({ ...grill, grillTurns: 1 })
    // …outside it, stay is fully unchanged.
    const charting: LifecycleState = { phase: 'wayfinding', projectName: 'Kiln Studio' }
    expect(applyLifecycleSignal(charting, 'stay')).toEqual(charting)
  })

  it('never mutates its input', () => {
    const before = { ...grill }
    applyLifecycleSignal(grill, 'advance')
    expect(grill).toEqual(before)
  })
})

describe('parseLifecycle / persist round-trip', () => {
  it('round-trips a full state through JSON', () => {
    const state: LifecycleState = { phase: 'build-out', projectName: 'Kiln Studio', stakes: 'big' }
    expect(parseLifecycle(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it('a returning session resumes mid-lifecycle', () => {
    // What the envelope persisted last session:
    const persisted = { phase: 'wayfinding', projectName: 'Kiln Studio' }
    const resumed = parseLifecycle(persisted)
    expect(resumed.phase).toBe('wayfinding')
    expect(resumed.projectName).toBe('Kiln Studio')
  })

  it.each([
    [undefined],
    [null],
    ['not an object'],
    [42],
    [{}],
    [{ phase: 'bogus' }],
    [{ phase: 'grill', projectName: 42 }], // bad field dropped, phase kept
  ])('degrades malformed input %p to a safe state', (bad) => {
    const s = parseLifecycle(bad)
    expect(WORKING_PHASES.includes(s.phase) || s.phase === 'idle').toBe(true)
  })

  it('drops a non-string projectName but keeps the valid phase', () => {
    const s = parseLifecycle({ phase: 'grill', projectName: 42, stakes: 'nonsense' })
    expect(s.phase).toBe('grill')
    expect(s.projectName).toBeUndefined()
    expect(s.stakes).toBeUndefined()
  })
})

describe('isLifecycleActive', () => {
  it('idle is inactive (ordinary-chat transcripts stay clean)', () => {
    expect(isLifecycleActive(idleLifecycle())).toBe(false)
  })
  it('any working phase is active', () => {
    for (const phase of WORKING_PHASES) {
      expect(isLifecycleActive({ phase })).toBe(true)
    }
  })
})

describe('stuck-in-grill guard (review fix)', () => {
  it('each stay mid-grill increments the grillTurns counter', () => {
    let s: LifecycleState = { phase: 'grill' }
    s = applyLifecycleSignal(s, 'stay')
    s = applyLifecycleSignal(s, 'stay')
    expect(s.grillTurns).toBe(2)
  })

  it('stay outside the grill does not count', () => {
    expect(applyLifecycleSignal({ phase: 'wayfinding' }, 'stay').grillTurns).toBeUndefined()
    expect(applyLifecycleSignal({ phase: 'idle' }, 'stay').grillTurns).toBeUndefined()
  })

  it('advancing or escaping the grill resets the counter', () => {
    const long: LifecycleState = { phase: 'grill', grillTurns: 5 }
    expect(applyLifecycleSignal(long, 'advance').grillTurns).toBeUndefined()
    expect(applyLifecycleSignal(long, 'escape').grillTurns).toBeUndefined()
  })

  it('the nudge fires at the threshold, not before', () => {
    expect(grillNudgeDue({ phase: 'grill', grillTurns: GRILL_NUDGE_THRESHOLD - 1 })).toBe(false)
    expect(grillNudgeDue({ phase: 'grill', grillTurns: GRILL_NUDGE_THRESHOLD })).toBe(true)
    expect(grillNudgeDue({ phase: 'grill' })).toBe(false)
  })

  it('the nudge never fires outside the grill', () => {
    expect(grillNudgeDue({ phase: 'wayfinding', grillTurns: 9 })).toBe(false)
    expect(grillNudgeDue({ phase: 'idle' })).toBe(false)
  })

  it('the threshold is 4 (documented)', () => {
    expect(GRILL_NUDGE_THRESHOLD).toBe(4)
  })

  it('the [Lifecycle] note demands an advance chip alongside the escape chip', () => {
    const note = lifecycleContextNote({ phase: 'grill', grillTurns: 5 })
    expect(note).toMatch(/^\[Lifecycle\]/)
    expect(note).toMatch(/MUST include/i)
    expect(note).toMatch(/turn this into the plan/)
    expect(note).toMatch(/escape chip/i)
  })

  it('no note before the threshold or outside the grill', () => {
    expect(lifecycleContextNote({ phase: 'grill', grillTurns: 2 })).toBeNull()
    expect(lifecycleContextNote({ phase: 'build-out' })).toBeNull()
  })

  it('grillTurns round-trips through the envelope; it never rides a non-grill phase', () => {
    expect(parseLifecycle({ phase: 'grill', grillTurns: 3 }).grillTurns).toBe(3)
    expect(parseLifecycle({ phase: 'wayfinding', grillTurns: 3 }).grillTurns).toBeUndefined()
    expect(parseLifecycle({ phase: 'grill', grillTurns: -1 }).grillTurns).toBeUndefined()
    expect(parseLifecycle({ phase: 'grill', grillTurns: 'lots' }).grillTurns).toBeUndefined()
  })
})
