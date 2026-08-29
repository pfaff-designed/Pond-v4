import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { QuestionCard } from './QuestionCard'

const meta = {
  title: 'Molecules/QuestionCard',
  component: QuestionCard,
  parameters: { layout: 'centered' },
  args: {
    question: 'What kind of kiln are you planning for?',
    options: ['Electric', 'Gas', 'Wood-fired'],
    branch: 'kiln type',
    onAnswer: fn(),
  },
} satisfies Meta<typeof QuestionCard>

export default meta
type Story = StoryObj<typeof meta>

/** An open branch: question, option chips, and a free-answer field. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('What kind of kiln are you planning for?')).toBeInTheDocument()
    await expect(canvas.getByText('Decision · kiln type')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Wood-fired' })).toBeInTheDocument()
    await expect(canvas.getByLabelText('Free answer')).toBeInTheDocument()
  },
}

/** Picking an option chip answers with via='option'. */
export const PickOption: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Wood-fired' }))
    await expect(args.onAnswer).toHaveBeenCalledWith('Wood-fired', 'option')
  },
}

/** Typing a free answer + submitting answers with via='free'. */
export const FreeAnswer: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Free answer'), 'a raku kiln')
    await userEvent.click(canvas.getByRole('button', { name: 'Answer' }))
    await expect(args.onAnswer).toHaveBeenCalledWith('a raku kiln', 'free')
  },
}

/** The Answer button is inert until the free field has text. */
export const AnswerGatedOnText: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Answer' }))
    await expect(args.onAnswer).not.toHaveBeenCalled()
  },
}

/** Once answered the card goes inert — no chips, just the recorded answer. */
export const Answered: Story = {
  args: { answer: 'Wood-fired' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('You answered: Wood-fired')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Wood-fired' })).not.toBeInTheDocument()
    await expect(canvas.queryByLabelText('Free answer')).not.toBeInTheDocument()
  },
}
