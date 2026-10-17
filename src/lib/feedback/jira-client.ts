/**
 * Thin Jira REST wrapper for `report a problem` (KAN-335) — the route handler
 * calls these, tests mock `fetch`, nothing here ever reaches the real Jira API.
 */

import type { FeedbackIssue } from './build-issue'

const NOW_QUEUE_JQL = 'project = KAN AND labels = now AND statusCategory != Done ORDER BY rank'

export interface CreateJiraIssueResult {
  key: string
  url: string
}

function authHeader(): string {
  const email = process.env.JIRA_EMAIL
  const apiKey = process.env.JIRA_API_KEY
  return `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`
}

export async function createJiraIssue(payload: FeedbackIssue): Promise<CreateJiraIssueResult> {
  const baseUrl = process.env.JIRA_BASE_URL

  const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        project: { key: 'KAN' },
        issuetype: { name: 'Task' },
        summary: payload.summary,
        description: payload.descriptionAdf,
        labels: payload.labels,
      },
    }),
  })

  const data = (await response.json()) as { key?: string }
  if (!response.ok || !data.key) {
    throw new Error(`Jira issue creation failed: ${response.status}`)
  }
  return { key: data.key, url: `${baseUrl}/browse/${data.key}` }
}

export async function rankFirstInNowQueue(key: string): Promise<boolean> {
  const baseUrl = process.env.JIRA_BASE_URL
  const headers = {
    Authorization: authHeader(),
    'Content-Type': 'application/json',
  }

  try {
    const searchUrl = `${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(NOW_QUEUE_JQL)}&maxResults=2&fields=key`
    const searchResponse = await fetch(searchUrl, { headers })
    if (!searchResponse.ok) return false

    const searchData = (await searchResponse.json()) as { issues?: { key: string }[] }
    const issueAheadOfTheNewOne = searchData.issues?.find((issue) => issue.key !== key)
    if (!issueAheadOfTheNewOne) return true

    const rankResponse = await fetch(`${baseUrl}/rest/agile/1.0/issue/rank`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ issues: [key], rankBeforeIssue: issueAheadOfTheNewOne.key }),
    })

    return rankResponse.ok
  } catch {
    return false
  }
}

export async function addIssueComment(key: string, text: string): Promise<boolean> {
  const baseUrl = process.env.JIRA_BASE_URL

  try {
    const response = await fetch(`${baseUrl}/rest/api/3/issue/${key}/comment`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        },
      }),
    })

    if (!response.ok) console.error(`addIssueComment failed for ${key}: ${response.status}`)
    return response.ok
  } catch (error) {
    console.error(`addIssueComment failed for ${key}:`, error)
    return false
  }
}
