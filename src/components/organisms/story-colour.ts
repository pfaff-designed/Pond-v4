/**
 * Chromium serialises a colour made by relative-colour syntax as
 * `color(srgb r g b / a)` instead of `rgba(r, g, b, a)`. Stories compare against
 * the board's literals, so computed values go through this first.
 */
export const srgbAsRgba = (computed: string): string =>
  computed.replace(
    /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/g,
    (_match, r: string, g: string, b: string, a?: string) =>
      `rgba(${Math.round(Number(r) * 255)}, ${Math.round(Number(g) * 255)}, ${Math.round(Number(b) * 255)}, ${a ?? 1})`
  )
