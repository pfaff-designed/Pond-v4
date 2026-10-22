/**
 * Composer attachments (#61) — the AITerminal paperclip, generalized from
 * CSV-only to images + documents:
 *   1. a valid image uploads and shows a removable chip, and Send carries it to
 *      `sendMessage` as a FileUIPart (so Pond can see it);
 *   2. the chip's × removes the attachment before send;
 *   3. an invalid type is rejected with a clear message (via the notify bridge)
 *      and nothing is attached;
 *   4. a .csv still routes to the existing CSV-context path (regression).
 *
 * Integration-style RTL test with the same mock harness as the flow-ui tests.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { openComposerIfClosed } from './helpers/open-composer'

// ── Module mocks — must be defined before imports ─────────────────────────

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: jest.fn().mockReturnValue(null) }),
}))

const mockUpload = jest.fn()
const mockGetPublicUrl = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    storage: {
      from: jest.fn(() => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl })),
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

const mockRequestNotify = jest.fn()
jest.mock('@/lib/deletion/notify-bridge', () => ({
  requestNotify: (...args: unknown[]) => mockRequestNotify(...args),
}))

const mockSendMessage = jest.fn()
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: [],
    sendMessage: mockSendMessage,
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
  })),
}))

import { AITerminal } from '@/components/organisms/AITerminal'

// ── Helpers ────────────────────────────────────────────────────────────────

function renderTerminal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AITerminal />
    </QueryClientProvider>
  )
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]')
  if (!input) throw new Error('composer file input not found')
  return input as HTMLInputElement
}

async function waitReady() {
  openComposerIfClosed()
  await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled())
}

beforeEach(() => {
  mockSendMessage.mockClear()
  mockRequestNotify.mockClear()
  mockUpload.mockReset().mockResolvedValue({ data: { path: 'p' }, error: null })
  mockGetPublicUrl
    .mockReset()
    .mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }))
})

describe('composer attachments (#61)', () => {
  it('attaches a valid image and sends it as a file part with the message', async () => {
    const user = userEvent.setup()
    const { container } = renderTerminal()
    await waitReady()

    const file = new File([new Uint8Array(4)], 'shot.png', { type: 'image/png' })
    fireEvent.change(fileInput(container), { target: { files: [file] } })

    // Chip appears (remove affordance names the file) once the upload settles.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove shot.png' })).toBeInTheDocument()
    )
    expect(mockUpload).toHaveBeenCalled()

    await user.type(screen.getByRole('textbox'), 'look at this')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalled())
    const [payload] = mockSendMessage.mock.calls[0]
    expect(payload.text).toContain('look at this')
    expect(payload.files).toEqual([
      {
        type: 'file',
        mediaType: 'image/png',
        url: expect.stringMatching(/^https:\/\/cdn\.example\/user-1\//),
        filename: 'shot.png',
      },
    ])

    // The attachment is single-turn: the chip clears after send.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Remove shot.png' })).not.toBeInTheDocument()
    )
  })

  it('remove-before-send: × drops the attachment and the message goes out without files', async () => {
    const user = userEvent.setup()
    const { container } = renderTerminal()
    await waitReady()

    const file = new File([new Uint8Array(4)], 'shot.png', { type: 'image/png' })
    fireEvent.change(fileInput(container), { target: { files: [file] } })
    const removeBtn = await screen.findByRole('button', { name: 'Remove shot.png' })
    fireEvent.click(removeBtn)
    expect(screen.queryByRole('button', { name: 'Remove shot.png' })).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox'), 'no attachment after all')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalled())
    const [payload] = mockSendMessage.mock.calls[0]
    expect(payload.files).toBeUndefined()
  })

  it('rejects an invalid type with a clear message and attaches nothing', async () => {
    const { container } = renderTerminal()
    await waitReady()

    const file = new File([new Uint8Array(4)], 'movie.mp4', { type: 'video/mp4' })
    fireEvent.change(fileInput(container), { target: { files: [file] } })

    await waitFor(() =>
      expect(mockRequestNotify).toHaveBeenCalledWith({
        message: expect.stringContaining('movie.mp4'),
      })
    )
    expect(mockUpload).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('still routes a .csv to the CSV-context pill (regression)', async () => {
    const { container } = renderTerminal()
    await waitReady()

    const csv = new File(['a,b\n1,2\n'], 'data.csv', { type: 'text/csv' })
    fireEvent.change(fileInput(container), { target: { files: [csv] } })

    // The CSV pill (not a storage attachment chip) appears.
    await waitFor(() => expect(screen.getByText('data.csv')).toBeInTheDocument())
    expect(mockUpload).not.toHaveBeenCalled()
  })
})
