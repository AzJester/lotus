// ============================================================================
// Shape checks for the 16x16 group A pixel icons: every name in
// ICON16A_NAMES has art, and every icon is 16 rows of exactly 16 characters
// drawn only from PALETTE keys, "." (transparent) and "@" (the tint slot).
// ============================================================================

import { describe, expect, it } from "vitest";
import { ICONS16A } from "./icons16a";
import { ICON16A_NAMES } from "./names";
import { PALETTE } from "./palette";

const ALLOWED = new Set([...Object.keys(PALETTE), ".", "@"]);

describe("icons16a", () => {
  it("has art for every group A name and nothing else", () => {
    expect(Object.keys(ICONS16A).sort()).toEqual([...ICON16A_NAMES].sort());
  });

  describe.each(ICON16A_NAMES.map((name) => [name]))("%s", (name) => {
    const icon = ICONS16A[name];

    it("is a 16px icon with exactly 16 rows", () => {
      expect(icon.size).toBe(16);
      expect(icon.rows).toHaveLength(16);
    });

    it("has rows of exactly 16 characters", () => {
      icon.rows.forEach((row, y) => {
        expect(row.length, `row ${y}: "${row}"`).toBe(16);
      });
    });

    it("uses only palette keys, '.' and '@'", () => {
      icon.rows.forEach((row, y) => {
        const bad = [...row].filter((ch) => !ALLOWED.has(ch));
        expect(bad, `row ${y}: "${row}"`).toEqual([]);
      });
    });
  });

  it("keeps the tint slot to the follow-up flag", () => {
    const tinted = ICON16A_NAMES.filter((name) => ICONS16A[name].rows.some((row) => row.includes("@")));
    expect(tinted).toEqual(["follow-up"]);
  });
});
