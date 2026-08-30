'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { WorkspaceProvider } from '@/lib/workspace/context'
import { SandboxBanner } from '@/components/molecules/SandboxBanner'
import { Rail } from '@/components/organisms/Rail'
import { TopBar } from '@/components/organisms/TopBar'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { AITerminal } from '@/components/organisms/AITerminal'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { NotifyBridge } from '@/lib/deletion/notify-bridge'

/**
 * Client shell that wraps the workspace UI in the correct WorkspaceProvider
 * scope based on the current route path. /sandbox → 'sandbox'; everything else
 * → 'main'. This is the only place the scope is determined; all children
 * (Rail, DocumentPanel, AITerminal, TopBar) read it via useWorkspace().
 */
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isSandbox = pathname?.startsWith('/sandbox') ?? false
  const workspace = isSandbox ? 'sandbox' : 'main'

  return (
    <WorkspaceProvider workspace={workspace}>
      <div className="flex flex-col h-full">
        {isSandbox && <SandboxBanner />}
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
            <NotifyBridge />
          </DeletionUndoProvider>
        </div>
        <Suspense fallback={<div className="h-72 border-t border-border bg-card" />}>
          <AITerminal />
        </Suspense>
      </div>
    </WorkspaceProvider>
  )
}
