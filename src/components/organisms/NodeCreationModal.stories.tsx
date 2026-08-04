'use client'
// Storybook scaffold — convert exports to StoryObj<typeof meta> once Storybook is installed.
// Mocks for useChat, createClient, and QueryClientProvider will be needed as story decorators.

import React, { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NodeCreationModal } from './NodeCreationModal'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function StoryWrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

/** Default — modal open, awaiting user input. */
export function Default() {
  const [isOpen, setIsOpen] = useState(true)
  return (
    <StoryWrapper>
      <NodeCreationModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onCreated={() => setIsOpen(false)}
      />
    </StoryWrapper>
  )
}

/**
 * WithActionCard — modal in the state where the AI has proposed an entity.
 * In a real Storybook setup, seed this by mocking useChat to return messages
 * containing a fenced JSON block with a valid ActionCard.
 */
export function WithActionCard() {
  const [isOpen, setIsOpen] = useState(true)
  return (
    <StoryWrapper>
      <NodeCreationModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onCreated={(id) => {
          console.log('Created node:', id)
          setIsOpen(false)
        }}
      />
    </StoryWrapper>
  )
}
