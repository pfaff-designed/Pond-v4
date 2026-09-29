import type { Transition } from "motion/react";

/** Default clip-reveal easing for cartesian charts. */
export const DEFAULT_ANIMATION_EASING = "cubic-bezier(0.22, 0.8, 0.2, 1)";

/**
 * Inline-style transition for hover/fade opacity changes on chart elements.
 * References the design tokens (`--motion-quick`, `--ease-press`) so a curve or
 * duration change in `globals.css` cascades here — CSS custom properties resolve
 * inside inline-style transition strings.
 */
export const FADE_OPACITY_TRANSITION =
  "opacity var(--motion-quick) var(--ease-press)";

export const DEFAULT_ANIMATION_DURATION_MS = 560;

/** Default enter transition — matches the original line chart reveal. */
export const DEFAULT_CHART_ENTER_TRANSITION: Transition = {
  type: "tween",
  duration: DEFAULT_ANIMATION_DURATION_MS / 1000,
  ease: [0.22, 0.8, 0.2, 1],
};

/**
 * Clip-path width reveal must use tween — spring does not reliably animate SVG width.
 */
export function clipRevealTransition(enterTransition?: Transition): Transition {
  if (enterTransition?.type === "tween") {
    return {
      ...enterTransition,
      ease: enterTransition.ease ?? DEFAULT_CHART_ENTER_TRANSITION.ease,
    };
  }

  const duration =
    typeof enterTransition?.duration === "number"
      ? enterTransition.duration
      : DEFAULT_ANIMATION_DURATION_MS / 1000;

  return {
    type: "tween",
    duration,
    ease: DEFAULT_CHART_ENTER_TRANSITION.ease,
  };
}
