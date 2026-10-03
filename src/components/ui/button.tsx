import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'
import { cn } from '@/lib/utils'

// The shadcn/base-ui button primitive, reconciled with `PondControl.dc.html`
// (#221). It is the PRIMITIVE layer: press semantics, `aria-haspopup` /
// `aria-expanded` wiring the menus style against, focus management. The board's
// appearance rides on top; `PondControl kind="button"` is the Pond-level wrapper.
//
// Every value is a literal from `wayfinder/board-values.generated.json`
// (`.components.PondControl`), the board's own `renderVals()` output:
//
//   btn        inline-flex · gap 6 · h32 / px14 / 12px (mobile h44 / px20 / 14) ·
//              radius 999 · sans 500 · nowrap
//   primary    ink ground, paper label · hover opacity .9 (NOT a colour change)
//   secondary  ink .07 ground, ink .8 label · hover/selected .12
//   ghost      transparent · inset 1px ink .2 · hover/selected .07
//   quiet      transparent · inset 1px ink .4 · hover .07
//   focus      the mist ring (`focus-ring.ts`) — not shadcn's 3px `--ring` ink
//   disabled   opacity .4 + inert
//
// The washes are written as literals (`bg-mn-text/[0.07]`), NOT routed through
// `--secondary` / `--mn-hair`: those are shared role tokens (`--mn-wash` is
// "cards, chips, code"; `--mn-hair` is the repo's hairline) and both were measured
// divergent — `--secondary` is .06 light and PAPER .1 dark; `--mn-hair` is .055,
// ~4× fainter than the board's ring. A board value is final for its component, not
// for a global role.
//
// Variants: the board's four and nothing else. `default`, `outline`, `link` and
// `destructive` are gone — no board draws them, and `destructive` resolved to ink
// once red went back to diff removals (#220): a destructive confirm is the PRIMARY
// action of its dialog and the warning lives in the dialog's words.
//
// Sizes: `desktop` / `mobile` are the board's own axis. `sm` and `xs` are NOT this
// board's — they are the composer's diff-card actions (`PondComposer.dc.html`
// `diffActions`, fontSize 10.5 / gap 8 — #230) and the dialog/modal surfaces
// `Pond 02` does not draw. They stay until those boards rule on them; forcing them
// to 32px would be ADR 0003's third-amendment mistake. `lg` and the four `icon-*`
// sizes had zero call sites and no board — deleted.

/** The board's per-variant hover / selected grounds (`vb`), as the bare classes
 *  `PondControl` forces for its `state` matrix. The cva below wears the same
 *  values under `hover:` / `aria-expanded:` — two spellings because Tailwind's
 *  scanner needs each full literal, one fact. */
export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>

export const buttonStateGround: Record<ButtonVariant, { hover: string; selected: string }> = {
  primary: { hover: 'opacity-90', selected: '' },
  secondary: { hover: 'bg-mn-text/[0.12]', selected: 'bg-mn-text/[0.12]' },
  ghost: { hover: 'bg-mn-text/[0.07]', selected: 'bg-mn-text/[0.07]' },
  quiet: { hover: 'bg-mn-text/[0.07]', selected: '' },
}

const buttonVariants = cva(
  `group/button box-border inline-flex shrink-0 items-center justify-center gap-1.5 rounded-mn-pill font-sans font-medium whitespace-nowrap transition-all select-none ${FOCUS_VISIBLE_RING} active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
  {
    variants: {
      variant: {
        primary:
          'bg-mn-text text-raw-paper hover:opacity-90 aria-expanded:opacity-90 dark:text-raw-ink',
        secondary:
          'bg-mn-text/[0.07] text-mn-text/80 hover:bg-mn-text/[0.12] aria-expanded:bg-mn-text/[0.12]',
        ghost:
          'bg-transparent text-mn-text ring-1 ring-mn-text/20 ring-inset hover:bg-mn-text/[0.07] aria-expanded:bg-mn-text/[0.07]',
        quiet:
          'bg-transparent text-mn-text ring-1 ring-mn-text/40 ring-inset hover:bg-mn-text/[0.07] aria-expanded:bg-mn-text/[0.07]',
      },
      size: {
        desktop:
          'h-8 px-3.5 text-[12px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        mobile:
          'h-11 px-5 text-[14px] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4',
        // Not PondControl's — the composer's diff actions (#230) and the dialogs.
        xs: "h-6 gap-1 px-2.5 text-[12px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-3 text-[0.8rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'desktop',
    },
  }
)

function Button({
  className,
  variant = 'primary',
  size = 'desktop',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
