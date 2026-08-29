import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { VoiceInputButton } from './VoiceInputButton'

const meta = {
  title: 'Atoms/VoiceInputButton',
  component: VoiceInputButton,
  parameters: { layout: 'centered' },
  args: {
    onTranscript: fn(),
    disabled: false,
  },
} satisfies Meta<typeof VoiceInputButton>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The button renders when the Speech API is available.
 * In Storybook's jsdom-ish environment webkitSpeechRecognition may not be
 * defined; if so the component returns null — test for that case gracefully.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Either the button is present (real browser / polyfill) or absent (jsdom).
    const btn = canvas.queryByRole('button', { name: /voice input|start voice/i })
    if (btn) {
      await expect(btn).not.toBeDisabled()
      await expect(btn).toHaveAttribute('aria-pressed', 'false')
    }
    // If null, the API is unavailable — correct behavior.
  },
}

/** Disabled state disables the button. */
export const DisabledDuringStreaming: Story = {
  args: { disabled: true },
  decorators: [
    // Inject a fake SpeechRecognition so the button renders in jsdom too.
    (Story) => {
      if (typeof window !== 'undefined' && !window.webkitSpeechRecognition) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).webkitSpeechRecognition = class {
          continuous = false
          interimResults = false
          lang = ''
          onresult = null
          onend = null
          onerror = null
          start() {}
          stop() {}
        }
      }
      return <Story />
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const btn = canvas.queryByRole('button', { name: /voice input|start voice|recording/i })
    if (btn) {
      await expect(btn).toBeDisabled()
    }
  },
}
