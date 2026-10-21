/**
 * Window controls sit on the composer card, not in the answer row.
 */

import { render, screen } from '@testing-library/react'
import { AnswerActions } from '@/components/molecules/AnswerActions'

describe('AnswerActions close control', () => {
  it('does not draw minimize, maximize or close — those sit on the composer card', () => {
    render(
      <AnswerActions
        streaming={false}
        onMakePage={jest.fn()}
        onAskAgain={jest.fn()}
        onStop={jest.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'close' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'minimize' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'maximize' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'make this a page' })).toBeInTheDocument()
  })
})
