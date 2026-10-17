/**
 * `ViewBar` — the saved-view bar (6o f2). `view.test.tsx`'s path test covers
 * it wired into a real view block; this file covers the bar on its own.
 */

import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewBar, type ViewBarProps, type ViewBarView } from '@/components/molecules/ViewBar'
import type { ViewKindPickerRow } from '@/components/molecules/ViewKindPicker'

const VIEWS: ViewBarView[] = [
  { id: 'v-board', label: 'board' },
  { id: 'v-timeline', label: 'timeline' },
]

const ADD_VIEW_ROWS: ViewKindPickerRow[] = [{ mode: 'table' }, { mode: 'board' }, { mode: 'calendar' }]

type HarnessProps =
  | { showAddView?: false }
  | { showAddView: true; addViewRows?: readonly ViewKindPickerRow[]; onAddView?: ViewBarProps['onAddView'] }

const Harness = (props: HarnessProps = {}) => {
  const [activeId, setActiveId] = useState('v-board')
  if (!props.showAddView) {
    return <ViewBar views={VIEWS} activeId={activeId} onSelect={setActiveId} showAddView={false} />
  }
  return (
    <ViewBar
      views={VIEWS}
      activeId={activeId}
      onSelect={setActiveId}
      showAddView
      addViewRows={props.addViewRows ?? ADD_VIEW_ROWS}
      onAddView={props.onAddView ?? (() => {})}
    />
  )
}

describe('ViewBar', () => {
  it('renders a segment per view, in order, the active one selected', () => {
    render(<Harness />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['board', 'timeline'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0].className).toContain('bg-mn-text')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1].className).not.toContain('bg-mn-text')
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

  it('showAddView=true renders a real, focusable "＋ view" button', () => {
    render(<Harness showAddView />)
    const addView = screen.getByRole('button', { name: 'add a view' })
    expect(addView).toHaveTextContent('＋ view')
    expect(addView).not.toHaveAttribute('aria-disabled')
  })

  it('"＋ view" carries no classes beyond 6o f2\'s values (no lowercase/tracking)', () => {
    render(<Harness showAddView />)
    const addView = screen.getByRole('button', { name: 'add a view' })
    expect(addView.className).not.toContain('lowercase')
    expect(addView.className).not.toContain('tracking-')
  })

  it('clicking "＋ view" opens the picker with its rows', async () => {
    const user = userEvent.setup()
    render(<Harness showAddView />)
    await user.click(screen.getByRole('button', { name: 'add a view' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'table↵',
      'board',
      'calendar',
    ])
  })

  it('Escape closes the picker and returns focus to the "＋ view" button', async () => {
    const user = userEvent.setup()
    render(<Harness showAddView />)
    const addView = screen.getByRole('button', { name: 'add a view' })
    await user.click(addView)
    expect(screen.getAllByRole('option')).toHaveLength(3)
    await user.keyboard('{Escape}')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(addView).toHaveFocus()
  })

  it('a reader render (showAddView=false, PATH_STEPS 9) hides "＋ view" but a different segment still calls onSelect', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()
    render(<ViewBar views={VIEWS} activeId="v-board" onSelect={onSelect} showAddView={false} />)

    expect(screen.queryByRole('button', { name: 'add a view' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'timeline' }))
    expect(onSelect).toHaveBeenCalledWith('v-timeline')
  })

  it('clicking "＋ view" again while open closes it (the anchor press is not "outside")', async () => {
    const user = userEvent.setup()
    render(<Harness showAddView />)
    const addView = screen.getByRole('button', { name: 'add a view' })
    await user.click(addView)
    expect(screen.getAllByRole('option')).toHaveLength(3)
    await user.click(addView)
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(addView).toHaveFocus()
  })

  it('picking a row calls onAddView with that mode and closes the picker', async () => {
    const user = userEvent.setup()
    const onAddView = jest.fn()
    render(<Harness showAddView onAddView={onAddView} />)
    await user.click(screen.getByRole('button', { name: 'add a view' }))
    await user.click(screen.getByRole('option', { name: 'board' }))
    expect(onAddView).toHaveBeenCalledWith('board')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})
