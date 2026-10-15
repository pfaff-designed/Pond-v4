/**
 * KAN-314 (fix round 2): the board (`PondRail.dc.html`) draws no tools at rest
 * (the label runs to the row's own 8px right padding), the selected-unhovered
 * row's ＋ alone at the row's right edge, and the hovered row's ＋ · gap 8 · ×
 * with × at the right edge. So the tools sit OUT OF FLOW — absolutely
 * positioned over the row's own right padding — rather than reserving flow
 * width in every state: the ×'s slot is a constant position (same x at rest
 * and hovered, inside the row so pointing there fires the row's mouseenter),
 * ＋ is the one thing that moves (alone at the edge when selected-and-unhovered,
 * one slot left once × also draws), and the label only gives up width while a
 * control is actually drawn over it.
 */
import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { RailView, type RailNode } from '@/components/organisms/Rail'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

const node = (
  id: string,
  title: string,
  children: RailNode[] = [],
  parentId: string | null = null,
  order = 0
): RailNode => ({ id, parentId, type: 'page', title, order, children })

const TREE: RailNode[] = [node('health', 'Health', [node('sleep', 'Sleep', [], 'health')])]

function renderRail(selectedId: string | null) {
  return render(
    <RailView
      tree={TREE}
      pondName="life"
      selectedId={selectedId}
      expanded={new Set(['health'])}
      lifeExpanded
      busyId={null}
      isLoading={false}
      isEmpty={false}
      onSelect={jest.fn()}
      onToggle={jest.fn()}
      onAddChild={jest.fn()}
      onDelete={jest.fn()}
      onRename={jest.fn()}
      onPickGlyph={jest.fn()}
      onLife={jest.fn()}
      onToggleLife={jest.fn()}
      onOpenDatabases={jest.fn()}
      canDrop={() => true}
      onMove={jest.fn()}
    />
  )
}

/** Drops the opacity/pointer-events tokens a state is allowed to toggle, so
 *  what's left is only the position/width part of the className. */
function stablePart(className: string): string {
  return className
    .split(/\s+/)
    .filter((cls) => cls && !cls.startsWith('opacity-') && !cls.startsWith('pointer-events-'))
    .join(' ')
}

/** Exact class membership, not substring — `pr-[39px]` is also a substring of
 *  the always-present `group-focus-within:pr-[39px]`, so `toContain` on the
 *  raw string would false-positive on the keyboard-focus variant. */
function hasClass(className: string, token: string): boolean {
  return className.split(/\s+/).includes(token)
}

function rowParts(row: HTMLElement) {
  const plusButton = within(row).getByRole('button', { name: /Add sub-page/ })
  const deleteButton = within(row).getByRole('button', { name: /Delete/ })
  const rowTools = row.querySelector('[data-part="row-tools"]') as HTMLElement
  const label = row.querySelector('[data-kind="list-row"]') as HTMLElement
  return {
    rowToolsClassName: rowTools.className,
    plusWrapperClassName: plusButton.parentElement!.className,
    deleteWrapperClassName: deleteButton.parentElement!.className,
    labelClassName: label.className,
  }
}

