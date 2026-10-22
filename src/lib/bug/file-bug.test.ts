import { bugConfigFromEnv, fileBug, type BugConfig } from './file-bug'

const config: BugConfig = {
  anthropicApiKey: 'anthropic-key',
  githubToken: 'github-token',
  environmentId: 'env_1',
  vaultId: 'vlt_1',
  agentId: 'agent_1',
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('bugConfigFromEnv', () => {
  it('is null until every key is set', () => {
    expect(bugConfigFromEnv({})).toBeNull()
    expect(
      bugConfigFromEnv({
        ANTHROPIC_API_KEY: 'a',
        GITHUB_AGENT_TOKEN: 'g',
        CLAUDE_ENVIRONMENT_ID: 'e',
        CLAUDE_VAULT_ID: 'v',
        CLAUDE_AGENT_ID: 'agent',
      })?.agentId
    ).toBe('agent')
  })
})

describe('fileBug', () => {
  it('opens the issue, then starts the agent on that issue', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('api.github.com')) {
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer github-token' })
        const sent = JSON.parse(String(init?.body)) as { title: string; labels: string[] }
        expect(sent.title).toBe('login 500s when the cookie is missing')
        expect(sent.labels).toEqual(['bug'])
        return jsonResponse({ html_url: 'https://github.com/pfaff-designed/Pond-v4/issues/12' })
      }
      const sent = JSON.parse(String(init?.body)) as {
        agent: string
        vault_ids: string[]
        initial_events: { content: { text: string }[] }[]
      }
      expect(sent.agent).toBe('agent_1')
      expect(sent.vault_ids).toEqual(['vlt_1'])
      expect(sent.initial_events[0]?.content[0]?.text).toContain('issues/12')
      expect(JSON.stringify(sent)).not.toContain('anthropic-key')
      return jsonResponse({ id: 'sesn_1' })
    })

    const filed = await fileBug(
      'login 500s when the cookie is missing',
      config,
      fetchImpl as typeof fetch
    )
    expect(filed).toEqual({
      issueUrl: 'https://github.com/pfaff-designed/Pond-v4/issues/12',
      sessionId: 'sesn_1',
      transcriptUrl: 'https://platform.claude.com/workspaces/default/sessions/sesn_1',
    })
  })

  it('keeps the issue url when the agent does not start', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('api.github.com')) {
        return jsonResponse({ html_url: 'https://github.com/pfaff-designed/Pond-v4/issues/13' })
      }
      return jsonResponse({ error: 'no' }, 400)
    })

    await expect(fileBug('login 500s', config, fetchImpl as typeof fetch)).rejects.toThrow(
      'the issue is open and the agent did not start'
    )
  })
})
