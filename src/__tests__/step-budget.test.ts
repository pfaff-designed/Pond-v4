/**
 * Step budget by lifecycle phase (ticket-39 §4).
 *
 * Pins the documented numbers so a future edit can't silently starve a build-out
 * turn (or balloon a chat turn). Build-out must get the most head-room; chat/
 * grill keep the incumbent flat cap.
 */
import { stepBudgetForPhase, CHAT_STEP_BUDGET } from '@/app/api/chat/step-budget'

describe('stepBudgetForPhase', () => {
  it('idle chat keeps the incumbent cap of 8', () => {
    expect(stepBudgetForPhase('idle')).toBe(CHAT_STEP_BUDGET)
    expect(CHAT_STEP_BUDGET).toBe(8)
  })
  it('grill stays conversational (same as chat)', () => {
    expect(stepBudgetForPhase('grill')).toBe(8)
  })
  it('wayfinding gets a little more room for reading + a Brief edit', () => {
    expect(stepBudgetForPhase('wayfinding')).toBe(10)
  })
  it('build-out gets the most head-room for the scaffolding batches', () => {
    expect(stepBudgetForPhase('build-out')).toBe(16)
  })
  it('build-out is the largest and at least double the chat cap', () => {
    const budgets = (['idle', 'grill', 'wayfinding', 'build-out'] as const).map(stepBudgetForPhase)
    expect(Math.max(...budgets)).toBe(stepBudgetForPhase('build-out'))
    expect(stepBudgetForPhase('build-out')).toBeGreaterThanOrEqual(2 * CHAT_STEP_BUDGET)
  })
})
