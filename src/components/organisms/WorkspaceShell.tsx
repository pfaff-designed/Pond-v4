'use client'

import { Suspense, useState } from 'react'
import { usePathname } from 'next/navigation'
import { WorkspaceProvider } from '@/lib/workspace/context'
import { SandboxBanner } from '@/components/molecules/SandboxBanner'
import { Rail } from '@/components/organisms/Rail'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { AITerminal } from '@/components/organisms/AITerminal'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { NotifyBridge } from '@/lib/deletion/notify-bridge'
import { BreadcrumbSlotProvider } from '@/lib/layout/breadcrumb-slot'
import { RAIL_WIDTH_PX } from '@/lib/layout/rail-width'

/**
 * Client shell that wraps the workspace UI in the correct WorkspaceProvider
 * scope based on the current route path. /sandbox → 'sandbox'; everything else
 * → 'main'. This is the only place the scope is determined; all children
 * (Rail, DocumentPanel, AITerminal, ShellCommands) read it via useWorkspace().
 *
 * Paper, not frames (#96, `Pond 05 Shell`): the whole shell is ONE sheet of
 * paper (`bg-background`), and nothing is docked to an edge. The rail is a
 * paper card inset 20px from the top, left and bottom; the breadcrumb pill and
 * the composer are SHELL-level absolutes — both centred on the whole shell at
 * `left: calc(50% + 13px)`, the pill 20px off the top, the composer 24px off
 * the bottom (measured in the mockup) — with the page scrolling BEHIND them.
 * The pill's content belongs to the open surface, so the shell owns only its
 * slot (BreadcrumbSlotProvider) and the surface portals the trail into it.
 * The composer publishes its real height on this element
 * (`--pond-composer-clearance`) and the surfaces pad against it.
 */
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isSandbox = pathname?.startsWith('/sandbox') ?? false
  const workspace = isSandbox ? 'sandbox' : 'main'
  const [breadcrumbSlot, setBreadcrumbSlot] = useState<HTMLElement | null>(null)

  return (
    <WorkspaceProvider workspace={workspace}>
      <div className="flex flex-col h-full bg-background">
        {isSandbox && <SandboxBanner />}
        <div data-part="shell" className="relative flex flex-1 min-h-0">
          <DeletionUndoProvider>
            <BreadcrumbSlotProvider slot={breadcrumbSlot}>
              {/* The fallback reserves the rail's footprint (the card + its 20px
                  inset) so the content column doesn't jump when it lands. */}
              <Suspense
                fallback={<div className="my-5 ml-5 flex-shrink-0" style={{ width: RAIL_WIDTH_PX }} />}
              >
                <Rail />
              </Suspense>
              <div className="relative flex flex-col flex-1 min-h-0">
                {/* Content owns the full column height; the surfaces inside pad
                    their own bottom against the composer's published height. */}
                <main className="flex-1 overflow-y-auto">
                  {children}
                  <Suspense fallback={null}>
                    <DocumentPanel />
                  </Suspense>
                </main>
              </div>
              {/* The breadcrumb pill's slot (`Pond 05 Shell`: absolute, top 20,
                  left calc(50% + 13px), translateX(-50%)). Empty until the open
                  surface portals its trail in. */}
              <div
                ref={setBreadcrumbSlot}
                data-part="breadcrumb-slot"
                className="absolute top-5 left-[calc(50%_+_13px)] z-20 flex -translate-x-1/2 items-center gap-2"
              />
              <Suspense fallback={null}>
                <AITerminal />
              </Suspense>
              <Suspense fallback={null}>
                <ShellCommands />
              </Suspense>
              <NotifyBridge />
            </BreadcrumbSlotProvider>
          </DeletionUndoProvider>
        </div>
      </div>
    </WorkspaceProvider>
  )
}
