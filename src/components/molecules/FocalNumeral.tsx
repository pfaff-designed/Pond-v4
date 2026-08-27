/**
 * The one focal element of an overview surface: an oversized Instrument-Serif
 * numeral with a calm serif caption at its baseline — the Press signature.
 */

export function FocalNumeral({ value, caption }: { value: string; caption: string }) {
  return (
    <div className="flex items-baseline gap-5">
      <span
        className="font-display text-[88px] leading-[0.84] text-foreground whitespace-nowrap tracking-[-0.02em]"
        style={{ fontFeatureSettings: '"lnum" 1' }}
      >
        {value}
      </span>
      <span className="font-serif text-xl leading-[1.35] text-press-body max-w-[260px] pb-1.5">
        {caption}
      </span>
    </div>
  )
}
