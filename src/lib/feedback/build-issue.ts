/**
 * The Jira issue body for a `report a problem` submission (KAN-335) — pure,
 * so the route handler stays a thin fetch wrapper and this shape is
 * unit-testable without a server or a real Jira call.
 */

const SUMMARY_MAX_CHARS = 80

export interface BuildFeedbackIssueInput {
  text: string
  pageId?: string
  pageTitle?: string
  url: string
  reporterEmail: string
  userAgent: string
  now: Date
  isOwner: boolean
}

interface AdfParagraph {
  type: 'paragraph'
  content: [{ type: 'text'; text: string }]
}

export interface AdfDoc {
  type: 'doc'
  version: 1
  content: AdfParagraph[]
}

export interface FeedbackIssue {
  summary: string
  descriptionAdf: AdfDoc
  labels: string[]
}

function paragraph(text: string): AdfParagraph {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

export function buildFeedbackIssue({
  text,
  pageTitle,
  url,
  reporterEmail,
  userAgent,
  now,
  isOwner,
}: BuildFeedbackIssueInput): FeedbackIssue {
  const firstLine = text.split('\n')[0]?.trim() ?? ''
  const summary = firstLine.slice(0, SUMMARY_MAX_CHARS)

  return {
    summary,
    descriptionAdf: {
      type: 'doc',
      version: 1,
      content: [
        paragraph(text),
        paragraph(`reporter: ${reporterEmail}`),
        paragraph(`page: ${pageTitle ?? ''}`),
        paragraph(`url: ${url}`),
        paragraph(`user agent: ${userAgent}`),
        paragraph(`time: ${now.toISOString()}`),
      ],
    },
    labels: ['feedback', isOwner ? 'from-owner' : 'from-user'],
  }
}
