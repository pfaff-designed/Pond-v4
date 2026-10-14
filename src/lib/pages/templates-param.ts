/**
 * The one-shot `?templates=1` carried through navigation from the new-page
 * menu's "from a template" row: the fresh page it lands on reads it once to
 * open the `/` menu on its templates, then strips it so a reload never
 * replays it — the same shape as `ask-param.ts`'s `?ask=`.
 */

/** Whether `?templates=1` is carried. */
export function readTemplatesParam(params: URLSearchParams): boolean {
  return params.get('templates') === '1'
}

/** `url` with `?templates=1` appended, carrying the signal through navigation. */
export function withTemplatesParam(url: string): string {
  const [pathname, query = ''] = url.split('?')
  const params = new URLSearchParams(query)
  params.set('templates', '1')
  return `${pathname}?${params.toString()}`
}

/** `pathname` with `?templates=` removed but every other param kept, in order. */
export function urlWithoutTemplates(pathname: string, params: URLSearchParams): string {
  const rest = new URLSearchParams(params)
  rest.delete('templates')
  const query = rest.toString()
  return query ? `${pathname}?${query}` : pathname
}
