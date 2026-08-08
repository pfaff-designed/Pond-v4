import { createClient } from '@/lib/supabase/server'
import { getPage } from '@/lib/pages/client'
import { embedPage } from '@/lib/embeddings/documents'

/**
 * Re-embed a page's current content so semantic retrieval (fetch_context) stays
 * in sync with edits. Called by the page editor after a save. Embedding runs
 * server-side because it needs the OpenAI key; RLS (cookie client) scopes access
 * to the caller's own pages.
 */
export async function POST(req: Request) {
  const { pageId } = (await req.json()) as { pageId?: string }
  if (!pageId) return new Response('pageId required', { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('unauthorized', { status: 401 })

  const page = await getPage(supabase, pageId)
  if (!page) return new Response('not found', { status: 404 })

  await embedPage(supabase, { id: page.id, title: page.title, blocks: page.blocks })
  return Response.json({ ok: true })
}
