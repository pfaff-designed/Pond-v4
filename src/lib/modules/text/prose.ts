import { POND_ATOM_EMPTY } from '@/components/atoms/PondAtom'

/**
 * Rule 2 (KAN-345): the caret's own empty text line, not the generic atom copy —
 * it reads in the machine register so it can't be mistaken for serif page prose.
 * Exported: rule 3's trailing-gap ghost row (`TrailingBlockGap`) reads the SAME
 * copy the line it opens will show, never a second hardcoded string.
 */
export const PROSE_LINE_PLACEHOLDER = 'type, or / for blocks'

/**
 * The machine register's own type (6f, `PROJECT_RULES.md`): mono, 13px, tracking
 * .02em, lowercase, ink .68. One home for every surface that must read as machine
 * type rather than page prose — the untouched-page hint (`UNTOUCHED_HINT_CLASS`),
 * the focused empty line's own placeholder (`TEXT_PROSE_CLASS`), and the
 * trailing-gap ghost row (`TrailingBlockGap`) — so a click from the ghost row to
 * the real line changes nothing about the type, only which element is real.
 * `TrailingBlockGap` imports this directly (a real element takes bare utility
 * classes); the two `::before` rules below restate its five values against their
 * own selectors by hand — Tailwind's content scanner needs each variant+utility
 * pair to exist as complete literal text, so composing them from this string at
 * runtime would silently generate no CSS at all.
 */
export const MACHINE_HINT_FRAGMENT = 'font-mono text-[13px] tracking-[0.02em] lowercase text-mn-text-secondary'

/**
 * What a blank text block's line reads: the block's own `placeholder`, or — when
 * it carries none — `PROSE_LINE_PLACEHOLDER`, except a heading, which keeps the
 * atom's own empty copy.
 */
export const textPlaceholderFor = (lineType: string, placeholder?: string | null): string =>
  placeholder ?? (lineType === 'heading' ? POND_ATOM_EMPTY.heading : PROSE_LINE_PLACEHOLDER)

/**
 * Structure every reading of a text block shares, whatever type it is set in.
 * The first line wraps text as the editor's own surface (ProseMirror's injected
 * style) does, so the static render breaks lines where the editor would. That
 * style also turns ligatures off, which no board does; it is unlayered, so only
 * an `!important` utility turns them back on.
 *
 *   link      — underline at ink .3, offset 3, .75 on hover (`PondAtom.dc.html`)
 *   divider   — 1px at ink .09 in both themes, 200 wide (280), 12px above and below
 *               (`PondAtom.dc.html` rule)
 *   code      — mono on ink 5%, radius 6; inline 2px 6px (`PondAtom.dc.html` code).
 *               A code block has no board: it takes the same ground and radius with
 *               its own 12px 14px, so a multi-line block isn't drawn as one chip.
 *   lists     — no board: disc / decimal, 20px indent, 4px item text inset, 4px
 *               between items and between an item's own blocks.
 */
const TEXT_STRUCTURE = [
  'whitespace-break-spaces break-words [font-variant-ligatures:normal]! [font-feature-settings:normal]!',
  '[&_em]:italic [&_blockquote]:italic',
  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:pl-1 [&_li+li]:mt-1 [&_li>*+*]:mt-1',
  '[&_code]:font-mono [&_code]:font-normal [&_code]:rounded-mn-chrome [&_code]:bg-mn-text/5 [&_code]:px-1.5 [&_code]:py-0.5',
  '[&_pre]:whitespace-pre-wrap [&_pre]:rounded-mn-chrome [&_pre]:bg-mn-text/5 [&_pre]:px-3.5 [&_pre]:py-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_a]:cursor-pointer [&_a]:underline [&_a]:decoration-mn-mark-faint [&_a]:underline-offset-[3px] [&_a:hover]:opacity-75',
  '[&_hr]:my-3 [&_hr+*]:mt-0 [&_hr]:w-[200px] [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-mn-text/9 max-md:[&_hr]:w-[280px]',
].join(' ')

