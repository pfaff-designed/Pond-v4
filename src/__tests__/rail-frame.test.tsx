import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RailFrame } from '@/components/organisms/RailFrame'
import { setRailMinimized } from '@/lib/layout/rail-chrome'

afterEach(() => {
  setRailMinimized(false)
  window.localStorage.removeItem('pond:rail-minimized')
})

describe('RailFrame', () => {
  it('shows the rail and hides the corner button while the rail is open', () => {
    render(
      <RailFrame>
        <aside aria-label="Pages">tree</aside>
      </RailFrame>
    )

    expect(screen.getByRole('complementary', { name: 'Pages' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'show rail' })).not.toBeInTheDocument()
  })

  it('hides the rail and offers show rail from the corner once minimized', async () => {
    const user = userEvent.setup()
    setRailMinimized(true)
    render(
      <RailFrame>
        <aside aria-label="Pages">tree</aside>
      </RailFrame>
    )

    expect(screen.queryByRole('complementary', { name: 'Pages' })).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Pages', hidden: true })).not.toBeVisible()
    await user.click(screen.getByRole('button', { name: 'show rail' }))
    expect(screen.getByRole('complementary', { name: 'Pages' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'show rail' })).not.toBeInTheDocument()
  })
})
