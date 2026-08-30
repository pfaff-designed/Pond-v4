'use client'

import { createContext, useContext } from 'react'

export type WorkspaceScope = 'main' | 'sandbox'

const WorkspaceContext = createContext<WorkspaceScope>('main')

export function WorkspaceProvider({
  workspace,
  children,
}: {
  workspace: WorkspaceScope
  children: React.ReactNode
}) {
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceScope {
  return useContext(WorkspaceContext)
}
