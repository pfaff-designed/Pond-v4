/**
 * `useSaveAsTemplateSheet`'s `saveAsTemplate` success path (KAN-138): the sole
 * caller of `justSaved.set` — no other suite exercises this hook directly, so
 * this is the narrowest test for that wire.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { useSaveAsTemplateSheet } from '@/components/organisms/use-save-as-template-sheet'
import { justSaved } from '@/lib/templates/just-saved'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue({ id: 'page-1', blocks: [] }),
}))

const mockCreateTemplate = jest.fn()
jest.mock('@/lib/templates/client', () => ({
  createTemplate: (...args: unknown[]) => mockCreateTemplate(...args),
}))

beforeEach(() => {
  jest.clearAllMocks()
  justSaved.reset()
  mockCreateTemplate.mockResolvedValue({
    id: 'template-new',
    name: 'weeknight recipe',
    kind: 'page',
    blocks: [],
    origin: 'yours',
    createdAt: '',
    updatedAt: '',
  })
})

it('marks the saved template this session’s `yours · just saved` lead', async () => {
  const { result } = renderHook(() =>
    useSaveAsTemplateSheet({ pondId: 'pond-1', onOpen: () => {} })
  )

  act(() => result.current.start('page-1', 'weeknight recipe'))
  await waitFor(() => expect(result.current.open).toBe(true))

  await act(async () => {
    result.current.sheet!.onSubmit()
  })

  await waitFor(() => expect(mockCreateTemplate).toHaveBeenCalled())
  expect(justSaved.get('pond-1')).toBe('template-new')
})
