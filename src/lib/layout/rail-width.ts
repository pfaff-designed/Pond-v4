/**
 * The rail card's width in px (`PondRail` / `Pond 05 Shell`: 206 at desktop).
 * The rail renders at this width and the shell's Suspense fallback reserves the
 * same footprint, so the content column never jumps when the rail lands. The
 * card is inset 20px from the shell's edges (WorkspaceShell).
 */
export const RAIL_WIDTH_PX = 206
