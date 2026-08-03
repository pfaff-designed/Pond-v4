import { AI_MODELS } from '@/lib/ai/models'

describe('AI_MODELS', () => {
  it('defines three tiers', () => {
    expect(AI_MODELS.quick).toBeDefined()
    expect(AI_MODELS.standard).toBeDefined()
    expect(AI_MODELS.deep).toBeDefined()
  })

  it('uses claude model ids', () => {
    Object.values(AI_MODELS).forEach((id) => {
      expect(id).toMatch(/^claude-/)
    })
  })

  it('standard is sonnet', () => {
    expect(AI_MODELS.standard).toContain('sonnet')
  })
})
