import { Sidebar } from '@/components/organisms/Sidebar'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { AITerminal } from '@/components/organisms/AITerminal'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      {/* Top: sidebar + document panel */}
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
          <DocumentPanel />
        </main>
      </div>

      {/* Bottom: full-width AI terminal */}
      <AITerminal />
    </div>
  )
}
