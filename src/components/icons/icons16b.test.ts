// ============================================================================
// Shape checks for the 16x16 group B icon data (icons16b.ts): every name in
// ICON16B_NAMES has art, and every icon is 16 rows of exactly 16 characters
// drawn only from PALETTE keys, "." (transparent) and "@" (tint slot).
// ============================================================================

import { describe, expect, it } from "vitest";
import { ICONS16B } from "./icons16b";
import { ICON16B_NAMES } from "./names";
import { PALETTE } from "./palette";

const ALLOWED = new Set([...Object.keys(PALETTE), ".", "@"]);

describe("ICONS16B", () => {
  it("has art for every group B name and nothing else", () => {
    expect(Object.keys(ICONS16B).sort()).toEqual([...ICON16B_NAMES].sort());
  });

  it.each(ICON16B_NAMES.map((name) => [name]))("%s is a well-formed 16x16 icon", (name) => {
    const icon = ICONS16B[name];
    expect(icon.size).toBe(16);
    expect(icon.rows).toHaveLength(16);
    icon.rows.forEach((row, y) => {
      expect(row, `${name} row ${y}`).toHaveLength(16);
      for (const ch of row) {
        expect(ALLOWED.has(ch), `${name} row ${y} uses unknown key "${ch}"`).toBe(true);
      }
    });
  });
});
