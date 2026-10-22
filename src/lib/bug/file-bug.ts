/**
 * Files one GitHub issue and starts the Pond bug cloud agent on it.
 * The route calls this. Tests pass their own fetch. Nothing here reads a
 * token back out of a response.
 */

import { bugTitle } from './command'

const REPO = 'pfaff-designed/Pond-v4'
const REPO_URL = `https://github.com/${REPO}`
const REQUIRED = [
  'ANTHROPIC_API_KEY',
  'GITHUB_AGENT_TOKEN',
  'CLAUDE_ENVIRONMENT_ID',
  'CLAUDE_VAULT_ID',
  'CLAUDE_AGENT_ID',
] as const

export interface BugConfig {
  anthropicApiKey: string
  githubToken: string
  environmentId: string
  vaultId: string
  agentId: string
}

export interface FiledBug {
  issueUrl: string
  sessionId: string
  transcriptUrl: string
}

export class BugSessionError extends Error {
  readonly issueUrl: string

  constructor(issueUrl: string) {
    super('the issue is open and the agent did not start')
    this.name = 'BugSessionError'
    this.issueUrl = issueUrl
  }
}

export function bugConfigFromEnv(env: Partial<NodeJS.ProcessEnv> = process.env): BugConfig | null {
  const values = REQUIRED.map((name) => env[name]?.trim() ?? '')
  if (values.some((value) => value === '')) return null
  const [anthropicApiKey, githubToken, environmentId, vaultId, agentId] = values as [
    string,
    string,
    string,
    string,
    string,
  ]
  return { anthropicApiKey, githubToken, environmentId, vaultId, agentId }
}

export async function fileBug(
  report: string,
  config: BugConfig,
  fetchImpl: typeof fetch = fetch
): Promise<FiledBug> {
  const title = bugTitle(report)
  const issueResponse = await fetchImpl(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body: report, labels: ['bug'] }),
  })
  const issue = (await issueResponse.json().catch(() => null)) as { html_url?: string } | null
  if (!issueResponse.ok || !issue?.html_url) {
    throw new Error('could not open the github issue')
  }
  const issueUrl = issue.html_url
  const number = issueUrl.split('/').pop()

  const sessionResponse = await fetchImpl('https://api.anthropic.com/v1/sessions', {
    method: 'POST',
    headers: {
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'managed-agents-2026-04-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      agent: config.agentId,
      environment_id: config.environmentId,
      vault_ids: [config.vaultId],
      title: title.slice(0, 500),
      resources: [
        {
          type: 'github_repository',
          url: REPO_URL,
          mount_path: '/workspace/repo',
          authorization_token: config.githubToken,
          checkout: { type: 'branch', name: 'main' },
        },
      ],
      initial_events: [
        {
          type: 'user.message',
          content: [
            {
              type: 'text',
              text: `Fix GitHub issue #${number}: ${issueUrl}\n\n${title}\n\n${report}`,
            },
          ],
        },
      ],
    }),
  })
  const session = (await sessionResponse.json().catch(() => null)) as { id?: string } | null
  if (!sessionResponse.ok || !session?.id) {
    throw new BugSessionError(issueUrl)
  }
  return {
    issueUrl,
    sessionId: session.id,
    transcriptUrl: `https://platform.claude.com/workspaces/default/sessions/${session.id}`,
  }
}
