import { redirect } from 'next/navigation'

// Root redirects to the app workspace.
// The middleware handles auth-gating; this just ensures / → /workspace.
export default function RootPage() {
  redirect('/workspace')
}
