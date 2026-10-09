/**
 * The text block's type, set on the document root and reached into by element.
 * One class for the editor and the read-only render, so the two cannot drift.
 *
 * Every value is `PondAtom.dc.html`'s, desktop then mobile (`max-md:`):
 *   prose     — serif 200, 17.5 / 1.6 (17 on mobile), full ink; bold is the serif's 800
 *   heading   — the atom's six levels, sans: 1 → 38/700 upper, 2 → 22/700 upper,
 *               3 → 18/500, 4 → 16/500, 5 → 13.5/500, 6 → 11/500 upper .1em
 *   quote     — serif 200 italic 19 (18), −.01em
 *   code      — mono 12 (13) on ink 5%, 2px 6px, radius 6
 *   link      — underline at ink .3, offset 3, .75 on hover
 *   divider   — a hairline rule, 200 wide (280)
 *   empty     — the prose atom's `write something`, at ink .68
 * Blocks inside one text block sit on the page's own 16px rhythm (`Pond 06.07`).
 */
export const TEXT_PROSE_CLASS = [
  'font-serif font-extralight text-mn-text text-[17.5px] leading-[1.6] text-pretty outline-none max-md:text-[17px]',
  '[&>*+*]:mt-4',
  '[&_strong]:font-extrabold [&_em]:italic',
  '[&_h1]:font-sans [&_h1]:font-bold [&_h1]:uppercase [&_h1]:tracking-[-0.01em] [&_h1]:leading-none [&_h1]:text-[38px] max-md:[&_h1]:text-[30px]',
  '[&_h2]:font-sans [&_h2]:font-bold [&_h2]:uppercase [&_h2]:tracking-[-0.01em] [&_h2]:leading-[1.1] [&_h2]:text-[22px] max-md:[&_h2]:text-[20px]',
  '[&_h3]:font-sans [&_h3]:font-medium [&_h3]:leading-[1.3] [&_h3]:text-[18px] max-md:[&_h3]:text-[16px]',
  '[&_h4]:font-sans [&_h4]:font-medium [&_h4]:leading-[1.3] [&_h4]:text-[16px] max-md:[&_h4]:text-[15px]',
  '[&_h5]:font-sans [&_h5]:font-medium [&_h5]:leading-[1.4] [&_h5]:text-[13.5px]',
  '[&_h6]:font-sans [&_h6]:font-medium [&_h6]:uppercase [&_h6]:tracking-[0.1em] [&_h6]:leading-[1.4] [&_h6]:text-[11px]',
  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:pl-1 [&_li+li]:mt-1 [&_li>*+*]:mt-1',
  '[&_blockquote]:italic [&_blockquote]:tracking-[-0.01em] [&_blockquote]:text-[19px] max-md:[&_blockquote]:text-[18px]',
  '[&_code]:font-mono [&_code]:font-normal [&_code]:text-[12px] [&_code]:rounded-mn-chrome [&_code]:bg-mn-text/5 [&_code]:px-1.5 [&_code]:py-0.5 max-md:[&_code]:text-[13px]',
  '[&_pre]:whitespace-pre-wrap [&_pre]:rounded-mn-chrome [&_pre]:bg-mn-text/5 [&_pre]:px-1.5 [&_pre]:py-0.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_a]:cursor-pointer [&_a]:underline [&_a]:decoration-mn-mark-faint [&_a]:underline-offset-[3px] [&_a:hover]:opacity-75',
  '[&_hr]:w-[200px] [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-mn-line max-md:[&_hr]:w-[280px]',
  '[&_.is-editor-empty]:before:pointer-events-none [&_.is-editor-empty]:before:float-left [&_.is-editor-empty]:before:h-0 [&_.is-editor-empty]:before:text-mn-text-secondary [&_.is-editor-empty]:before:content-[attr(data-placeholder)]',
].join(' ')
