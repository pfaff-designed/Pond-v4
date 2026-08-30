import { WorkspaceShell } from '@/components/organisms/WorkspaceShell'

/**
 * App layout — delegates to WorkspaceShell which determines workspace scope
 * (main vs. sandbox) from the URL path and provides it to all descendants via
 * WorkspaceProvider. Rail, DocumentPanel, AITerminal, and TopBar all read
 * workspace from context and scope their queries accordingly.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>
}
