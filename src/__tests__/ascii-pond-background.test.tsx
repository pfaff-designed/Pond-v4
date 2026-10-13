/**
 * KAN-195: the cover's drifting ASCII pond stops under `prefers-reduced-motion`.
 */

import React from 'react'
import { render } from '@testing-library/react'

import { AsciiPondBackground } from '@/components/molecules/AsciiPondBackground'

describe('AsciiPondBackground', () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('animates each line when the OS has no reduced-motion preference', () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia

    const { container } = render(<AsciiPondBackground />)

    const lines = container.querySelectorAll('[aria-hidden="true"] > div')
    expect(lines.length).toBeGreaterThan(0)
    lines.forEach((line) => {
      expect((line as HTMLElement).style.animation).toContain('pondDrift')
    })
  })

  it('stops the drift when the OS prefers reduced motion', () => {
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia

    const { container } = render(<AsciiPondBackground />)

    const lines = container.querySelectorAll('[aria-hidden="true"] > div')
    expect(lines.length).toBeGreaterThan(0)
    lines.forEach((line) => {
      expect((line as HTMLElement).style.animation).toBe('')
    })
  })
})
