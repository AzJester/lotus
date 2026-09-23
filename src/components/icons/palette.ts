// ============================================================================
// Pixel icon palette. Every icon in icons16a/icons16b/icons32 is drawn as rows
// of single-character color keys looked up here, in the spirit of the 16-color
// Windows 3.1/95 icon palette with a few extra tones for shading.
//
//   "." is transparent.
//   "@" is the tint slot: <Icon tint="#c00"> recolors it (e.g. follow-up flags).
// ============================================================================

export const PALETTE: Record<string, string> = {
  k: "#000000", // black (outlines)
  d: "#404040", // dark gray
  g: "#808080", // gray (shadow)
  s: "#c0c0c0", // silver (button face)
  h: "#e0e0e0", // light gray (highlight)
  w: "#ffffff", // white
  r: "#800000", // maroon
  R: "#ff0000", // red
  i: "#ffb0b0", // pink
  o: "#ff8000", // orange
  z: "#a05000", // brown
  u: "#e8b878", // tan
  f: "#fff4c8", // cream (paper)
  y: "#808000", // olive
  v: "#c8a000", // dark gold
  Y: "#ffff00", // yellow
  e: "#008000", // green
  G: "#00c000", // bright green
  l: "#80ff80", // light green
  t: "#008080", // teal
  c: "#00ffff", // cyan
  n: "#000080", // navy
  b: "#0000ff", // blue
  B: "#4080ff", // light blue
  a: "#a0c8ff", // pale blue
  p: "#800080", // purple
  m: "#ff00ff", // magenta
  q: "#c080ff", // lavender
};

/** The tint slot's color when no tint is passed. */
export const DEFAULT_TINT = "#ff0000";
