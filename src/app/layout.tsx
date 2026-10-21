import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Providers } from '@/components/providers'
import { MODE_BOOT_SCRIPT } from '@/lib/theme/mode-boot'
import './globals.css'

// Sans and mono are the licensed PP faces, self-hosted via next/font/local
// (issue #88). The serif is Georgia, a system face: page prose and display
// use it instead of PP Editorial New.
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

export const metadata: Metadata = {
  title: 'Pond',
  description: 'A thinking partner',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
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
