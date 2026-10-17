/**
 * The PondComposer card (`PondComposer.dc.html`) as the app
 * assembles it: the line, the ＋ and the send — and nothing the board does not
 * draw. The card's pixel values are pinned in `ComposerLine.stories`; this pins
 * the behaviour that rides on them.
 */

import React from 'react'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
let mockStatus = 'ready'
const mockStop = jest.fn()
const mockSendMessage = jest.fn()
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    stop: mockStop,
    status: mockStatus,
  })),
}))

import { AITerminal } from '@/components/organisms/AITerminal'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { ANSWER_PROSE_CLASS } from '@/components/molecules/Markdown'
import { dissolveConversation } from '@/lib/conversation/client'
import { requestComposerToggle } from '@/lib/terminal-focus'
import { COMPOSER_BOTTOM_INSET } from '@/lib/layout/composer-clearance'
import { COMPOSER_DEFAULT_HEIGHT, COMPOSER_TOP_CLEARANCE } from '@/lib/layout/composer-height'
import { RAIL_WIDTH_PX } from '@/lib/layout/rail-width'

const renderTerminal = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AITerminal />
    </QueryClientProvider>
  )

const line = () => screen.getByRole('textbox', { name: 'Message Pond' })
const waitReady = () => waitFor(() => expect(line()).toBeEnabled())

const askedOnce = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'what is blocking the renovation?' }] },
]

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  mockMessages = []
  mockStatus = 'ready'
})

describe('the composer card — rest', () => {
  it('is one line, a ＋ and a send that is off with nothing to send', async () => {
    renderTerminal()
    await waitReady()

    expect(line()).toHaveAttribute('placeholder', 'ask pond, or / for blocks')
    expect(line()).toHaveAttribute('rows', '1')
    expect(screen.getByRole('button', { name: 'Attach a file' }).querySelector('svg')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('draws nothing the board does not: no header strip, handle, mic or ghost line', async () => {
    const { container } = renderTerminal()
    await waitReady()

    expect(screen.queryByText(/context:/)).toBeNull()
    expect(screen.queryByRole('button', { name: /clear conversation/i })).toBeNull()
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.queryByRole('button', { name: /voice|dictate|microphone/i })).toBeNull()
    expect(screen.queryByText('send')).toBeNull()
    expect(container.querySelector('#ghost-suggestion')).toBeNull()
    expect(container.querySelector('.motion-focus-draw')).toBeNull()
    expect(screen.queryByText(/Talk with Pond/)).toBeNull()
  })

  it('the hint changes once the thread has a turn', async () => {
    mockMessages = askedOnce
    renderTerminal()
    await waitReady()
    expect(line()).toHaveAttribute('placeholder', 'reply, or ask something else')
  })
})

describe('the composer card — typing and sending', () => {
  it('send turns on with text and sends it', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitReady()

    await user.type(line(), 'what is blocking the renovation?')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalled())
    expect(mockSendMessage.mock.calls[0][0].text).toBe('what is blocking the renovation?')
    expect(line()).toHaveValue('')
  })

  it('＋ opens the attach flow', async () => {
    const { container } = renderTerminal()
    await waitReady()
    const picker = container.querySelector<HTMLInputElement>('input[type="file"]')!
    const click = jest.spyOn(picker, 'click').mockImplementation(() => undefined)

    fireEvent.click(screen.getByRole('button', { name: 'Attach a file' }))
    expect(click).toHaveBeenCalledTimes(1)
  })
})

describe('the composer card — research, the only road to the web', () => {
  const pill = () => screen.getByRole('button', { name: 'research' })
  const sentBody = (call: number) => mockSendMessage.mock.calls[call][1].body

  const findModeMenu = () => screen.findByRole('menu', { name: 'mode menu' })

  it('sits after ＋, off, and the first question carries research: false', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitReady()

    expect(screen.getByRole('button', { name: 'Attach a file' }).nextElementSibling).toBe(pill())
    expect(pill().className).not.toContain('bg-mn-text')

    await user.type(line(), 'what is the going rate for a worktop?')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    expect(sentBody(0).research).toBe(false)
  })

  it('arms via the mode menu, rides one question, and is off again for the next', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitReady()

    await user.click(pill())
    const menu = await findModeMenu()
    await user.click(within(menu).getByText('deep research'))
    expect(pill().className).toContain('bg-mn-text')

    await user.type(line(), 'what do worktops cost today?')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    expect(sentBody(0).research).toBe(true)
    expect(pill().className).not.toContain('bg-mn-text')

    await user.type(line(), 'and the fitting?')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(2))
    expect(sentBody(1).research).toBe(false)
  })

  it('arms then turns back off via the menu, without sending', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitReady()

    await user.click(pill())
    const menu = await findModeMenu()
    await user.click(within(menu).getByText('deep research'))
    expect(pill().className).toContain('bg-mn-text')

    await user.click(pill())
    const resetMenu = await findModeMenu()
    await user.click(within(resetMenu).getByText('ask'))
    expect(pill().className).not.toContain('bg-mn-text')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})

