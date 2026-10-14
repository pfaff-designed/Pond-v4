/**
 * @jest-environment node
 *
 * KAN-186: `ZenPill` is mounted unconditionally under the `(app)` layout
 * (`WorkspaceShell.tsx`) and reads `useComposerOpen()` before its own
 * `zen` guard — so every app page's server render exercises the hook,
 * even with zen off. Missing `getServerSnapshot` makes React throw here.
 */
import { renderToString } from 'react-dom/server'

import { ZenPill } from '@/components/organisms/ZenPill'

describe('ZenPill on the server', () => {
  it('there is no window here', () => {
    expect(typeof window).toBe('undefined')
  })

  it('renders without throwing (zen off renders nothing)', () => {
    expect(() => renderToString(<ZenPill />)).not.toThrow()
    expect(renderToString(<ZenPill />)).toBe('')
  })
})
