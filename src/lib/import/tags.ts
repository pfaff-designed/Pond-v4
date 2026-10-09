/**
 * What the reader does with each element, by tag. A tag not listed is a container:
 * its children are read in its place.
 */

export type Treatment =
  /** Words in a paragraph: a run of these and loose text is one paragraph. */
  | 'phrasing'
  /** The document's own metadata, which a page never shows. */
  | 'metadata'
  /** Markup a browser keeps but never shows. */
  | 'hidden'
  | 'script'
  | 'styling'
  | 'resource'
  | 'form'
  | 'control'
  | 'embed'
  | 'video'
  | 'audio'
  /** A picture drawn in the markup or by a script: a chart, or listed. */
  | 'drawing'
  | 'image'
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'definitions'
  | 'code'
  | 'table'
  | 'figure'
  | 'caption'
  | 'container'

const PHRASING = [
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'br',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'font',
  'i',
  'ins',
  'kbd',
  'label',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',
] as const

const TAGS = new Map<string, Treatment>([
  ...PHRASING.map((tag): [string, Treatment] => [tag, 'phrasing']),
  ...Object.entries({
    title: 'metadata',
    meta: 'metadata',
    base: 'metadata',
    template: 'hidden',
    script: 'script',
    noscript: 'script',
    style: 'styling',
    hr: 'styling',
    link: 'resource',
    form: 'form',
    button: 'control',
    input: 'control',
    select: 'control',
    textarea: 'control',
    iframe: 'embed',
    object: 'embed',
    embed: 'embed',
    applet: 'embed',
    frame: 'embed',
    frameset: 'embed',
    video: 'video',
    audio: 'audio',
    svg: 'drawing',
    canvas: 'drawing',
    img: 'image',
    picture: 'image',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
    p: 'paragraph',
    ul: 'list',
    ol: 'list',
    menu: 'list',
    blockquote: 'quote',
    dl: 'definitions',
    pre: 'code',
    table: 'table',
    figure: 'figure',
    figcaption: 'caption',
  } satisfies Record<string, Treatment>),
])

export const treatmentOf = (tag: string): Treatment => TAGS.get(tag) ?? 'container'

/** Inside a paragraph, these are parts of their own: lifted out, never words. */
const PARTS_INLINE = new Set<Treatment>([
  'script',
  'styling',
  'resource',
  'form',
  'control',
  'embed',
  'video',
  'audio',
  'drawing',
  'image',
  'table',
])

export const isPartInline = (tag: string): boolean => PARTS_INLINE.has(treatmentOf(tag))

/** Whether an element sits in a run of words: phrasing, or an image in a sentence. */
export const runsInline = (tag: string): boolean => treatmentOf(tag) === 'phrasing' || tag === 'img'

/** Elements whose content is never seen as text. */
const NO_TEXT = new Set<Treatment>(['script', 'styling', 'hidden'])

export const hasNoText = (tag: string): boolean => NO_TEXT.has(treatmentOf(tag))