describe('the composer card — streaming', () => {
  beforeEach(() => {
    mockMessages = askedOnce
    mockStatus = 'streaming'
  })

  it('send is the stop square, and it stops the stream', async () => {
    renderTerminal()
    await waitReady()

    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    const stop = screen.getByRole('button', { name: 'Stop' })
    expect(stop).toBeEnabled()
    expect(stop.querySelector('rect')).not.toBeNull()
    fireEvent.click(stop)
    expect(mockStop).toHaveBeenCalledTimes(1)
  })

  it('esc in the line stops the stream and keeps what was typed', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitReady()

    await user.type(line(), 'and then?')
    await user.keyboard('{Escape}')
    expect(mockStop).toHaveBeenCalledTimes(1)
    expect(line()).toHaveValue('and then?')
  })

  it('enter mid-stream sends nothing', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitReady()

    await user.type(line(), 'and then?{Enter}')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})

const turn = (n: number) => [
  { id: `u${n}`, role: 'user', parts: [{ type: 'text', text: `question ${n}` }] },
  { id: `a${n}`, role: 'assistant', parts: [{ type: 'text', text: `answer ${n}` }] },
]
const thread = (turns: number) => Array.from({ length: turns }, (_, i) => turn(i + 1)).flat()

describe('the composer card — collapse is the session’s, and ⌘J is its key', () => {
  it('opens expanded every time: nothing about the collapse is remembered', async () => {
    window.localStorage.setItem('pond:terminal-collapsed', '1')
    renderTerminal()
    await waitReady()

    act(() => requestComposerToggle())
    await screen.findByRole('button', { name: 'Open composer' })
    expect(window.localStorage.getItem('pond:terminal-collapsed')).toBe('1')
    expect(window.localStorage.length).toBe(1)
  })

  it('⌘J closes the card to its tab, and brings it back with the line focused', async () => {
    const platform = jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    renderTerminal()
    await waitReady()

    act(() => requestComposerToggle())
    expect(screen.queryByRole('textbox', { name: 'Message Pond' })).toBeNull()
    expect(screen.getByText('⌘J')).toBeInTheDocument()

    act(() => requestComposerToggle())
    await waitReady()
    await waitFor(() => expect(line()).toHaveFocus())
    platform.mockRestore()
  })

  it('the tab brings the card back', async () => {
    renderTerminal()
    await waitReady()
    act(() => requestComposerToggle())

    fireEvent.click(screen.getByRole('button', { name: 'Open composer' }))
    await waitReady()
  })

  it('esc from the body closes the card, without remembering it', async () => {
    mockMessages = thread(1)
    renderTerminal()
    await waitReady()

    fireEvent.keyDown(screen.getByText('answer 1'), { key: 'Escape' })
    await screen.findByRole('button', { name: 'Open composer' })
    expect(window.localStorage.getItem('pond:terminal-collapsed')).toBeNull()
  })

  it('the tab says “pond answered” when an answer finished while it was closed', async () => {
    mockMessages = askedOnce
    mockStatus = 'streaming'
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    // A fresh element each time: the same one is a bail-out, and nothing would read
    // the mocked chat's new status.
    const tree = () => (
      <QueryClientProvider client={client}>
        <AITerminal />
      </QueryClientProvider>
    )
    const { rerender } = render(tree())
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeTruthy())

    act(() => requestComposerToggle())
    expect(screen.queryByText('pond answered')).toBeNull()

    mockMessages = thread(1)
    mockStatus = 'ready'
    rerender(tree())
    expect(await screen.findByText('pond answered')).toBeInTheDocument()

    // Opening it reads the answer; closing it again has nothing new to report.
    fireEvent.click(screen.getByRole('button', { name: /Open composer/ }))
    await waitReady()
    act(() => requestComposerToggle())
    expect(screen.queryByText('pond answered')).toBeNull()
  })

  it('no longer remembers a dragged height', async () => {
    renderTerminal()
    await waitReady()
    expect(window.localStorage.getItem('pond:terminal-height')).toBeNull()
  })
})

