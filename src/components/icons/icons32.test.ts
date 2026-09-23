// ============================================================================
// Shape checks for the 32x32 icon data: every name in ICON32_NAMES has art,
// each icon is exactly 32 rows of 32 characters, and every character is a
// PALETTE key or "." (transparent).
// ============================================================================

import { describe, expect, it } from "vitest";
import { ICONS32 } from "./icons32";
import { ICON32_NAMES } from "./names";
import { PALETTE } from "./palette";

const VALID = new Set([...Object.keys(PALETTE), "."]);

describe("32px icons", () => {
  it("draws every name in ICON32_NAMES and nothing else", () => {
    expect(Object.keys(ICONS32).sort()).toEqual([...ICON32_NAMES].sort());
  });

  for (const name of ICON32_NAMES) {
    describe(name, () => {
      const icon = ICONS32[name];

      it("is 32px with exactly 32 rows", () => {
        expect(icon.size).toBe(32);
        expect(icon.rows).toHaveLength(32);
      });

      it("has rows of exactly 32 characters", () => {
        icon.rows.forEach((row, y) => {
          expect(row.length, `row ${y}`).toBe(32);
        });
      });

      it("uses only palette keys or '.'", () => {
        icon.rows.forEach((row, y) => {
          [...row].forEach((ch, x) => {
            expect(VALID.has(ch), `"${ch}" at ${x},${y}`).toBe(true);
          });
        });
      });

      it("is not blank", () => {
        expect(icon.rows.some((row) => /[^.]/.test(row))).toBe(true);
      });
    });
  }
});