/**
 * The text block's type on a page, set on the document root and reached into by
 * element. One class for the editor and the read-only render, so the two cannot
 * drift.
 *
 * Every value is `PondAtom.dc.html`'s, desktop then mobile (`max-md:`):
 *   prose     — serif 200, 17.5 / 1.6 (17 on mobile), full ink; bold is the serif's 800
 *   heading   — the atom's six levels, sans: 1 → 38/700 upper, 2 → 22/700 upper,
 *               3 → 18/500, 4 → 16/500, 5 → 13.5/500, 6 → 11/500 upper .1em
 *   quote     — serif 200 italic 19 (18), −.01em
 *   code      — 12 (13)
 *   empty     — the line's own empty copy (`untitled`, `type, or / for blocks`), at ink .68.
 *               A heading's `untitled` draws whether or not its editor has focus;
 *               every other empty line (KAN-345 rule 2) draws only while its own
 *               editor carries ProseMirror's `.ProseMirror-focused` class — never
 *               at rest, so an abandoned empty line shows nothing until re-focused.
 * Blocks inside one text block sit on the page's own 16px rhythm (`Pond 06.07`).
 */
export const TEXT_PROSE_CLASS = [
  'font-serif font-extralight text-mn-text text-[17.5px] leading-[1.6] text-pretty outline-none max-md:text-[17px]',
  '[&>*+*]:mt-4',
  '[&_strong]:font-extrabold',
  '[&_h1]:font-sans [&_h1]:font-bold [&_h1]:uppercase [&_h1]:tracking-[-0.01em] [&_h1]:leading-none [&_h1]:text-[38px] max-md:[&_h1]:text-[30px]',
  '[&_h2]:font-sans [&_h2]:font-bold [&_h2]:uppercase [&_h2]:tracking-[-0.01em] [&_h2]:leading-[1.1] [&_h2]:text-[22px] max-md:[&_h2]:text-[20px]',
  '[&_h3]:font-sans [&_h3]:font-medium [&_h3]:leading-[1.3] [&_h3]:text-[18px] max-md:[&_h3]:text-[16px]',
  '[&_h4]:font-sans [&_h4]:font-medium [&_h4]:leading-[1.3] [&_h4]:text-[16px] max-md:[&_h4]:text-[15px]',
  '[&_h5]:font-sans [&_h5]:font-medium [&_h5]:leading-[1.4] [&_h5]:text-[13.5px]',
  '[&_h6]:font-sans [&_h6]:font-medium [&_h6]:uppercase [&_h6]:tracking-[0.1em] [&_h6]:leading-[1.4] [&_h6]:text-[11px]',
  '[&_blockquote]:tracking-[-0.01em] [&_blockquote]:text-[19px] max-md:[&_blockquote]:text-[18px]',
  '[&_code]:text-[12px] max-md:[&_code]:text-[13px]',
  '[&_:is(.is-editor-empty,.is-empty)]:before:pointer-events-none [&_:is(.is-editor-empty,.is-empty)]:before:float-left [&_:is(.is-editor-empty,.is-empty)]:before:h-0 [&_:is(.is-editor-empty,.is-empty)]:before:text-mn-text-secondary',
  // Tailwind's `before:` variant always injects `content: var(--tw-content)`
  // (default `''`), so the line above alone paints an empty `::before` box at
  // rest. Pin it to `none` unconditionally; the two higher-specificity rules
  // below (two classes each) override it back to the placeholder text.
  '[&_:is(.is-editor-empty,.is-empty)]:before:content-none',
  // A heading's placeholder draws regardless of focus (left as-is, KAN-345's scope
  // is the prose copy only). Every other empty line only draws its `::before`
  // once this editor's own DOM root — the element `.ProseMirror-focused` lands on
  // — carries that class; `showOnlyCurrent`'s decoration otherwise survives a blur.
  // Tiptap's Placeholder only adds `is-editor-empty` when the WHOLE doc is empty
  // (`buildPlaceholderDecorations`'s `isEmptyDoc`); Return inside non-empty content
  // opens a second paragraph that is merely `is-empty` (the current, anchor-holding
  // node under `showOnlyCurrent`) — matched here too, so that line's placeholder
  // paints while focused, never at rest.
  '[&_:is(h1,h2,h3,h4,h5,h6).is-editor-empty]:before:content-[attr(data-placeholder)]',
  '[&.ProseMirror-focused_:is(.is-editor-empty,.is-empty)]:before:content-[attr(data-placeholder)]',
  // Rule 2's machine register (`MACHINE_HINT_FRAGMENT`), scoped off headings —
  // a heading's "untitled" stays in the heading's own sans/bold/uppercase type.
  '[&.ProseMirror-focused_:is(.is-editor-empty,.is-empty):not(:is(h1,h2,h3,h4,h5,h6))]:before:font-mono',
  '[&.ProseMirror-focused_:is(.is-editor-empty,.is-empty):not(:is(h1,h2,h3,h4,h5,h6))]:before:text-[13px]',
  '[&.ProseMirror-focused_:is(.is-editor-empty,.is-empty):not(:is(h1,h2,h3,h4,h5,h6))]:before:tracking-[0.02em]',
  '[&.ProseMirror-focused_:is(.is-editor-empty,.is-empty):not(:is(h1,h2,h3,h4,h5,h6))]:before:lowercase',
  '[&.ProseMirror-focused_:is(.is-editor-empty,.is-empty):not(:is(h1,h2,h3,h4,h5,h6))]:before:text-mn-text-secondary',
  TEXT_STRUCTURE,
].join(' ')

