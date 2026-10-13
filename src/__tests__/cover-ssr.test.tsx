/**
 * @jest-environment node
 *
 * KAN-195: the cover's place label and clock come from the browser's own
 * timezone and clock, which the server can't know — proving the server's
 * render carries no such text at all (so the client's first pass, which
 * matches it before filling in the real values, can never disagree).
 */
import { renderToString } from 'react-dom/server'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

import { Cover } from '@/components/organisms/Cover'

describe('Cover on the server', () => {
  it('there is no window here', () => {
    expect(typeof window).toBe('undefined')
  })

  it('renders the header with no place or clock text yet', () => {
    const html = renderToString(<Cover />)

    expect(html).toContain('>pond<')
    expect(html).toContain('a make noise production')
    expect(html).not.toMatch(/\d{2}:\d{2}/)
    expect(html).not.toMatch(
      /monday|tuesday|wednesday|thursday|friday|saturday|sunday/
    )
  })
})