describe('the composer card — the thread: head, fold, turns', () => {
  const youRows = () => document.querySelectorAll('[data-part="you-row"]')

  it('one turn draws no head — the head names a thread, not a question', async () => {
    mockMessages = thread(1)
    renderTerminal()
    await waitReady()
    expect(document.querySelector('[data-part="thread-head"]')).toBeNull()
    expect(document.querySelectorAll('[data-part="turn"]')).toHaveLength(1)
  })

  it('names the thread and counts its turns; ✕ closes it and new thread clears it', async () => {
    mockMessages = thread(2)
    renderTerminal()
    await waitReady()

    const head = document.querySelector<HTMLElement>('[data-part="thread-head"]')!
    expect(head).toHaveTextContent('thread · life')
    expect(head).toHaveTextContent('2 turns')

    fireEvent.click(screen.getByRole('button', { name: 'new thread' }))
    await waitFor(() => expect(dissolveConversation).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(await screen.findByRole('button', { name: 'Open composer' })).toBeInTheDocument()
  })

  it('a multi-turn thread draws exactly one close — the head’s, not the chips row’s too', async () => {
    mockMessages = thread(2)
    renderTerminal()
    await waitReady()

    expect(document.querySelector('[data-part="thread-head"]')).not.toBeNull()
    expect(screen.getAllByRole('button', { name: 'close' })).toHaveLength(1)
  })

  it('only the latest turn stays open: the earlier ones fold, and the fold opens them', async () => {
    mockMessages = thread(3)
    renderTerminal()
    await waitReady()

    expect(document.querySelector('[data-part="thread-head"]')).toHaveTextContent('3 turns')
    expect(youRows()).toHaveLength(1)
    expect(screen.queryByText('question 2')).toBeNull()
    expect(screen.getByText('question 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '2 earlier turns' }))
    expect(youRows()).toHaveLength(3)
    expect(screen.queryByText(/earlier turn/)).toBeNull()
  })

  it('a second turn folds the first', async () => {
    mockMessages = thread(2)
    renderTerminal()
    await waitReady()
    expect(youRows()).toHaveLength(1)
    expect(screen.getByRole('button', { name: '1 earlier turn' })).toBeInTheDocument()
  })

  it('one turn folds nothing', async () => {
    mockMessages = thread(1)
    renderTerminal()
    await waitReady()
    expect(youRows()).toHaveLength(1)
    expect(screen.queryByText(/earlier turn/)).toBeNull()
  })

  it('a turn holds the question and its answer under a “pond” eyebrow, in the sans', async () => {
    mockMessages = thread(1)
    renderTerminal()
    await waitReady()

    const turnEl = document.querySelector('[data-part="turn"]')!
    expect(turnEl).toContainElement(screen.getByText('question 1'))
    const answer = turnEl.querySelector('[data-part="answer"]')!
    expect(within(answer as HTMLElement).getByText('pond').className).toBe(pageEyebrowClass)
    // The answer voice itself (15px sans) is pinned in ComposerThread.stories.
    expect(screen.getByText('answer 1').className).toContain(ANSWER_PROSE_CLASS)
  })
})

describe('the composer card — a reachable close in every one-turn state', () => {
  it('a one-turn error thread draws exactly one close, which collapses the card', async () => {
    mockMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'question 1' }] },
      { id: 'a1', role: 'assistant', parts: [] },
    ]
    renderTerminal()
    await waitReady()

    expect(document.querySelector('[data-part="error-row"]')).not.toBeNull()
    expect(screen.getAllByRole('button', { name: 'close' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(await screen.findByRole('button', { name: 'Open composer' })).toBeInTheDocument()
  })

  it('a one-turn diff-only thread draws exactly one close, which collapses the card even while the diff is still pending', async () => {
    mockMessages = [
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
    renderTerminal()
    await waitReady()

    expect(screen.getByRole('group', { name: '1 diff' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'close' })).toHaveLength(1)

    // An explicit × click overrides the hold outright — the diff stays
    // proposed in the change log, only the card collapses.
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(await screen.findByRole('button', { name: 'Open composer' })).toBeInTheDocument()

    // Reopening shows the same pending card — the proposal was never touched.
    fireEvent.click(screen.getByRole('button', { name: 'Open composer' }))
    expect(screen.getByRole('group', { name: '1 diff' })).toBeInTheDocument()
  })
})

describe('the composer card — maximize fills the canvas (KAN-323)', () => {
  const card = () => screen.getByRole('region', { name: 'composer' })

  it('opens unmaximized, click maximize fills the canvas, click again restores the dragged height', async () => {
    mockMessages = thread(1)
    renderTerminal()
    await waitReady()

    expect(card().style.top).toBe('')
    expect(card().getAttribute('data-maximized')).toBeNull()
    expect(card().style.height).toBe(`${COMPOSER_DEFAULT_HEIGHT}px`)

    fireEvent.click(screen.getByRole('button', { name: 'maximize' }))
    expect(card().getAttribute('data-maximized')).toBe('true')
    expect(card().style.top).toBe(`${COMPOSER_TOP_CLEARANCE}px`)
    expect(card().style.bottom).toBe('var(--composer-card-bottom)')
    expect(card().style.getPropertyValue('--composer-card-bottom')).toBe(`${COMPOSER_BOTTOM_INSET}px`)
    expect(card().style.left).toBe(`${20 + RAIL_WIDTH_PX + 20}px`)
    expect(card().style.height).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'restore' }))
    expect(card().getAttribute('data-maximized')).toBeNull()
    expect(card().style.top).toBe('')
    expect(card().style.height).toBe(`${COMPOSER_DEFAULT_HEIGHT}px`)
  })

  it('esc restores a maximized card instead of stepping the composer back', async () => {
    const user = userEvent.setup()
    mockMessages = thread(1)
    renderTerminal()
    await waitReady()

    await user.click(screen.getByRole('button', { name: 'maximize' }))
    expect(card().getAttribute('data-maximized')).toBe('true')

    await user.keyboard('{Escape}')
    expect(card().getAttribute('data-maximized')).toBeNull()
    // Esc only undid the maximize — the composer itself is still open.
    expect(screen.queryByRole('button', { name: 'Open composer' })).toBeNull()
  })
})

