import { CHANGE_LOG_NODE_ID } from '@/lib/change-log/log-page'
import { nextLastPageWrite, type LastPageRender } from './last-page'

const render = (pondId: string | null, nodeId: string | null): LastPageRender => ({
  pondId,
  nodeId,
})

const LIFE = 'p-life'
const NOISE = 'p-noise'
const PAGE_X = 'd9f6b2a0-1c3e-4a5b-8f9d-0a1b2c3d4e5f'
const PAGE_Y = 'aa11bb22-cc33-dd44-ee55-ff6677889900'

describe('nextLastPageWrite', () => {
  it('does not write on the first render — no prior snapshot', () => {
    expect(nextLastPageWrite(null, render(LIFE, PAGE_X), null)).toEqual({ write: false })
  })

  it('does not write on the render right after the active pond changed', () => {
    // The nodeId here is PAGE_X, carried over from the pond just left — writing
    // it under NOISE would record LIFE's page as NOISE's remembered page.
    expect(nextLastPageWrite(render(LIFE, PAGE_X), render(NOISE, PAGE_X), null)).toEqual({
      write: false,
    })
  })

  it('does not write when nodeId is unchanged from the prior render', () => {
    expect(nextLastPageWrite(render(LIFE, PAGE_X), render(LIFE, PAGE_X), null)).toEqual({
      write: false,
    })
  })

  it('does not write when nodeId already matches what is stored', () => {
    expect(nextLastPageWrite(render(LIFE, PAGE_Y), render(LIFE, PAGE_X), PAGE_X)).toEqual({
      write: false,
    })
  })

  it('does not write when the root is unchanged — nodeId and stored are both already null', () => {
    expect(nextLastPageWrite(render(LIFE, PAGE_X), render(LIFE, null), null)).toEqual({
      write: false,
    })
  })

  it('does not write when nodeId is the change log, not a page uuid', () => {
    expect(
      nextLastPageWrite(render(LIFE, PAGE_X), render(LIFE, CHANGE_LOG_NODE_ID), null)
    ).toEqual({ write: false })
  })

  it('writes the new nodeId on a same-pond change to a different remembered page', () => {
    expect(nextLastPageWrite(render(LIFE, PAGE_Y), render(LIFE, PAGE_X), PAGE_Y)).toEqual({
      write: true,
      lastPageId: PAGE_X,
    })
  })

  it('writes the new nodeId when nothing is stored yet', () => {
    expect(nextLastPageWrite(render(LIFE, null), render(LIFE, PAGE_X), null)).toEqual({
      write: true,
      lastPageId: PAGE_X,
    })
  })

  it('writes null on a same-pond move back to the root, clearing a remembered page', () => {
    expect(nextLastPageWrite(render(LIFE, PAGE_X), render(LIFE, null), PAGE_X)).toEqual({
      write: true,
      lastPageId: null,
    })
  })
})
