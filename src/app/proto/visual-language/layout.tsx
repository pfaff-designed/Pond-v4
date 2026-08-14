/**
 * THROWAWAY prototype route layout (ticket-14). Loads the font families the 15
 * variants draw from and exposes them as CSS variables scoped to this subtree —
 * the app's real globals.css / Geist setup is untouched.
 *
 *   --proto-font-sans     Inter            (humanist neutral body)
 *   --proto-font-grotesk  Space Grotesk    (engineered / technical display)
 *   --proto-font-serif    Fraunces         (warm expressive serif, variable)
 *   --proto-font-mono     JetBrains Mono   (code / labels / metrics)
 *   --proto-font-display  Instrument Serif (elegant editorial display)
 */

import type { ReactNode } from 'react'
import { Inter, Space_Grotesk, Fraunces, JetBrains_Mono, Instrument_Serif } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--proto-font-sans', display: 'swap' })
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--proto-font-grotesk', display: 'swap' })
const fraunces = Fraunces({ subsets: ['latin'], variable: '--proto-font-serif', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--proto-font-mono', display: 'swap' })
const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--proto-font-display',
  display: 'swap',
})

export default function VisualLanguageLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${inter.variable} ${grotesk.variable} ${fraunces.variable} ${mono.variable} ${display.variable}`}
    >
      {children}
    </div>
  )
}
