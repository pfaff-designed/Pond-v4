/**
 * KAN-323 path test — the real `AITerminal`, `localStorage` cleared, walked
 * end to end per `PATH_STEPS`: opens at 392 with one control set and a
 * clickable action row, drags the grip, maximizes/restores (click and Esc),
 * minimizes and un-minimizes by focus, closes and reopens (⌘J) at the same
 * height and thread with a pending proposal untouched, and zen draws the
 * same three controls. Same mocked harness as `composer-card.test.tsx`.
 */

import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { openComposerIfClosed } from './helpers/open-composer'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: jest.fn().mockReturnValue(null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn().mockResolvedValue({
    id: 'conv-1',
    messages: [],
    resolutions: { changes: {}, creates: {}, skipped: {} },
  }),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

let mockMessages: unknown[] = []
const mockSendMessage = jest.fn()
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    stop: jest.fn(),
    status: 'ready',
  })),
}))

import { AITerminal } from '@/components/organisms/AITerminal'
import { ZenPill } from '@/components/organisms/ZenPill'
import { useZen, ZenComposerChrome, ZenProvider } from '@/lib/layout/zen'
import { requestComposerToggle } from '@/lib/terminal-focus'
import { COMPOSER_DEFAULT_HEIGHT } from '@/lib/layout/composer-height'

const renderTerminal = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AITerminal />
    </QueryClientProvider>
  )

const line = () => screen.getByRole('textbox', { name: 'Message Pond' })
// `aria-hidden` zeroes an element's computed accessible name, so a role
// query can't find the card once `collapsed` sets it — read the card by its
// own data-part, the same selector `shell-reskin.test.tsx` settled on.
const card = () => document.querySelector('[data-part="composer-card"]') as HTMLElement
const waitReady = () => {
  openComposerIfClosed()
  return waitFor(() => expect(line()).toBeEnabled())
}

const pointer = (type: string, clientY: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { pointerId: 1, clientY })
  return event
}

/** A diff-only, one-turn thread — the fixture `composer-card.test.tsx` and
 *  `AITerminal.test.tsx`'s own KAN-325 pending-proposal test already use. */
const PENDING_PROPOSAL = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'change alpha to apple' }] },
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      {
        type: 'tool-propose_changes',
        toolCallId: 'pc1',
        state: 'input-available',
        input: {
          changes: [{ op: 'create', data: { type: 'text', content: 'apple one' } }],
        },
      },
    ],
  },
]

type RectInit = { left: number; right: number; top: number; bottom: number }

/** A minimal, scoped `elementFromPoint`: only elements explicitly given a rect
 *  can be hit, a hit is dropped if it is `aria-hidden` or carries the tab's own
 *  `pointer-events-none` class (the real guards the slide-off work relies on),
 *  and the deepest surviving hit (never an ancestor of another survivor) wins —
 *  the same "most specific element" rule a browser's own hit-test applies. */
function stubElementFromPoint(assignments: Array<[Element, RectInit]>) {
  const rectFor = new Map<Element, DOMRect>()
  for (const [el, r] of assignments) {
    const rect = {
      x: r.left,
      y: r.top,
      width: r.right - r.left,
      height: r.bottom - r.top,
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      toJSON() {
        return this
      },
    } as DOMRect
    rectFor.set(el, rect)
    jest.spyOn(el, 'getBoundingClientRect').mockReturnValue(rect)
  }
  const original = document.elementFromPoint
  document.elementFromPoint = ((x: number, y: number) => {
    const within = [...rectFor.entries()].filter(
      ([, r]) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    )
    // `classList.contains` is an exact-token check — a plain `.includes` on the
    // class string would also match Tailwind arbitrary variants like
    // `[&_svg]:pointer-events-none`, which style a descendant, not this element.
    const hits = within
      .filter(([el]) => el.getAttribute('aria-hidden') !== 'true')
      .filter(([el]) => !el.classList.contains('pointer-events-none'))
      .map(([el]) => el)
    return hits.find((el) => !hits.some((other) => other !== el && el.contains(other))) ?? null
  }) as typeof document.elementFromPoint
  return () => {
    document.elementFromPoint = original
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  mockMessages = []
})

