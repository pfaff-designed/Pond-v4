/**
 * @jest-environment node
 *
 * Unit tests for the pure SMS capture helpers (F24, #14). No network, no Supabase —
 * everything here is deterministic. Signature verification is checked with a locally
 * signed round-trip (the `sign()` helper independently implements Twilio's documented
 * algorithm) plus tamper / wrong-token / missing-signature negatives.
 */

import crypto from 'node:crypto'
import {
  verifyTwilioSignature,
  isAllowedSender,
  parseTwilioSms,
  deriveTitle,
  bodyWithMediaNote,
  buildCapturePageInput,
  messageSidOf,
  SMS_PROP_KEY,
} from '@/lib/capture/sms'

// Twilio's documented signature algorithm, reimplemented here as an oracle.
function sign(url: string, params: Record<string, string>, token: string): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url)
  return crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64')
}

describe('verifyTwilioSignature', () => {
  // Mirrors the shape of a real Twilio POST (URL with query string + form params).
  // `sign()` above is a second, independent implementation of Twilio's documented
  // algorithm, so a passing round-trip validates the module against the spec — and
  // the negatives below prove the guard actually rejects bad input.
  const url = 'https://mycompany.com/myapp.php?foo=1&bar=2'
  const params = {
    Digits: '1234',
    To: '+18005551212',
    From: '+14158675310',
    Caller: '+14158675310',
    CallSid: 'CA1234567890ABCDE',
  }
  const token = '12345'
  const valid = sign(url, params, token)

  it('accepts a correctly signed request', () => {
    expect(verifyTwilioSignature(url, params, valid, token)).toBe(true)
  })

  it('rejects a tampered param', () => {
    expect(verifyTwilioSignature(url, { ...params, Digits: '9999' }, valid, token)).toBe(false)
  })

  it('rejects a tampered URL', () => {
    expect(verifyTwilioSignature(url + '&evil=1', params, valid, token)).toBe(false)
  })

  it('rejects the wrong auth token', () => {
    expect(verifyTwilioSignature(url, params, valid, 'wrong-token')).toBe(false)
  })

  it('rejects a missing or empty signature', () => {
    expect(verifyTwilioSignature(url, params, null, token)).toBe(false)
    expect(verifyTwilioSignature(url, params, '', token)).toBe(false)
  })
})

describe('isAllowedSender', () => {
  const allow = '+15550001111, +15550002222'
  it('accepts a listed number (whitespace-tolerant)', () => {
    expect(isAllowedSender('+15550001111', allow)).toBe(true)
    expect(isAllowedSender(' +15550002222 ', allow)).toBe(true)
  })
  it('rejects an unlisted number', () => {
    expect(isAllowedSender('+15559999999', allow)).toBe(false)
  })
})

describe('parseTwilioSms', () => {
  it('parses the required fields and coerces NumMedia', () => {
    const sms = parseTwilioSms({
      From: '+15550001111',
      MessageSid: 'SM123',
      Body: 'buy milk',
      NumMedia: '2',
    })
    expect(sms).toEqual({
      from: '+15550001111',
      messageSid: 'SM123',
      body: 'buy milk',
      numMedia: 2,
    })
  })

  it('defaults Body and NumMedia when absent', () => {
    const sms = parseTwilioSms({ From: '+15550001111', MessageSid: 'SM123' })
    expect(sms).toEqual({ from: '+15550001111', messageSid: 'SM123', body: '', numMedia: 0 })
  })

  it('returns null when From or MessageSid is missing', () => {
    expect(parseTwilioSms({ MessageSid: 'SM123' })).toBeNull()
    expect(parseTwilioSms({ From: '+15550001111' })).toBeNull()
  })
})

describe('deriveTitle', () => {
  it('uses the first line, trimmed', () => {
    expect(deriveTitle('  first line\nsecond line')).toBe('first line')
  })
  it('truncates a long first line with an ellipsis', () => {
    const long = 'x'.repeat(120)
    const title = deriveTitle(long)
    expect(title.length).toBe(80)
    expect(title.endsWith('…')).toBe(true)
  })
  it('falls back when the body is empty', () => {
    expect(deriveTitle('   ')).toBe('(text message)')
  })
})

describe('bodyWithMediaNote', () => {
  it('leaves the body unchanged with no media', () => {
    expect(bodyWithMediaNote('hi', 0)).toBe('hi')
  })
  it('appends a note when media is present', () => {
    expect(bodyWithMediaNote('hi', 2)).toBe('hi\n\n(2 media omitted)')
  })
  it('is note-only when the body is empty (media-only MMS)', () => {
    expect(bodyWithMediaNote('', 1)).toBe('(1 media omitted)')
  })
})

describe('buildCapturePageInput', () => {
  const mintId = () => 'blk-1'
  it('builds a page under the given parent with a text block and dedupe prop', () => {
    const input = buildCapturePageInput(
      { from: '+15550001111', messageSid: 'SM123', body: 'buy milk\nand eggs', numMedia: 0 },
      { parentId: 'inbox-id', workspace: 'main', mintId }
    )
    expect(input).toEqual({
      parentId: 'inbox-id',
      type: 'page',
      title: 'buy milk',
      blocks: [{ id: 'blk-1', type: 'text', content: 'buy milk\nand eggs' }],
      props: { source: 'sms', [SMS_PROP_KEY]: { messageSid: 'SM123', from: '+15550001111' } },
      workspace: 'main',
    })
  })

  it('folds the media note into the block content', () => {
    const input = buildCapturePageInput(
      { from: '+15550001111', messageSid: 'SM9', body: 'look', numMedia: 3 },
      { parentId: null, workspace: 'main', mintId }
    )
    expect(input.blocks?.[0]).toMatchObject({ type: 'text', content: 'look\n\n(3 media omitted)' })
  })
})

describe('messageSidOf', () => {
  it('reads the sid from capture props', () => {
    expect(messageSidOf({ [SMS_PROP_KEY]: { messageSid: 'SM123' } })).toBe('SM123')
  })
  it('returns null when absent or malformed', () => {
    expect(messageSidOf({})).toBeNull()
    expect(messageSidOf(null)).toBeNull()
    expect(messageSidOf({ [SMS_PROP_KEY]: 'nope' })).toBeNull()
  })
})
