/**
 * `UndoNotice` — the board's exact head/body/foot strings, and the head's
 * "opened {page}" clause dropping when the step didn't navigate.
 */

import { render, screen } from '@testing-library/react'
import { UndoNotice } from '@/components/molecules/UndoNotice'
import { PageChangesSection } from '@/components/molecules/PageChangesSection'
import type { UndoNotice as UndoNoticeData } from '@/lib/terminal-focus'

/** Pulls the arbitrary z-index out of a Tailwind `z-[N]` / `z-N` class list. */
function zIndexOf(className: string): number {
  const match = className.match(/z-\[(\d+)\]|z-(\d+)/)
  if (match === null) throw new Error(`no z-index class in "${className}"`)
  return Number(match[1] ?? match[2])
}

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

afterEach(() => {
  jest.restoreAllMocks()
})

describe('UndoNotice', () => {
  it('renders the board’s exact head/body/foot strings', () => {
    onPlatform('MacIntel')
    const notice: UndoNoticeData = {
      direction: 'undo',
      pastTense: 'removed chickpeas, harissa',
      openedPageTitle: 'recipes',
      previousPageTitle: 'kitchen renovation',
    }
    render(<UndoNotice notice={notice} />)

    expect(screen.getByText('undo · ⌘Z')).toBeInTheDocument()
    expect(screen.getByText('opened recipes')).toBeInTheDocument()
    expect(
      screen.getByText('removed chickpeas, harissa. you were on kitchen renovation.')
    ).toBeInTheDocument()
    expect(screen.getByText('redo ⇧⌘Z')).toBeInTheDocument()
    expect(screen.getByText('back to kitchen renovation ⌘[')).toBeInTheDocument()
    expect(screen.getByText('undo · ⌘Z')).not.toHaveClass('text-mn-text-secondary')
    expect(screen.getByText('opened recipes')).toHaveClass('text-mn-text-secondary')
  })

  it('renders the foot as three spans with a middle separator', () => {
    onPlatform('MacIntel')
    const notice: UndoNoticeData = {
      direction: 'undo',
      pastTense: 'removed chickpeas, harissa',
      openedPageTitle: 'recipes',
      previousPageTitle: 'kitchen renovation',
    }
    render(<UndoNotice notice={notice} />)

    const foot = screen.getByText('redo ⇧⌘Z').parentElement
    expect(foot?.children).toHaveLength(3)
    expect(foot?.children[1]).toHaveTextContent('·')
  })

  it('renders no "opened"/"you were on"/"back to" clauses for a same-page step', () => {
    onPlatform('MacIntel')
    const notice: UndoNoticeData = {
      direction: 'undo',
      pastTense: 'removed chickpeas, harissa',
      openedPageTitle: null,
      previousPageTitle: 'kitchen renovation',
    }
    render(<UndoNotice notice={notice} />)

    expect(screen.getByText('undo · ⌘Z')).toBeInTheDocument()
    expect(screen.queryByText(/^opened /)).not.toBeInTheDocument()
    expect(screen.getByText('removed chickpeas, harissa.')).toBeInTheDocument()
    expect(screen.queryByText(/you were on/)).not.toBeInTheDocument()
    const foot = screen.getByText('redo ⇧⌘Z').parentElement
    expect(foot?.children).toHaveLength(1)
    expect(screen.queryByText(/^back to /)).not.toBeInTheDocument()
  })

  it('renders nothing when there is no notice', () => {
    const { container } = render(<UndoNotice notice={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('outranks the "changes to this page" panel’s stacking, with both mounted', () => {
    const notice: UndoNoticeData = {
      direction: 'undo',
      pastTense: 'removed chickpeas, harissa',
      openedPageTitle: 'recipes',
      previousPageTitle: 'kitchen renovation',
    }
    render(
      <>
        <UndoNotice notice={notice} />
        <PageChangesSection
          rows={[]}
          onOpenRecord={() => {}}
          onOpenChangeLog={() => {}}
          shortcutLabel="⌥⌘H"
        />
      </>
    )

    const noticeZ = zIndexOf(screen.getByRole('status').className)
    const panelZ = zIndexOf(screen.getByRole('complementary').className)
    expect(noticeZ).toBeGreaterThan(panelZ)
  })
})
