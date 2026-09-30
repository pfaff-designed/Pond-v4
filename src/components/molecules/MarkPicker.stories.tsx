import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { MarkPicker } from './MarkPicker'

const meta = {
  title: 'Molecules/MarkPicker',
  component: MarkPicker,
  parameters: { layout: 'centered' },
  args: {
    glyph: 'leaf-01',
    role: 'area-a',
    glyphIsOwn: false,
    roleIsOwn: false,
    onSelectGlyph: fn(),
    onSelectRole: fn(),
  },
} satisfies Meta<typeof MarkPicker>

export default meta
type Story = StoryObj<typeof meta>

/** A page still on its derived mark: both halves offered, neither resettable. */
export const Inherited: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Glyph')).toBeInTheDocument()
    await expect(canvas.getByText('Colour')).toBeInTheDocument()

    // Nothing is the page's own yet, so neither reset affordance is offered…
    await expect(canvas.queryByRole('button', { name: 'reset' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'inherit' })).not.toBeInTheDocument()
    // …and the colour says WHERE it came from rather than leaving it to be inferred.
    await expect(canvas.getByText('from its area')).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'tulip-01' }))
    await expect(args.onSelectGlyph).toHaveBeenCalledWith('tulip-01')
  },
}

/** The three roles the theme defines — a role is picked, never a colour. */
export const Roles: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    for (const role of ['area-a', 'area-b', 'area-c']) {
      await expect(canvas.getByRole('button', { name: role })).toBeInTheDocument()
    }
    // The current role reads as pressed, so the state is not colour-only —
    // which matters because dark mode renders area-b and area-c identically.
    await expect(canvas.getByRole('button', { name: 'area-a' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    await userEvent.click(canvas.getByRole('button', { name: 'area-c' }))
    await expect(args.onSelectRole).toHaveBeenCalledWith('area-c')
  },
}

/** An explicit mark: each half can be handed back independently. */
export const Explicit: Story = {
  args: { glyph: 'tulip-01', role: 'area-c', glyphIsOwn: true, roleIsOwn: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('from its area')).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'reset' }))
    await expect(args.onSelectGlyph).toHaveBeenCalledWith(null)

    await userEvent.click(canvas.getByRole('button', { name: 'inherit' }))
    await expect(args.onSelectRole).toHaveBeenCalledWith(null)
  },
}

/** A page may keep its own glyph while still inheriting its area's colour. */
export const OwnGlyphInheritedColour: Story = {
  args: { glyph: 'tulip-01', glyphIsOwn: true, roleIsOwn: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'reset' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'inherit' })).not.toBeInTheDocument()
    await expect(canvas.getByText('from its area')).toBeInTheDocument()
  },
}

/** Search spans family names too, so "flower" finds tulip-01. */
export const Search: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('textbox', { name: 'Search glyphs' }), 'flower')
    await expect(canvas.getByRole('button', { name: 'tulip-01' })).toBeInTheDocument()
    // A glyph from another family is filtered out.
    await expect(canvas.queryByRole('button', { name: 'house' })).not.toBeInTheDocument()
  },
}

/** A query that matches nothing says so, rather than showing an empty frame. */
export const NoMatch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('textbox', { name: 'Search glyphs' }), 'zzzz')
    await expect(canvas.getByText('no glyph by that name')).toBeInTheDocument()
  },
}
