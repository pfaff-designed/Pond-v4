/**
 * The MONO picker chrome — `PondPicker`'s glass, head, group, note, foot and the
 * one segmented control — shared by the `/` menu (#278) and the source picker
 * (#280). The ⌘K palette (#279) is the SANS variant (padding 10, gap 2, head
 * `10px 12px 14px`, sans group eyebrows) and keeps its own strings in
 * `PondCommand.tsx`; ADR 0004 §4 keeps the two registers apart.
 *
 * #278 defined these inline in `SlashMenu.tsx`; #280 lifted them here unchanged
 * because the issue's reuse rule says "if #278 did not extract them, extract them
 * here" — one owner, two consumers, byte-identical strings.
 *
 * Every literal is `wayfinder/board-values.generated.json` `.components.PondPicker`
 * (`base.vals`, the mono branch of the board's `renderVals()`):
 *
 *   glass   border-box · padding 8 · radius 20 · mono · ink · column · gap 1
 *           → `.mn-glass` (globals.css) IS the board's recipe, light; dark follows
 *             the Shell's dark frames (ADR 0004 ruling 11) — one recipe, no copy here.
 *           Width is the kind's (300 slash · 340 source), appended by the consumer.
 *   head    flex · gap 10 · 8px 10px 10px · mb 4 · 1px ink .09 · mono 12 (mobile 13)
 *   headKey 10.5 · ink .8
 *   caret   1.5 × 15 · ink · ml -9
 *   group   8px 10px 5px · 10.5 · .04em · ink .68 — NO text-transform (ADR 0003, 3rd amendment)
 *   rule    the board's `G(' ')`: 1px ink .09 top · margin 4px 10px 0 · height 4 · no padding
 *   note    10px 10px · mono 12 (mobile 13) · 1.55 · ink .8 · text-wrap pretty
 *   foot    flex wrap · gap 14 · 9px 10px 4px · mt 4 · 1px ink .09 · 10.5 · ink .68
 *   seg     flex · gap 4 · padding 3 · margin 2px 10px 4px · radius 10 · ink .06 · mono
 *   segOpt  flex 1 · centred · 7px 0 · radius 8 · 12
 *           on:  full ink ground, paper text — the one place the picker inverts;
 *                `bg-mn-text` / `text-mn-surface` so both flip with the theme
 *           off: transparent · ink .8
 *
 * Class strings are template literals, not `cn()` (#252).
 */

export const GLASS =
  'mn-glass rounded-mn-card motion-menu fixed z-[100] box-border flex flex-col gap-[1px] p-[8px] font-mono text-mn-text'
/** Anchored above its field the glass grows from its bottom edge (ticket-41); `.motion-menu` reads this origin. */
export const GLASS_ABOVE = `${GLASS} [--motion-menu-origin:bottom_left]`
const HEAD_BASE =
  'mb-[4px] flex items-center gap-[10px] border-b border-mn-text/[0.09] px-[10px] pt-[8px] pb-[10px] font-mono'
export const HEAD = `${HEAD_BASE} text-[12px]`
export const HEAD_TEXT = 'min-w-0 truncate text-mn-text'
export const HEAD_KEY = 'text-[10.5px] text-mn-text-meta'
export const GROUP =
  'px-[10px] pt-[8px] pb-[5px] text-[10.5px] tracking-[.04em] text-mn-text-secondary'
export const RULE = 'mx-[10px] mt-[4px] h-[4px] border-t border-mn-text/[0.09]'
const NOTE_BASE =
  'px-[10px] py-[10px] font-mono leading-[1.55] text-mn-text-meta [text-wrap:pretty]'
export const NOTE = `${NOTE_BASE} text-[12px]`
/**
 * The board's row sets its type with the CSS font shorthand and no explicit
 * line-height, i.e. `line-height: normal` — not the page's inherited 1.5
 * (Tailwind's "leading" + "normal" utility, unbracketed, means 1.5 instead;
 * the bracketed form below is the literal CSS keyword).
 */
const ROW_BASE =
  'flex cursor-default items-center gap-[10px] rounded-[10px] px-[10px] font-mono leading-[normal] tracking-[.01em]'
export type PickerSize = 'desktop' | 'mobile'
/**
 * The chrome the DC's `size` swaps, for the mono pickers: the slash glass's width,
 * the head and note type, the row's padding and type, and the row's box height
 * (mobile rows are the 44px target; desktop's is padding plus one `line-height:
 * normal` line — measured against the board at 29px, not 7+7+18.75 as the page's
 * inherited 1.5 line-height would give).
 */
export const SLASH_SIZES = {
  desktop: {
    width: 'w-[300px]',
    widthPx: 300,
    head: HEAD,
    note: NOTE,
    row: `${ROW_BASE} py-[7px] text-[12.5px]`,
    rowHeight: 29,
  },
  mobile: {
    width: 'w-[340px]',
    widthPx: 340,
    head: `${HEAD_BASE} text-[13px]`,
    note: `${NOTE_BASE} text-[13px]`,
    row: `${ROW_BASE} min-h-[44px] py-[11px] text-[14px]`,
    rowHeight: 44,
  },
} as const satisfies Record<
  PickerSize,
  { width: string; widthPx: number; head: string; note: string; row: string; rowHeight: number }
>
/** Box heights outside the rows, for sizing a glass before it renders: a group head, the foot, the glass's padding and border. */
export const BOX_HEIGHT = { group: 26, foot: 32, glass: 18 } as const
export const FOOT =
  'mt-[4px] flex flex-wrap gap-[14px] border-t border-mn-text/[0.09] px-[10px] pt-[9px] pb-[4px] text-[10.5px] text-mn-text-secondary'
export const SEG =
  'mx-[10px] mt-[2px] mb-[4px] flex gap-[4px] rounded-[10px] bg-mn-text/[0.06] p-[3px] font-mono'
export const SEG_OPT = 'flex-1 cursor-default rounded-[8px] px-0 py-[7px] text-center text-[12px]'
export const SEG_OPT_ON = 'bg-mn-text text-mn-surface'
export const SEG_OPT_OFF = 'bg-transparent text-mn-text-meta'
/** The list's own box: the rows scroll, the head and foot stay. */
export const LIST = 'flex max-h-[60vh] flex-col gap-[1px] overflow-y-auto'
/** `LIST`'s `max-h-[60vh]`, as a fraction. */
export const LIST_MAX_VH = 0.6
