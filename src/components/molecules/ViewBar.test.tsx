/**
 * `ViewBar` — the saved-view bar (6o f2). `view.test.tsx`'s path test covers
 * it wired into a real view block; this file covers the bar on its own.
 */

import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewBar, type ViewBarView } from '@/components/molecules/ViewBar'

const VIEWS: ViewBarView[] = [
  { id: 'v-board', label: 'board' },
  { id: 'v-timeline', label: 'timeline' },
]

const Harness = ({ showAddView = true }: { showAddView?: boolean }) => {
  const [activeId, setActiveId] = useState('v-board')
  return <ViewBar views={VIEWS} activeId={activeId} onSelect={setActiveId} showAddView={showAddView} />
}

describe('ViewBar', () => {
  it('renders a segment per view, in order, the active one selected', () => {
    render(<Harness />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['board', 'timeline'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0].className).toContain('bg-mn-text/[0.07]')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1].className).not.toContain('bg-mn-text/[0.07]')
  })

  it('clicking a segment selects it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('tab', { name: 'timeline' }))
    expect(screen.getByRole('tab', { name: 'timeline' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'board' })).toHaveAttribute('aria-selected', 'false')
  })

  it('arrow keys move focus and selection between segments', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('tab', { name: 'board' }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'timeline' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'timeline' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'board' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'board' })).toHaveAttribute('aria-selected', 'true')
  })

  it('showAddView=false renders no "＋ view"', () => {
    render(<Harness showAddView={false} />)
    expect(screen.queryByText('＋ view')).not.toBeInTheDocument()
  })

  it('showAddView=true renders the inert "＋ view"', () => {
    render(<Harness showAddView />)
    const addView = screen.getByText('＋ view')
    expect(addView).toHaveAttribute('aria-disabled', 'true')
  })

  it('"＋ view" carries no classes beyond 6o f2\'s values (no lowercase/tracking)', () => {
    render(<Harness showAddView />)
    const addView = screen.getByText('＋ view')
    expect(addView.className).not.toContain('lowercase')
    expect(addView.className).not.toContain('tracking-')
  })
})
