/**
 * Resolving a page reference — a UUID or a title — to a page id. Framework-agnostic.
 */

// ── UUID validation ────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Resolve a parent reference that may be a UUID or a page title, to a page id.
 *  #312: the title lookup is scoped to the pond, so an AI-proposed parent title
 *  resolves against THIS pond's pages only (a UUID needs no scope — it's exact).
 *  Unscoped, a title shared by two ponds filed the new page in the wrong one. */
export async function resolveParentId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  userId: string,
  idOrName: string,
  /** #312: the pond to write into. See `CreatePageInput.pondId`. */
  pondId: string | null
): Promise<string> {
  if (UUID_RE.test(idOrName)) return idOrName
  let q = sb.from('pages').select('id').eq('user_id', userId)
  // Conditional: `.eq('pond_id', null)` would match only rows with NO pond.
  if (pondId) q = q.eq('pond_id', pondId)
  const { data, error } = await q.ilike('title', idOrName).limit(1).maybeSingle()
  if (error || !data) throw new Error(`Page "${idOrName}" not found`)
  return data.id as string
}
