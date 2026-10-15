/**
 * `MadePageActions` — the composer's post-make-page chip row (frame 5).
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MadePageActions } from '@/components/molecules/MadePageActions'

describe('MadePageActions', () => {
  it('top-level proposal (parentName null) renders only the undo chip', () => {
    render(<MadePageActions onUndo={() => {}} parentName={null} />)
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^open /i })).not.toBeInTheDocument()
  })

  it('parented proposal renders undo and open {parentName}', () => {
    render(<MadePageActions onUndo={() => {}} parentName="kitchen renovation" onOpenParent={() => {}} />)
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'open kitchen renovation' })).toBeInTheDocument()
  })

  it('clicking undo fires onUndo', async () => {
    const user = userEvent.setup()
    const onUndo = jest.fn()
    render(<MadePageActions onUndo={onUndo} parentName={null} />)
    await user.click(screen.getByRole('button', { name: 'undo' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('clicking open {parentName} fires onOpenParent', async () => {
    const user = userEvent.setup()
    const onOpenParent = jest.fn()
    render(
      <MadePageActions onUndo={() => {}} parentName="kitchen renovation" onOpenParent={onOpenParent} />
    )
    await user.click(screen.getByRole('button', { name: 'open kitchen renovation' }))
    expect(onOpenParent).toHaveBeenCalledTimes(1)
  })
})
