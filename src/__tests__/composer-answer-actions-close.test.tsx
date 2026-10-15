/**
 * `AnswerActions` draws a reachable close × in every state (KAN-318), per
 * `PondComposer.dc.html`'s chips-row `close: true` shape.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnswerActions } from '@/components/molecules/AnswerActions'

describe('AnswerActions close control', () => {
  it('renders a close button and calls onClose on click', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(
      <AnswerActions
        streaming={false}
        onMakePage={jest.fn()}
        onAskAgain={jest.fn()}
        onStop={jest.fn()}
        onClose={onClose}
        onMaximize={jest.fn()}
        onMinimize={jest.fn()}
      />
    )

    const closeButton = screen.getByRole('button', { name: 'close' })
    expect(closeButton).toBeInTheDocument()

    await user.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
