/**
 * `PondMolecule` record-card's tag chip: suppressed when `tag === ''`,
 * mirroring the existing `meta === ''` suppression. Unset (`undefined`)
 * keeps the `'recipe'` fixture fallback for Storybook/mockup parity.
 */

import { render } from '@testing-library/react'
import { PondMolecule } from '@/components/molecules/PondMolecule'

describe('PondMolecule record-card — tag chip suppression', () => {
  it('tag="" renders no tag chip', () => {
    const { container } = render(<PondMolecule kind="record-card" tag="" />)
    expect(container.querySelector('[data-kind="tag"]')).toBeNull()
  })

  it('tag={undefined} falls back to the `recipe` fixture', () => {
    const { container } = render(<PondMolecule kind="record-card" />)
    expect(container.querySelector('[data-kind="tag"]')!.textContent).toBe('recipe')
  })

  it('tag="done" shows `done`', () => {
    const { container } = render(<PondMolecule kind="record-card" tag="done" />)
    expect(container.querySelector('[data-kind="tag"]')!.textContent).toBe('done')
  })
})