describe('Rail row-tools — out-of-flow slots at the row\'s right edge (KAN-314)', () => {
  it('the row-tools span sits absolutely over the row, at a position that never changes', () => {
    const { rerender } = renderRail(null)
    const rest = rowParts(screen.getByRole('treeitem', { name: 'Sleep' }))
    expect(rest.rowToolsClassName).toContain('absolute')
    expect(rest.rowToolsClassName).toContain('right-2')

    rerender(
      <RailView
        tree={TREE}
        pondName="life"
        selectedId="sleep"
        expanded={new Set(['health'])}
        lifeExpanded
        busyId={null}
        isLoading={false}
        isEmpty={false}
        onSelect={jest.fn()}
        onToggle={jest.fn()}
        onAddChild={jest.fn()}
        onDelete={jest.fn()}
        onRename={jest.fn()}
        onPickGlyph={jest.fn()}
        onLife={jest.fn()}
        onToggleLife={jest.fn()}
        onOpenDatabases={jest.fn()}
        canDrop={() => true}
        onMove={jest.fn()}
      />
    )
    const selectedRow = screen.getByRole('treeitem', { name: 'Sleep' })
    const selectedNotHovered = rowParts(selectedRow)

    // The row-tools span itself carries no state-dependent position/width class at all.
    expect(selectedNotHovered.rowToolsClassName).toBe(rest.rowToolsClassName)

    fireEvent.mouseEnter(selectedRow)
    const hovered = rowParts(selectedRow)
    expect(hovered.rowToolsClassName).toBe(rest.rowToolsClassName)

    fireEvent.mouseLeave(selectedRow)
  })

  it("× sits at a constant slot — the same position at rest, selected, and hovered", () => {
    const { rerender } = renderRail(null)
    const rest = rowParts(screen.getByRole('treeitem', { name: 'Sleep' }))

    rerender(
      <RailView
        tree={TREE}
        pondName="life"
        selectedId="sleep"
        expanded={new Set(['health'])}
        lifeExpanded
        busyId={null}
        isLoading={false}
        isEmpty={false}
        onSelect={jest.fn()}
        onToggle={jest.fn()}
        onAddChild={jest.fn()}
        onDelete={jest.fn()}
        onRename={jest.fn()}
        onPickGlyph={jest.fn()}
        onLife={jest.fn()}
        onToggleLife={jest.fn()}
        onOpenDatabases={jest.fn()}
        canDrop={() => true}
        onMove={jest.fn()}
      />
    )
    const selectedRow = screen.getByRole('treeitem', { name: 'Sleep' })
    const selectedNotHovered = rowParts(selectedRow)

    fireEvent.mouseEnter(selectedRow)
    const hovered = rowParts(selectedRow)

    expect(stablePart(rest.deleteWrapperClassName)).toBe(stablePart(selectedNotHovered.deleteWrapperClassName))
    expect(stablePart(rest.deleteWrapperClassName)).toBe(stablePart(hovered.deleteWrapperClassName))
    expect(rest.deleteWrapperClassName).toContain('absolute')
    expect(rest.deleteWrapperClassName).toContain('right-0')

    fireEvent.mouseLeave(selectedRow)
  })

  it('＋ is the one that moves: alone at the edge when selected-and-unhovered, one slot left once × also draws', () => {
    const { rerender } = renderRail(null)
    rerender(
      <RailView
        tree={TREE}
        pondName="life"
        selectedId="sleep"
        expanded={new Set(['health'])}
        lifeExpanded
        busyId={null}
        isLoading={false}
        isEmpty={false}
        onSelect={jest.fn()}
        onToggle={jest.fn()}
        onAddChild={jest.fn()}
        onDelete={jest.fn()}
        onRename={jest.fn()}
        onPickGlyph={jest.fn()}
        onLife={jest.fn()}
        onToggleLife={jest.fn()}
        onOpenDatabases={jest.fn()}
        canDrop={() => true}
        onMove={jest.fn()}
      />
    )
    const selectedRow = screen.getByRole('treeitem', { name: 'Sleep' })
    const selectedNotHovered = rowParts(selectedRow)
    expect(hasClass(selectedNotHovered.plusWrapperClassName, 'mr-5')).toBe(false)

    fireEvent.mouseEnter(selectedRow)
    const hovered = rowParts(selectedRow)
    expect(hasClass(hovered.plusWrapperClassName, 'mr-5')).toBe(true)

    // ＋'s moving classes are the only difference — it still shows (opacity stays up).
    expect(stablePart(selectedNotHovered.plusWrapperClassName)).not.toBe(stablePart(hovered.plusWrapperClassName))

    fireEvent.mouseLeave(selectedRow)
  })

  it('the label gives up width only while a control is actually drawn over it', () => {
    const { rerender } = renderRail(null)
    const rest = rowParts(screen.getByRole('treeitem', { name: 'Sleep' }))
    // At rest (not selected, not hovered) nothing is drawn — no reserved clearance.
    expect(hasClass(rest.labelClassName, 'pr-[39px]')).toBe(false)
    expect(hasClass(rest.labelClassName, 'pr-[19px]')).toBe(false)

    rerender(
      <RailView
        tree={TREE}
        pondName="life"
        selectedId="sleep"
        expanded={new Set(['health'])}
        lifeExpanded
        busyId={null}
        isLoading={false}
        isEmpty={false}
        onSelect={jest.fn()}
        onToggle={jest.fn()}
        onAddChild={jest.fn()}
        onDelete={jest.fn()}
        onRename={jest.fn()}
        onPickGlyph={jest.fn()}
        onLife={jest.fn()}
        onToggleLife={jest.fn()}
        onOpenDatabases={jest.fn()}
        canDrop={() => true}
        onMove={jest.fn()}
      />
    )
    const selectedRow = screen.getByRole('treeitem', { name: 'Sleep' })
    const selectedNotHovered = rowParts(selectedRow)
    // Selected-unhovered draws ＋ alone — a smaller clearance.
    expect(hasClass(selectedNotHovered.labelClassName, 'pr-[19px]')).toBe(true)
    expect(hasClass(selectedNotHovered.labelClassName, 'pr-[39px]')).toBe(false)

    fireEvent.mouseEnter(selectedRow)
    const hovered = rowParts(selectedRow)
    // Hovered draws ＋ and × together — the wider clearance.
    expect(hasClass(hovered.labelClassName, 'pr-[39px]')).toBe(true)
    expect(hasClass(hovered.labelClassName, 'pr-[19px]')).toBe(false)

    fireEvent.mouseLeave(selectedRow)
  })

  it("× has its own hit area: ＋ only transitions opacity (no margin-right slide), and × stacks above ＋ (KAN-320)", () => {
    renderRail('sleep')
    const selectedRow = screen.getByRole('treeitem', { name: 'Sleep' })
    const { plusWrapperClassName, deleteWrapperClassName } = rowParts(selectedRow)

    // ＋'s margin-right move is no longer part of what transitions — only opacity does.
    expect(hasClass(plusWrapperClassName, 'transition-[opacity,margin-right]')).toBe(false)
    expect(hasClass(plusWrapperClassName, 'transition-opacity')).toBe(true)

    // × stacks above ＋, so a pointer landing at ×'s point always hits × first.
    expect(hasClass(deleteWrapperClassName, 'z-[1]')).toBe(true)
  })
})
