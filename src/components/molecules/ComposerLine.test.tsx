/**
 * `ComposerLine` — the research pill opens the mode menu (6r f1) rather than
 * toggling research directly.
 */

import { useRef, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComposerLine, type ComposerLineProps } from '@/components/molecules/ComposerLine'

interface HarnessProps {
  research?: boolean
  onSelectMode?: ComposerLineProps['onSelectMode']
}

const Harness = ({ research = false, onSelectMode = jest.fn() }: HarnessProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')
  return (
    <ComposerLine
      value={value}
      placeholder="ask pond, or / for blocks"
      disabled={false}
      streaming={false}
      canSend={false}
      attachDisabled={false}
      textareaRef={textareaRef}
      anchorRef={anchorRef}
      research={research}
      mentionTitles={[]}
      onSelectMode={onSelectMode}
      onChange={setValue}
      onKeyDown={jest.fn()}
      onAttach={jest.fn()}
      onSend={jest.fn()}
      onStop={jest.fn()}
    />
  )
}

const pill = () => screen.getByRole('button', { name: 'research' })
const findMenu = () => screen.findByRole('menu', { name: 'mode menu' })

describe('ComposerLine — research pill', () => {
  it('clicking the pill opens the mode menu with ask selected when research is false', async () => {
    const user = userEvent.setup()
    render(<Harness research={false} />)

    await user.click(pill())

    const menu = await findMenu()
    const [askRow, deepResearchRow] = within(menu).getAllByRole('menuitem')
    expect(askRow.className).toContain('bg-mn-text/[0.07]')
    expect(deepResearchRow.className).not.toContain('bg-mn-text/[0.07]')
  })

  it('selecting deep research fires onSelectMode and closes the menu, focus back on the line', async () => {
    const user = userEvent.setup()
    const onSelectMode = jest.fn()
    render(<Harness onSelectMode={onSelectMode} />)

    await user.click(pill())
    const menu = await findMenu()
    await user.click(within(menu).getByText('deep research'))

    expect(onSelectMode).toHaveBeenCalledWith('deep-research')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toHaveFocus())
  })

  it('lays out in flow inside the composer, above the line, not a floating 280px popover', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness />)

    await user.click(pill())
    const menu = await findMenu()

    // In flow, inside ComposerLine's own render tree — not a floating popup
    // portaled out to `document.body` and overlapping the line.
    expect(container).toContainElement(menu)
    expect(menu.className).toContain('w-full')
    expect(menu.className).not.toContain('w-[280px]')

    const textarea = screen.getByRole('textbox', { name: 'Message Pond' })
    expect(textarea.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })
})
