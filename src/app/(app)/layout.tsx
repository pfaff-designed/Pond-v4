import { Suspense } from 'react'
import { Rail } from '@/components/organisms/Rail'
import { TopBar } from '@/components/organisms/TopBar'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { AITerminal } from '@/components/organisms/AITerminal'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      {/* Top: sidebar + document panel. `relative` anchors the single undo-toast
          viewport (rendered by the provider) bottom-right of this row, clear of
          the AI terminal below. */}
      <div className="relative flex flex-1 min-h-0">
        <DeletionUndoProvider>
          <Suspense fallback={<div className="w-[250px] flex-shrink-0" />}>
            <Rail />
          </Suspense>
          <main className="flex-1 overflow-y-auto">
            {children}
            <Suspense fallback={null}>
              <DocumentPanel />
            </Suspense>
          </main>
          <TopBar />
        </DeletionUndoProvider>
      </div>

      {/* Bottom: full-width AI terminal */}
      <Suspense fallback={<div className="h-72 border-t border-border bg-card" />}>
        <AITerminal />
      </Suspense>
    </div>
  )
}
