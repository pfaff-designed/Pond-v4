/** The carried text, or null when there is no `ask` param. */
export function readAskParam(params: URLSearchParams): string | null {
  return params.get('ask')
}

/** `pathname` with `?ask=` removed but every other param kept, in order. */
export function urlWithoutAsk(pathname: string, params: URLSearchParams): string {
  const rest = new URLSearchParams(params)
  rest.delete('ask')
  const query = rest.toString()
  return query ? `${pathname}?${query}` : pathname
}
