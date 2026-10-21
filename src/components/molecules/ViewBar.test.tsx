/**
 * `ViewBar` — the saved-view bar (6o f2). `view.test.tsx`'s path test covers
 * it wired into a real view block; this file covers the bar on its own.
 */

import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewBar, ViewLayoutMenu, type ViewBarProps, type ViewBarView } from '@/components/molecules/ViewBar'
import type { ViewKindPickerRow } from '@/components/molecules/ViewKindPicker'
import { LAYOUT_MENU_MODES, VIEW_KINDS } from '@/lib/modules/view/kinds'
import type { ViewMode } from '@/lib/modules/view/schema'

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

const layoutNames = LAYOUT_MENU_MODES.map((mode) => VIEW_KINDS[mode].label)

const renderLayout = (mode: ViewMode, editable: boolean, onLayout = jest.fn()) => {
  render(<ViewLayoutMenu mode={mode} editable={editable} onLayout={onLayout} />)
  return onLayout
}

describe('ViewLayoutMenu', () => {
  it('closed, is one chip named with the current layout, on the saved-view pill', () => {
    renderLayout('table', true)
    const chip = screen.getByRole('button', { name: 'table' })
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(chip.className).toContain('bg-mn-text')
    expect(chip.className).toContain('text-raw-paper')
    expect(chip.className).toContain('px-[10px]')
    expect(chip.className).toContain('py-[4px]')
    expect(chip.className).not.toMatch(/text-\[/)
    const pill = chip.parentElement
    expect(pill?.className).toContain('text-[10.5px]')
    expect(pill?.className).toContain('bg-mn-text/[0.055]')
    expect(pill?.className).toContain('dark:bg-mn-text/[0.08]')
    expect(pill?.className).toContain('p-[3px]')
  })

  it('names a gantt view timeline', () => {
    renderLayout('gantt', true)
    expect(screen.getByRole('button', { name: 'timeline' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'gantt' })).not.toBeInTheDocument()
  })

  it('click opens the layouts in menu order, each named from its kind', async () => {
    const user = userEvent.setup()
    renderLayout('table', true)
    await user.click(screen.getByRole('button', { name: 'table' }))
    const menu = await screen.findByRole('menu', { name: 'layout' })
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(layoutNames)
  })

  it('choosing another mode calls onLayout', async () => {
    const user = userEvent.setup()
    const onLayout = renderLayout('table', true)
    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'board' }))
    expect(onLayout).toHaveBeenCalledTimes(1)
    expect(onLayout).toHaveBeenCalledWith('board')
  })

  it('choosing the current mode closes and does not call', async () => {
    const user = userEvent.setup()
    const onLayout = renderLayout('table', true)
    await user.click(screen.getByRole('button', { name: 'table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'table' }))
    expect(onLayout).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('choosing timeline on a gantt view is the current mode and does not call', async () => {
    const user = userEvent.setup()
    const onLayout = renderLayout('gantt', true)
    await user.click(screen.getByRole('button', { name: 'timeline' }))
    await user.click(await screen.findByRole('menuitem', { name: 'timeline' }))
    expect(onLayout).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('Enter and Space on the focused closed chip open the layout menu', async () => {
    const user = userEvent.setup()
    renderLayout('table', true)
    const chip = screen.getByRole('button', { name: 'table' })
    chip.focus()
    expect(chip).toHaveAttribute('aria-haspopup', 'menu')
    expect(chip).toHaveAttribute('aria-expanded', 'false')
    // Keydown only. The activation click is not what opens this menu.
    fireEvent.keyDown(chip, { key: 'Enter' })
    expect(screen.getByRole('menu', { name: 'layout' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'layout' })).not.toBeInTheDocument())
    expect(chip).toHaveFocus()
    expect(chip).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(chip, { key: ' ' })
    expect(screen.getByRole('menu', { name: 'layout' })).toBeInTheDocument()
  })

  it('Esc closes and does not call', async () => {
    const user = userEvent.setup()
    const onLayout = renderLayout('table', true)
    await user.click(screen.getByRole('button', { name: 'table' }))
    await screen.findByRole('menu', { name: 'layout' })
    await waitFor(() => expect(screen.getByRole('menu', { name: 'layout' }).contains(document.activeElement)).toBe(true))
    await user.keyboard('{Escape}')
    expect(onLayout).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('when editable is false the word shows and there is no button', () => {
    renderLayout('table', false)
    const word = screen.getByText('table')
    expect(word.closest('button')).toBeNull()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(word.className).toContain('bg-mn-text')
    expect(word.parentElement?.className).toContain('text-[10.5px]')
  })
})
