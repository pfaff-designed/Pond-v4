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

export interface SendOwnerEmailResult {
  id: string
}

export async function sendOwnerEmail(fields: OwnerEmailFields): Promise<SendOwnerEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is missing')
  }

  const ownerEmail = process.env.OWNER_EMAIL

  let response: Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Pond <noreply@pond.tools>',
        to: ownerEmail,
        subject: fields.subject,
        html: fields.html,
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    throw new Error(`Resend request failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!response.ok) {
    throw new Error(`Resend responded with ${response.status}`)
  }

  let data: { id?: string }
  try {
    data = (await response.json()) as { id?: string }
  } catch (error) {
    throw new Error(`Resend response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!data.id) {
    throw new Error('Resend returned no id')
  }

  return { id: data.id }
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
