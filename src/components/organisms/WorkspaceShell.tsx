'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { WorkspaceProvider } from '@/lib/workspace/context'
import { SandboxBanner } from '@/components/molecules/SandboxBanner'
import { Rail } from '@/components/organisms/Rail'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { AITerminal } from '@/components/organisms/AITerminal'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { NotifyBridge } from '@/lib/deletion/notify-bridge'

/**
 * Client shell that wraps the workspace UI in the correct WorkspaceProvider
 * scope based on the current route path. /sandbox → 'sandbox'; everything else
 * → 'main'. This is the only place the scope is determined; all children
 * (Rail, DocumentPanel, AITerminal, ShellCommands) read it via useWorkspace().
 *
 * Paper, not frames (#96, `Pond 05 Shell`): the whole shell is ONE sheet of
 * paper (`bg-background`), and nothing is docked to an edge. The rail is a
 * floating glass card inset 20px from the top, left and bottom; the page's
 * breadcrumb pill floats at the head of the content column; the composer floats
 * over the bottom of that column (BUILD-BRIEF-float-chat-over-content), with the
 * content scrolling BEHIND it rather than stopping where a chat band begins.
 */
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isSandbox = pathname?.startsWith('/sandbox') ?? false
  const workspace = isSandbox ? 'sandbox' : 'main'

  return (
    <WorkspaceProvider workspace={workspace}>
      <div className="flex flex-col h-full bg-background">
        {isSandbox && <SandboxBanner />}
        <div className="relative flex flex-1 min-h-0">
          <DeletionUndoProvider>
            {/* The fallback reserves the rail's footprint (206px card + its
                20px inset) so the content column doesn't jump when it lands. */}
            <Suspense fallback={<div className="my-5 ml-5 w-[206px] flex-shrink-0" />}>
              <Rail />
            </Suspense>
            <div className="relative flex flex-col flex-1 min-h-0">
              {/* Content owns the full column height; the bottom padding lets
                  the last lines scroll clear of the floating composer. */}
              <main className="flex-1 overflow-y-auto pb-72">
                {children}
                <Suspense fallback={null}>
                  <DocumentPanel />
                </Suspense>
              </main>
              <Suspense fallback={null}>
                <AITerminal />
              </Suspense>
            </div>
            <Suspense fallback={null}>
              <ShellCommands />
            </Suspense>
            <NotifyBridge />
          </DeletionUndoProvider>
        </div>
      </div>
    </WorkspaceProvider>
  )
}
