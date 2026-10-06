import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Providers } from '@/components/providers'
import { MODE_BOOT_SCRIPT } from '@/lib/theme/mode-boot'
import './globals.css'

// The Make Noise type set: three licensed PP faces, self-hosted via
// next/font/local (issue #88). Serif ships ONLY 200/800 (+italics) so the
// browser can never synthesize a 400 weight — "serif-never-400" is enforced
// structurally by never loading the face at that weight.
//
// PP Neue Montreal — sans: titles, labels, rail, tables, numbers, answers.
const sans = localFont({
  variable: '--font-mn-sans',
  display: 'swap',
  src: [
    { path: './fonts/PPNeueMontreal-Regular.otf', weight: '400', style: 'normal' },
    { path: './fonts/PPNeueMontreal-Medium.otf', weight: '500', style: 'normal' },
    { path: './fonts/PPNeueMontreal-Bold.otf', weight: '700', style: 'normal' },
    { path: './fonts/PPNeueMontreal-BoldItalic.otf', weight: '700', style: 'italic' },
  ],
})

// PP Editorial New — serif: prose + display. ONLY 200 (Ultralight) and 800
// (Ultrabold), each with an italic. No 400 face exists to fall back on.
const serif = localFont({
  variable: '--font-mn-serif',
  display: 'swap',
  src: [
    { path: './fonts/PPEditorialNew-Ultralight.otf', weight: '200', style: 'normal' },
    { path: './fonts/PPEditorialNew-UltralightItalic.otf', weight: '200', style: 'italic' },
    { path: './fonts/PPEditorialNew-Ultrabold.otf', weight: '800', style: 'normal' },
    { path: './fonts/PPEditorialNew-UltraboldItalic.otf', weight: '800', style: 'italic' },
  ],
})

// PP Neue Montreal Mono — the machine surface: composer, palette, @-picker,
// diff cards, provenance chips. Set lowercase with tight letterspacing.
const mono = localFont({
  variable: '--font-mn-mono',
  display: 'swap',
  src: [
    { path: './fonts/PPNeueMontrealMono-Regular.otf', weight: '400', style: 'normal' },
    { path: './fonts/PPNeueMontrealMono-Medium.otf', weight: '500', style: 'normal' },
  ],
})

// Display voice reuses the Editorial serif face (the "punch" register).
const display = serif

export const metadata: Metadata = {
  title: 'Pond',
  description: 'A thinking partner',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable} ${display.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_BOOT_SCRIPT }} />
      </head>
      <body className="h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
