/**
 * The change log record page's view model — src/lib/change-log/record-page.ts.
 *
 * What it pins: the route's query shape, `?nodeId=__change_log__&record=<id>`.
 */

import { changeLogRecordUrl, RECORD_PARAM } from '@/lib/change-log/record-page'

describe('changeLogRecordUrl', () => {
  it('builds the change log route with the record id as a query param', () => {
    const url = changeLogRecordUrl('rec-1')
    const params = new URLSearchParams(url.slice(1))
    expect(params.get('nodeId')).toBe('__change_log__')
    expect(params.get(RECORD_PARAM)).toBe('rec-1')
  })
})
