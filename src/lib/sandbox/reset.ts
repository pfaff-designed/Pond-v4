import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

/**
 * Reset the sandbox workspace for a user: wipes all sandbox rows from
 * `pages` and `conversations`, then re-seeds the fixture (2 areas + 1 demo
 * page) via the `reset_sandbox` RPC defined in migration 0005.
 */
export async function resetSandbox(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('reset_sandbox', { p_user_id: userId })
  if (error) throw new Error(error.message)
  void userId // referenced above
}

/**
 * Pure-function fixture that the reset produces — useful for test assertions
 * without hitting Supabase.
 */
export const SANDBOX_FIXTURE = {
  areas: ['Sandbox Area A', 'Sandbox Area B'],
  pages: ['Demo Page'],
} as const
