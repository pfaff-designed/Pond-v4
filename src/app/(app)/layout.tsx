import { Suspense } from 'react'
import { Sidebar } from '@/components/organisms/Sidebar'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { AITerminal } from '@/components/organisms/AITerminal'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      {/* Top: sidebar + document panel */}
      <div className="flex flex-1 min-h-0">
        <Suspense
          fallback={<div className="w-64 flex-shrink-0 border-r border-zinc-200 bg-zinc-50" />}
        >
          <Sidebar />
        </Suspense>
        <main className="flex-1 overflow-y-auto">
          {children}
          <Suspense fallback={null}>
            <DocumentPanel />
          </Suspense>
        </main>
      </div>

      {/* Bottom: full-width AI terminal */}
      <Suspense fallback={<div className="h-72 border-t border-zinc-200 bg-white" />}>
        <AITerminal />
      </Suspense>
    </div>
  )
}
