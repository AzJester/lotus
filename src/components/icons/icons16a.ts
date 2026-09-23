// ============================================================================
// 16x16 pixel icons, group A: applications, chrome, mail, status bar.
// Names and intended subjects are listed in names.ts (ICON16A_NAMES).
// ============================================================================

import type { Icon16AName } from "./names";
import type { PixelIcon } from "./types";

export const ICONS16A: Partial<Record<Icon16AName, PixelIcon>> = {
  mail: {
    size: 16,
    rows: [
      "................",
      "................",
      "................",
      "kkkkkkkkkkkkkkkk",
      "kwkhhhhhhhhhhkwk",
      "kwwkhhhhhhhhkwwk",
      "kwhwkhhhhhhkwhwk",
      "kwhhwkhhhhkwhhwk",
      "kwhhhwkkkkwhhhwk",
      "kwhhhkwwwwkhhhwk",
      "kwhhkhhhhhhkhhwk",
      "kwhkhhhhhhhhkhwk",
      "kwkhhhhhhhhhhkwk",
      "kggggggggggggggk",
      "kkkkkkkkkkkkkkkk",
      "................",
    ],
  },
};
