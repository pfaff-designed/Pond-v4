// Sandbox layout — workspace scope and banner are provided by WorkspaceShell
// in (app)/layout.tsx, which detects /sandbox from the path. This layout is a
// pass-through so the route segment exists.
export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
