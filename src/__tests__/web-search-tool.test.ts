/**
 * @jest-environment node
 *
 * Tests for the web_search tool config (ticket-29).
 *
 * We assert the tool is the provider-executed Anthropic web-search tool and that
 * its per-turn use cap is wired — a cost control the spec calls for. We do NOT call
 * the Anthropic API here (provider-executed tools run server-side at Anthropic; no
 * live API in jest).
 */

import { webSearchTool, WEB_SEARCH_MAX_USES } from '@/app/api/chat/web-search'

describe('webSearchTool (ticket-29)', () => {
  it('is the provider-executed Anthropic web-search tool', () => {
    const t = webSearchTool as unknown as {
      type: string
      id: string
      isProviderExecuted: boolean
    }
    expect(t.type).toBe('provider')
    expect(t.id).toBe('anthropic.web_search_20260209')
    expect(t.isProviderExecuted).toBe(true)
  })

  it('caps searches per turn (cost control)', () => {
    const t = webSearchTool as unknown as { args?: { maxUses?: number } }
    expect(WEB_SEARCH_MAX_USES).toBeGreaterThan(0)
    expect(t.args?.maxUses).toBe(WEB_SEARCH_MAX_USES)
  })
})