/**
 * 6f frame 1: an untouched page's one hint line reads in the machine surface's
 * mono (13px, tracking .02em), not the block's ordinary inherited serif
 * placeholder — scoped to that one block's wrapper (`BlockCanvas` threads
 * `untouched` to only the first block's render), never to `TEXT_PROSE_CLASS`
 * itself, so every other block's placeholder stands. The `:is([data-text-prose],
 * .ProseMirror)` hop is `ZEN_PROSE_CLASS`'s own trick: it outranks
 * `TEXT_PROSE_CLASS`'s `before:` rule on specificity alone, so this wins
 * regardless of the two classes' order in the compiled stylesheet.
 *
 * "Hint 6px after the caret" (6f frame 1): the hint's own `::before` carries a
 * 6px left margin so it doesn't sit flush against the caret. The caret itself
 * is the browser's native caret, not part of this rule — it isn't offset, so
 * typing still starts at the line's own left edge, not at the hint's inset.
 *
 * Carries `MACHINE_HINT_FRAGMENT`'s five values against its own selector (see
 * that constant's comment for why they can't be composed from it at runtime),
 * plus the 6px margin above, which belongs to this one hint, not the fragment.
 */
export const UNTOUCHED_HINT_CLASS = [
  '[&_:is([data-text-prose],.ProseMirror)_.is-editor-empty]:before:font-mono',
  '[&_:is([data-text-prose],.ProseMirror)_.is-editor-empty]:before:text-[13px]',
  '[&_:is([data-text-prose],.ProseMirror)_.is-editor-empty]:before:tracking-[0.02em]',
  '[&_:is([data-text-prose],.ProseMirror)_.is-editor-empty]:before:lowercase',
  '[&_:is([data-text-prose],.ProseMirror)_.is-editor-empty]:before:text-mn-text-secondary',
  '[&_:is([data-text-prose],.ProseMirror)_.is-editor-empty]:before:ml-[6px]',
].join(' ')

/**
 * Rule 3's fix (KAN-345): when the last block is already an empty text line,
 * hovering the trailing gap below it must paint THIS line's own placeholder,
 * not a second ghost row drawn below it — the drawn text and the line a
 * click focuses are never two different elements. Scoped to the wrapper
 * `BlockCanvas` renders around that one block (`data-hover-ghost`'s own
 * element), reaching into its `.ProseMirror` to beat `TEXT_PROSE_CLASS`'s
 * unconditional `content-none` rule on specificity (three classes to two) —
 * independent of focus, which is the one thing `.ProseMirror-focused`-gated
 * rule can't give a merely-hovered, unfocused line. Restates
 * `MACHINE_HINT_FRAGMENT`'s five values for the same reason `TEXT_PROSE_CLASS`
 * and `UNTOUCHED_HINT_CLASS` already do (see that constant's comment).
 */
export const HOVER_GHOST_CLASS = [
  '[&_.ProseMirror_.is-editor-empty]:before:content-[attr(data-placeholder)]',
  '[&_.ProseMirror_.is-editor-empty]:before:font-mono',
  '[&_.ProseMirror_.is-editor-empty]:before:text-[13px]',
  '[&_.ProseMirror_.is-editor-empty]:before:tracking-[0.02em]',
  '[&_.ProseMirror_.is-editor-empty]:before:lowercase',
  '[&_.ProseMirror_.is-editor-empty]:before:text-mn-text-secondary',
].join(' ')

/**
 * A text block inside a diff line: the same document in the line's own mono type
 * (`Pond 07.07` draws a text block's change as a plain diff line), its blocks a
 * line apart, headings and bold at the mono's 500.
 */
export const TEXT_DIFF_PROSE_CLASS = [
  '[&>*+*]:mt-1 [&_strong]:font-medium [&_:is(h1,h2,h3,h4,h5,h6)]:font-medium',
  TEXT_STRUCTURE,
].join(' ')
