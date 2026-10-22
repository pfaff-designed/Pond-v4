/**
 * `/bug` in the composer. The first token is the skill. Anything after it is
 * the report the cloud agent receives. `/buggy` is ordinary text.
 */

export interface BugCommand {
  report: string
}

export function parseBugCommand(text: string): BugCommand | null {
  const match = /^\/bug(?:\s+([\s\S]*))?$/.exec(text.trim())
  if (!match) return null
  return { report: (match[1] ?? '').trim() }
}

/**
 * The query under an open skill menu, or null when the line is not choosing a
 * skill. The menu stays up through `/`, `/b`, `/bug`, and `/bug ` with nothing
 * after it, and closes once the report starts.
 */
export function composerSkillQuery(value: string): string | null {
  if (!value.startsWith('/')) return null
  const space = value.search(/\s/)
  const token = space === -1 ? value : value.slice(0, space)
  const rest = space === -1 ? '' : value.slice(space).trim()
  if (rest.length > 0) return null
  const query = token.slice(1)
  if (query !== '' && !'bug'.startsWith(query)) return null
  return query
}

/** The GitHub issue title: the report's first line, capped so the API accepts it. */
export function bugTitle(report: string): string {
  const line = (report.split('\n')[0] ?? '').replace(/\s+/g, ' ').trim()
  if (line.length <= 120) return line
  const cut = line.slice(0, 120)
  const space = cut.lastIndexOf(' ')
  return (space > 40 ? cut.slice(0, space) : cut).trim()
}

export function bugAnswer(
  ok: boolean,
  body: { issueUrl?: string; transcriptUrl?: string; error?: string }
): string {
  if (ok && body.issueUrl && body.transcriptUrl) {
    return `Filed ${body.issueUrl}\n\nThe agent is working on it.\n${body.transcriptUrl}`
  }
  if (body.issueUrl) {
    const why = body.error ? ` ${body.error}` : ''
    return `Filed ${body.issueUrl}\n\nThe agent did not start.${why}`
  }
  return body.error ?? 'the issue was not filed'
}
