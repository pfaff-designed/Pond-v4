import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { useState } from 'react'
import { GhostSuggestion, useGhostKeyHandler } from './GhostSuggestion'

/** Harness that wires up a real textarea + ghost. */
function Harness({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: string | null
  onAccept: (t: string) => void
  onDismiss: () => void
}) {
  const [input, setInput] = useState('')
  const handleGhostKey = useGhostKeyHandler({
    suggestion,
    inputValue: input,
    onAccept: (t) => {
      setInput(t)
      onAccept(t)
    },
    onDismiss,
  })

  return (
    <div className="relative w-80">
      {/* Ghost rendered behind the textarea */}
      <GhostSuggestion
        suggestion={suggestion}
        inputValue={input}
        onAccept={(t) => {
          setInput(t)
          onAccept(t)
        }}
        onDismiss={onDismiss}
        id="ghost-hint"
      />
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleGhostKey}
        placeholder="Talk to Pond…"
        rows={2}
        aria-describedby="ghost-hint"
        aria-label="Composer input"
        className="relative z-10 w-full resize-none bg-transparent font-mono text-sm outline-none border-b border-press-line py-1.5"
      />
    </div>
  )
}

// The meta uses a loose type so render-based stories can bypass component arg requirements.
const meta: Meta = {
  title: 'Atoms/GhostSuggestion',
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj

/** Ghost is visible when input is empty and suggestion is present. */
export const Visible: Story = {
  render: () => <Harness suggestion="Turn this into a plan" onAccept={fn()} onDismiss={fn()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status', { name: /ghost suggestion/i })).toBeInTheDocument()
    await expect(canvas.getByText('Turn this into a plan')).toBeInTheDocument()
    await expect(canvas.getByText('Tab')).toBeInTheDocument()
  },
}

const acceptOnAccept = fn()
const acceptOnDismiss = fn()

/** Tab accept fills the input and calls onAccept; ghost then vanishes (input non-empty). */
export const TabAccept: Story = {
  render: () => (
    <Harness
      suggestion="Turn this into a plan"
      onAccept={acceptOnAccept}
      onDismiss={acceptOnDismiss}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const ta = canvas.getByLabelText('Composer input')
    ta.focus()

    await expect(canvas.getByText('Turn this into a plan')).toBeInTheDocument()

    await userEvent.keyboard('{Tab}')

    await expect(acceptOnAccept).toHaveBeenCalledWith('Turn this into a plan')
    await expect(
      canvas.queryByRole('status', { name: /ghost suggestion/i })
    ).not.toBeInTheDocument()
  },
}

const vanishOnAccept = fn()
const vanishOnDismiss = fn()

/** Typing any character dismisses the ghost and calls onDismiss. */
export const VanishOnType: Story = {
  render: () => (
    <Harness
      suggestion="What should I work on today?"
      onAccept={vanishOnAccept}
      onDismiss={vanishOnDismiss}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const ta = canvas.getByLabelText('Composer input')
    ta.focus()

    await expect(canvas.getByText('What should I work on today?')).toBeInTheDocument()

    await userEvent.type(ta, 'h')

    await expect(
      canvas.queryByRole('status', { name: /ghost suggestion/i })
    ).not.toBeInTheDocument()
    await expect(vanishOnDismiss).toHaveBeenCalled()
  },
}

/** When suggestion is null, nothing renders. */
export const EmptySource: Story = {
  render: () => <Harness suggestion={null} onAccept={fn()} onDismiss={fn()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.queryByRole('status', { name: /ghost suggestion/i })
    ).not.toBeInTheDocument()
  },
}

/** When the input already has content, ghost is hidden even if suggestion is set. */
export const HiddenWhenInputFilled: Story = {
  render: () => {
    const [input, setInput] = useState('Some text already here')
    return (
      <div className="relative w-80">
        <GhostSuggestion
          suggestion="A ghost suggestion"
          inputValue={input}
          onAccept={fn()}
          onDismiss={fn()}
        />
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          aria-label="Composer input"
          className="relative z-10 w-full resize-none bg-transparent font-mono text-sm outline-none border-b border-press-line py-1.5"
        />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.queryByRole('status', { name: /ghost suggestion/i })
    ).not.toBeInTheDocument()
  },
}
