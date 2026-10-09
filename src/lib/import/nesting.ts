/**
 * How deep a file's tags nest, estimated in one linear pass before it is parsed.
 * The parser's cost grows with the square of the depth, and a few thousand levels
 * exhaust the stack of the tree it builds, so a file nested past `MAX_NESTING` is
 * refused unread.
 *
 * The estimate never runs short of the real depth by more than the few elements a
 * parser adds on its own (a table's body, a list's items): it counts each opened
 * tag that isn't void or allowed to stay open, less each end tag that closes one.
 * `/>` closes a tag only in a drawing (svg, MathML), as in a browser.
 */

/** Deeper than any page nests, and far inside what the parser walks quickly. */
export const MAX_NESTING = 1000

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

/** Tags a file may leave open, closed by the next of their kind or their parent's end. */
const OPTIONAL_END = new Set([
  'html',
  'head',
  'body',
  'p',
  'li',
  'dt',
  'dd',
  'option',
  'optgroup',
  'caption',
  'colgroup',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'rb',
  'rt',
  'rtc',
  'rp',
])

/** Elements whose content is text up to their own end tag, whatever it looks like. */
const RAW_TEXT = new Set([
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'noscript',
])

const DRAWINGS = ['svg', 'math']
/** Inside a drawing, these hold html again. */
const HTML_INSIDE = ['foreignobject', 'desc', 'annotation-xml', 'mi', 'mo', 'mn', 'ms', 'mtext']
/** An html tag inside a drawing ends the drawing, as in a browser. */
const LEAVES_DRAWING = new Set([
  'b',
  'big',
  'blockquote',
  'body',
  'br',
  'center',
  'code',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'embed',
  'font',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'hr',
  'i',
  'img',
  'li',
  'listing',
  'menu',
  'meta',
  'nobr',
  'ol',
  'p',
  'pre',
  'ruby',
  's',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'table',
  'tt',
  'u',
  'ul',
  'var',
])

const SLASH = 47

const isLetter = (code: number) => (code >= 97 && code <= 122) || (code >= 65 && code <= 90)
const isNameChar = (code: number) => isLetter(code) || (code >= 48 && code <= 57) || code === 45

const rawTextEnds = new Map<string, RegExp>()
const rawTextEnd = (name: string): RegExp => {
  const end = rawTextEnds.get(name) ?? new RegExp(`</${name}[\\s/>]`, 'gi')
  rawTextEnds.set(name, end)
  return end
}

/** The tags currently open, by name, and how deep that makes the file. */
const openTags = () => {
  const open = new Map<string, number>()
  let depth = 0
  const count = (names: readonly string[]) =>
    names.reduce((sum, name) => sum + (open.get(name) ?? 0), 0)
  return {
    get depth() {
      return depth
    },
    inDrawing: () => count(DRAWINGS) > 0 && count(HTML_INSIDE) === 0,
    leaveDrawing: () => DRAWINGS.forEach((name) => open.delete(name)),
    open: (name: string) => {
      open.set(name, (open.get(name) ?? 0) + 1)
      depth += 1
    },
    close: (name: string) => {
      const n = open.get(name) ?? 0
      if (n === 0) return
      open.set(name, n - 1)
      depth -= 1
    },
  }
}

/** Every search moves forward through the file, so the pass is linear in its length. */
export const nestsTooDeep = (html: string): boolean => {
  const tags = openTags()
  let tagEnd = -1
  let i = html.indexOf('<')
  while (i !== -1) {
    if (html.startsWith('<!--', i)) {
      const commentEnd = html.indexOf('-->', i + 4)
      if (commentEnd === -1) return false
      i = html.indexOf('<', commentEnd + 3)
      continue
    }
    const closing = html.charCodeAt(i + 1) === SLASH
    const nameStart = i + (closing ? 2 : 1)
    let nameEnd = nameStart
    while (nameEnd < html.length && isNameChar(html.charCodeAt(nameEnd))) nameEnd++
    if (nameEnd === nameStart || !isLetter(html.charCodeAt(nameStart))) {
      i = html.indexOf('<', i + 1)
      continue
    }
    if (tagEnd < nameEnd) tagEnd = html.indexOf('>', nameEnd)
    if (tagEnd === -1) return false
    const name = html.slice(nameStart, nameEnd).toLowerCase()
    if (closing) tags.close(name)
    else {
      const drawing = tags.inDrawing()
      if (drawing && LEAVES_DRAWING.has(name)) tags.leaveDrawing()
      const selfClosed =
        drawing && !LEAVES_DRAWING.has(name) && html.charCodeAt(tagEnd - 1) === SLASH
      if (!VOID.has(name) && !OPTIONAL_END.has(name) && !selfClosed) tags.open(name)
      if (tags.depth > MAX_NESTING) return true
    }
    if (closing || !RAW_TEXT.has(name) || tags.inDrawing()) {
      i = html.indexOf('<', tagEnd + 1)
      continue
    }
    const end = rawTextEnd(name)
    end.lastIndex = tagEnd + 1
    const found = end.exec(html)
    if (!found) return false
    i = found.index
  }
  return false
}
