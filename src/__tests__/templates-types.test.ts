/**
 * The template vocabulary (issue #154): the twelve fixed kinds, in spec order,
 * stored and displayed as their EXPANDED labels. The PondTemplate mockup's
 * 'meeting' / 'reading' abbreviations are a prop artefact, not the vocabulary.
 */

import { TEMPLATE_KINDS, TEMPLATE_ORIGINS, isTemplateKind } from '@/lib/templates/types'

describe('TEMPLATE_KINDS', () => {
  it('is the twelve lower-case labels in spec order, expanded (not abbreviated)', () => {
    expect(TEMPLATE_KINDS).toEqual([
      'page',
      'notes',
      'list',
      'project',
      'tracker',
      'journal',
      'collection',
      'database',
      'dashboard',
      'meeting notes',
      'reading list',
      'habit',
    ])
    // The mockup's abbreviations must not leak into the stored vocabulary.
    expect(TEMPLATE_KINDS).not.toContain('meeting')
    expect(TEMPLATE_KINDS).not.toContain('reading')
  })

  it('has exactly two origins', () => {
    expect(TEMPLATE_ORIGINS).toEqual(['premade', 'yours'])
  })
})

describe('isTemplateKind', () => {
  it('accepts every fixed kind', () => {
    for (const kind of TEMPLATE_KINDS) expect(isTemplateKind(kind)).toBe(true)
  })

  it('rejects unknown labels, different casing, abbreviations and non-strings', () => {
    expect(isTemplateKind('recipe')).toBe(false)
    expect(isTemplateKind('Page')).toBe(false)
    expect(isTemplateKind('meeting')).toBe(false)
    expect(isTemplateKind('reading')).toBe(false)
    expect(isTemplateKind('')).toBe(false)
    expect(isTemplateKind(null)).toBe(false)
    expect(isTemplateKind(undefined)).toBe(false)
    expect(isTemplateKind(3)).toBe(false)
  })
})
