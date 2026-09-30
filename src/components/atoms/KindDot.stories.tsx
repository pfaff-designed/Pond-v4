import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'

import { KindDot } from './KindDot'

/**
 * The page-kind mark (#91): a 7×7px, 2px-radius square in muted ink or an area
 * accent. Extracted from PondMolecule's inline dot so the rail, cards and the
 * overview kicker share one mark. Colour tints MARKS only.
 */
const meta = {
  title: 'Atoms/KindDot',
  component: KindDot,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof KindDot>

export default meta
type Story = StoryObj<typeof meta>

/** Muted ink at 50% — the resting page-kind mark. */
export const Muted: Story = {
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector<HTMLElement>('[data-part="dot"]')!
    const box = el.getBoundingClientRect()
    await expect(box.width).toBe(7)
    await expect(box.height).toBe(7)
    await expect(getComputedStyle(el).borderRadius).toBe('2px')
    await expect(el.getAttribute('aria-hidden')).toBe('true')
  },
}

/** A raw area accent, applied inline (drops the muted class). */
export const Accent: Story = {
  args: { accent: '#5f7355' },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector<HTMLElement>('[data-part="dot"]')!
    await expect(getComputedStyle(el).backgroundColor).toBe('rgb(95, 115, 85)')
    await expect(el.className).not.toContain('bg-mn-text/50')
  },
}

/** Variant classes merge over the default (a selected row's full-ink dot). */
export const Selected: Story = {
  args: { className: 'bg-mn-text' },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector<HTMLElement>('[data-part="dot"]')!
    await expect(el.className).toContain('bg-mn-text')
    await expect(el.className).not.toContain('bg-mn-text/50')
  },
}
