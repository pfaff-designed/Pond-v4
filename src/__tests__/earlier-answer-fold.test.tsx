/**
 * KAN-164 — the fold that keeps an answer `ask again` replaced. Collapsed it is one
 * meta line; opened in place it shows the earlier answer with its own read chips.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EarlierAnswerFold } from '@/components/molecules/ComposerThread'
import { ReadChips } from '@/components/molecules/ReadChips'

const renderFold = () =>
  render(
    <EarlierAnswerFold time="07:21">
      <p>the first answer</p>
      <ReadChips read={['budget']} />
    </EarlierAnswerFold>
  )

describe('EarlierAnswerFold', () => {
  it('is one collapsed line until opened', () => {
    renderFold()
    const toggle = screen.getByRole('button', { name: 'earlier answer · 07:21' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveClass(
      'font-mono',
      'text-[10.5px]',
      'tracking-[0.02em]',
      'text-mn-text-secondary'
    )
    expect(toggle).not.toHaveClass('text-mn-text-meta')
    expect(toggle).not.toHaveAttribute('aria-controls')
    expect(screen.queryByText('the first answer')).toBeNull()
    expect(screen.queryByTestId('read-chips')).toBeNull()
  })

  it('opens in place with the earlier answer’s own read chips, and closes again', async () => {
    const user = userEvent.setup()
    renderFold()
    const toggle = screen.getByRole('button', { name: 'earlier answer · 07:21' })

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const body = screen.getByText('the first answer').parentElement
    expect(body?.id).toBeTruthy()
    expect(toggle).toHaveAttribute('aria-controls', body?.id)
    expect(screen.getByText('the first answer')).toBeInTheDocument()
    const chips = screen.getByTestId('read-chips')
    expect(within(chips).getByText('budget')).toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).not.toHaveAttribute('aria-controls')
    expect(screen.queryByText('the first answer')).toBeNull()
    expect(screen.queryByTestId('read-chips')).toBeNull()
  })

  it('drops the time when there is none', () => {
    render(
      <EarlierAnswerFold>
        <p>x</p>
      </EarlierAnswerFold>
    )
    expect(screen.getByRole('button', { name: 'earlier answer' })).toBeInTheDocument()
  })

  it('opens each fold on its own', async () => {
    const user = userEvent.setup()
    render(
      <>
        <EarlierAnswerFold time="07:22">
          <p>second</p>
        </EarlierAnswerFold>
        <EarlierAnswerFold time="07:21">
          <p>first</p>
        </EarlierAnswerFold>
      </>
    )
    await user.click(screen.getByRole('button', { name: 'earlier answer · 07:21' }))
    expect(screen.getByText('first')).toBeInTheDocument()
    expect(screen.queryByText('second')).toBeNull()
  })
})
