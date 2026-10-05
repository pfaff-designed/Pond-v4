/**
 * The PondComposer card (KAN-61, `PondComposer.dc.html`, ADR 0011) as the app
 * assembles it: the line, the ＋ and the send — and nothing the board does not
 * draw. The card's pixel values are pinned in `ComposerLine.stories`; this pins
 * the behaviour that rides on them.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
    expect(screen.getByRole('button', { name: 'Attach a file' })).toHaveTextContent('＋')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('draws nothing the board does not: no header strip, handle, mic, ghost line or research pill', async () => {
    const { container } = renderTerminal()
    await waitReady()

    expect(screen.queryByText(/context:/)).toBeNull()
    expect(screen.queryByRole('button', { name: /clear conversation/i })).toBeNull()
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.queryByRole('button', { name: /voice|dictate|microphone/i })).toBeNull()
    expect(screen.queryByText('research')).toBeNull()
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

describe('the composer card — collapse (held at its minimum until KAN-62)', () => {
  it('a remembered collapse shows a bare tab, and the tab brings the card back', async () => {
    window.localStorage.setItem('pond:terminal-collapsed', '1')
    renderTerminal()

    const tab = await screen.findByRole('button', { name: 'Expand terminal' })
    expect(screen.queryByRole('textbox', { name: 'Message Pond' })).toBeNull()
    fireEvent.click(tab)

    await waitReady()
    expect(window.localStorage.getItem('pond:terminal-collapsed')).toBe('0')
  })

  it('no longer remembers a dragged height', async () => {
    renderTerminal()
    await waitReady()
    expect(window.localStorage.getItem('pond:terminal-height')).toBeNull()
  })
})