describe('the composer card — minimize keeps the thread (KAN-323)', () => {
  const card = () => screen.getByRole('region', { name: 'composer' })

  it('click minimize hides the thread at rest height; typing brings it back at the same height', async () => {
    const user = userEvent.setup()
    mockMessages = thread(1)
    renderTerminal()
    await waitReady()

    expect(card().getAttribute('data-minimized')).toBeNull()
    expect(card().style.height).toBe(`${COMPOSER_DEFAULT_HEIGHT}px`)

    await user.click(screen.getByRole('button', { name: 'minimize' }))
    expect(card().getAttribute('data-minimized')).toBe('true')
    expect(card().style.height).toBe('')
    expect(document.querySelector('[data-part="composer-thread"]')).toHaveAttribute('hidden')

    await user.type(line(), 'still here?')
    expect(card().getAttribute('data-minimized')).toBeNull()
    expect(card().style.height).toBe(`${COMPOSER_DEFAULT_HEIGHT}px`)
    expect(document.querySelector('[data-part="composer-thread"]')).not.toHaveAttribute('hidden')
  })

  it('focusing the line while minimized un-minimizes it even with no text typed', async () => {
    const user = userEvent.setup()
    mockMessages = thread(1)
    renderTerminal()
    await waitReady()

    await user.click(screen.getByRole('button', { name: 'minimize' }))
    expect(card().getAttribute('data-minimized')).toBe('true')

    await user.click(line())
    expect(card().getAttribute('data-minimized')).toBeNull()
  })
})

describe('the composer card — maximize never survives minimize/close/new thread (KAN-323)', () => {
  // `getByRole` can't find the card once closed sets `aria-hidden` — same
  // reason `kan-323-path.test.tsx`'s own `card()` reads the part attribute.
  const card = () => document.querySelector('[data-part="composer-card"]') as HTMLElement

  it('maximize then minimize gives the one-line rest composer, not a maximized empty slab', async () => {
    const user = userEvent.setup()
    mockMessages = thread(2)
    renderTerminal()
    await waitReady()

    await user.click(screen.getByRole('button', { name: 'maximize' }))
    expect(card().getAttribute('data-maximized')).toBe('true')

    await user.click(screen.getByRole('button', { name: 'minimize' }))
    expect(card().getAttribute('data-maximized')).toBeNull()
    expect(card().getAttribute('data-minimized')).toBe('true')
    expect(card().style.top).toBe('')
    expect(card().style.height).toBe('')
  })

  it('maximize then close, then ⌘J reopens unmaximized', async () => {
    const user = userEvent.setup()
    mockMessages = thread(2)
    renderTerminal()
    await waitReady()

    await user.click(screen.getByRole('button', { name: 'maximize' }))
    expect(card().getAttribute('data-maximized')).toBe('true')

    await user.click(screen.getByRole('button', { name: 'close' }))
    expect(card()).toHaveAttribute('data-collapsed', 'true')

    act(() => requestComposerToggle())
    await waitReady()
    expect(card().getAttribute('data-maximized')).toBeNull()
    expect(card().style.height).toBe(`${COMPOSER_DEFAULT_HEIGHT}px`)
  })

  it('maximize then new thread leaves the composer unmaximized', async () => {
    const user = userEvent.setup()
    mockMessages = thread(2)
    renderTerminal()
    await waitReady()

    await user.click(screen.getByRole('button', { name: 'maximize' }))
    expect(card().getAttribute('data-maximized')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'new thread' }))
    await waitFor(() => expect(dissolveConversation).toHaveBeenCalled())
    expect(card().getAttribute('data-maximized')).toBeNull()
  })
})
