import type { Metadata } from 'next'
import { Inter, Fraunces, JetBrains_Mono, Instrument_Serif } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

// The Press type set (R6, locked): Inter body · Fraunces serif · JetBrains Mono
// labels/metrics · Instrument Serif display numerals. Exposed as CSS variables
// that globals.css maps onto the Tailwind font-* utilities.
const sans = Inter({
  variable: '--font-press-sans',
  subsets: ['latin'],
})

const serif = Fraunces({
  variable: '--font-press-serif',
  subsets: ['latin'],
})

const mono = JetBrains_Mono({
  variable: '--font-press-mono',
  subsets: ['latin'],
})

const display = Instrument_Serif({
  variable: '--font-press-display',
  subsets: ['latin'],
  weight: '400',
})

export const metadata: Metadata = {
  title: 'Pond',
  description: 'A thinking partner',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