describe('KAN-323 path test — the composer’s window controls, walked end to end', () => {
  it('opens at 392 with one clickable control set, drags, maximizes, minimizes, closes and reopens at the same height and thread — the pending proposal stays pending throughout', async () => {
    const user = userEvent.setup()
    mockMessages = PENDING_PROPOSAL
    renderTerminal()
    await waitReady()

    // PATH_STEPS 2 — opens at 392, exactly one control set, nothing scrolled.
    expect(card().style.height).toBe(`${COMPOSER_DEFAULT_HEIGHT}px`)
    expect(screen.getByRole('group', { name: '1 diff' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'close' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'minimize' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'maximize' })).toHaveLength(1)

    const reject = screen.getByRole('button', { name: 'reject' })
    const tab = document.querySelector('[data-part="composer-tab"]')!
    const buttonRect = { left: 450, right: 530, top: 650, bottom: 682 }
    const unstub = stubElementFromPoint([
      [reject, buttonRect],
      [card(), { left: 300, right: 700, top: 330, bottom: 722 }],
      // The persistently-mounted tab really can sit under the same screen
      // region — only its own `pointer-events-none`/`aria-hidden` keep it
      // from winning the hit-test while the card is open.
      [tab, { left: 300, right: 700, top: 700, bottom: 730 }],
    ])
    const centreX = (buttonRect.left + buttonRect.right) / 2
    const centreY = (buttonRect.top + buttonRect.bottom) / 2
    expect(document.elementFromPoint(centreX, centreY)).toBe(reject)
    unstub()

    // PATH_STEPS 3 — drag the grip up: the card grows from its measured height.
    const offsetHeight = jest
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockReturnValue(COMPOSER_DEFAULT_HEIGHT)
    const handle = screen.getByRole('separator', { name: 'Resize composer' })
    act(() => {
      handle.dispatchEvent(pointer('pointerdown', 500))
      handle.dispatchEvent(pointer('pointermove', 400))
      handle.dispatchEvent(pointer('pointerup', 400))
    })
    offsetHeight.mockRestore()
    const draggedHeight = COMPOSER_DEFAULT_HEIGHT + 100
    expect(card().style.height).toBe(`${draggedHeight}px`)

    // PATH_STEPS 4 — maximize fills the canvas; a click restores the dragged
    // height, and so, separately, does Esc.
    await user.click(screen.getByRole('button', { name: 'maximize' }))
    expect(card().getAttribute('data-maximized')).toBe('true')
    expect(card().style.height).toBe('')
    await user.click(screen.getByRole('button', { name: 'restore' }))
    expect(card().getAttribute('data-maximized')).toBeNull()
    expect(card().style.height).toBe(`${draggedHeight}px`)

    await user.click(screen.getByRole('button', { name: 'maximize' }))
    expect(card().getAttribute('data-maximized')).toBe('true')
    await user.keyboard('{Escape}')
    expect(card().getAttribute('data-maximized')).toBeNull()
    expect(card().style.height).toBe(`${draggedHeight}px`)

    // PATH_STEPS 5 — minimize to one line; focusing the line reopens the
    // thread at its last (dragged) height.
    await user.click(screen.getByRole('button', { name: 'minimize' }))
    expect(card().getAttribute('data-minimized')).toBe('true')
    expect(document.querySelector('[data-part="composer-thread"]')).toHaveAttribute('hidden')
    await user.click(line())
    expect(card().getAttribute('data-minimized')).toBeNull()
    expect(card().style.height).toBe(`${draggedHeight}px`)

    // PATH_STEPS 6/7 — close slides the card off screen, leaving the tab;
    // ⌘J (the tab's own key) brings it back at the same height and thread —
    // the pending proposal was never touched.
    await user.click(screen.getByRole('button', { name: 'close' }))
    expect(card()).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByRole('button', { name: 'Open composer' })).toBeInTheDocument()

    act(() => requestComposerToggle())
    await waitReady()
    expect(card().getAttribute('data-collapsed')).toBeNull()
    expect(card().style.height).toBe(`${draggedHeight}px`)
    expect(screen.getByRole('group', { name: '1 diff' })).toBeInTheDocument()
  })
})

describe('KAN-323 path test — zen draws the same three controls', () => {
  function renderInZen() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const root = React.createRef<HTMLDivElement>()
    const Entered = () => {
      const { enterZen } = useZen()
      return (
        <>
          <button onClick={() => enterZen({ onInk: false })}>enter</button>
          <ZenComposerChrome>
            <QueryClientProvider client={queryClient}>
              <AITerminal />
            </QueryClientProvider>
          </ZenComposerChrome>
          <ZenPill />
        </>
      )
    }
    const view = render(
      <div ref={root}>
        <ZenProvider scrollRoot={root}>
          <Entered />
        </ZenProvider>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))
    return view
  }

  it('shows minimize, maximize and close — exactly one set, zen included', async () => {
    mockMessages = PENDING_PROPOSAL
    renderInZen()
    await waitReady()

    const askPond = screen.getByRole('button', { name: 'ask pond' })
    fireEvent.click(askPond)
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'true'))

    expect(screen.getAllByRole('button', { name: 'minimize' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'maximize' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'close' })).toHaveLength(1)

    // KAN-325: close works with the proposal still pending, and reopening
    // (the mark again) shows the same untouched card.
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'false'))
    fireEvent.click(askPond)
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByRole('group', { name: '1 diff' })).toBeInTheDocument()
  })
})
