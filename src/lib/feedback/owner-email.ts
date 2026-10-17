/**
 * The owner-notification email for a non-owner `report a problem` (KAN-336)
 * — pure field-building, so the HTML shape and escaping are unit-testable
 * without a server or a real Resend call.
 */

export interface BuildOwnerEmailFieldsInput {
  reporterEmail: string
  text: string
  pageTitle?: string
  url: string
  now: Date
  jiraUrl: string
}

export interface OwnerEmailFields {
  subject: string
  html: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildOwnerEmailFields({
  reporterEmail,
  text,
  pageTitle,
  url,
  now,
  jiraUrl,
}: BuildOwnerEmailFieldsInput): OwnerEmailFields {
  const firstLine = text.split('\n')[0]?.trim() ?? ''
  const subject = `pond · problem reported: ${firstLine}`

  const html = [
    `<p>reporter: ${escapeHtml(reporterEmail)}</p>`,
    `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`,
    `<p>page: ${escapeHtml(pageTitle ?? '')}</p>`,
    `<p>url: ${escapeHtml(url)}</p>`,
    `<p>time: ${escapeHtml(now.toISOString())}</p>`,
    `<p><a href="${escapeHtml(jiraUrl)}">${escapeHtml(jiraUrl)}</a></p>`,
  ].join('\n')

  return { subject, html }
}
