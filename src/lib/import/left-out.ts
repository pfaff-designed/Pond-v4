/**
 * What isn't carried over (6z frame 4): "a second card names every part with no
 * matching block, and why … each part by what it is: the map, the site’s links,
 * styling, a form." One entry per kind of part, so ten forms are one line.
 */
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachments/validate'
import type { LeftOut } from './types'

const MAX_ATTACHMENT_MB = MAX_ATTACHMENT_BYTES / (1024 * 1024)

interface Kind {
  one: string
  many: (count: number) => string
  why: string
}

const counted = (noun: string) => (count: number) => `${count} ${noun}`
const same = (name: string) => () => name

/** In card order: what was on the page first, then the site around it, then the code. */
const LEFT_OUT_KINDS = {
  map: {
    one: 'the map',
    many: counted('maps'),
    why: 'drawn by a script. no block reads it.',
  },
  video: {
    one: 'the video',
    many: counted('videos'),
    why: 'played by a script or another site. no block plays it.',
  },
  audio: {
    one: 'the audio',
    many: counted('audio clips'),
    why: 'played by the browser. no block plays it.',
  },
  app: {
    one: 'an embedded app',
    many: counted('embedded apps'),
    why: 'another site running inside the page. no block runs it.',
  },
  chartPicture: {
    one: 'the chart, drawn as a picture',
    many: (count: number) => `${count} charts, drawn as pictures`,
    why: 'a chart must read a table, and the file has only the picture.',
  },
  scriptPicture: {
    one: 'a picture drawn by a script',
    many: counted('pictures drawn by a script'),
    why: 'a script draws it when the page runs. pond never runs scripts.',
  },
  drawing: {
    one: 'a drawing',
    many: counted('drawings'),
    why: 'drawn in the file’s own markup. no block holds it.',
  },
  imageBeside: {
    one: 'an image kept beside the file',
    many: counted('images kept beside the file'),
    why: 'the file points to it where it was saved, and only the file came in.',
  },
  imageTooLarge: {
    one: `an image over ${MAX_ATTACHMENT_MB} MB`,
    many: counted(`images over ${MAX_ATTACHMENT_MB} MB`),
    why: `pond keeps images up to ${MAX_ATTACHMENT_MB} MB.`,
  },
  imageUnfetched: {
    one: 'an image that couldn’t be fetched',
    many: counted('images that couldn’t be fetched'),
    why: 'the site it links to didn’t send it.',
  },
  notAnImage: {
    one: 'a link that isn’t an image',
    many: counted('links that aren’t images'),
    why: 'the file shows it as an image, but the site sent something else.',
  },
  form: {
    one: 'a form',
    many: counted('forms'),
    why: 'it sends what you type somewhere. pond pages don’t send.',
  },
  controls: {
    one: 'the buttons',
    many: same('the buttons'),
    why: 'they only work with the file’s scripts.',
  },
  siteLinks: {
    one: 'the site’s links',
    many: same('the site’s links'),
    why: 'the site’s own navigation, not the page.',
  },
  scripts: {
    one: 'scripts',
    many: same('scripts'),
    why: 'code the file runs. pond never runs it.',
  },
  styling: {
    one: 'styling',
    many: same('styling'),
    why: 'fonts and colours. pond’s own type is used.',
  },
} satisfies Record<string, Kind>

export type LeftOutKind = keyof typeof LEFT_OUT_KINDS

const ORDER = Object.keys(LEFT_OUT_KINDS) as LeftOutKind[]

export interface LeftOutCollector {
  add: (kind: LeftOutKind, from: string) => void
  list: () => LeftOut[]
}

/** Gathers parts as the reader meets them and words them once, in card order. */
export const collectLeftOut = (): LeftOutCollector => {
  const seen = new Map<LeftOutKind, { count: number; from: string[] }>()
  return {
    add: (kind, from) => {
      const entry = seen.get(kind) ?? { count: 0, from: [] }
      entry.count += 1
      if (!entry.from.includes(from)) entry.from.push(from)
      seen.set(kind, entry)
    },
    list: () =>
      ORDER.flatMap((kind) => {
        const entry = seen.get(kind)
        if (!entry) return []
        const words: Kind = LEFT_OUT_KINDS[kind]
        const name = entry.count === 1 ? words.one : words.many(entry.count)
        return [{ name, why: words.why, from: entry.from }]
      }),
  }
}
