// ============================================================================
// <Icon> — renders a pixel icon from the icon data files as a crisp inline
// SVG. Runs of same-colored pixels in a row merge into one rectangle, and each
// color becomes a single <path>, so even 32x32 art stays a handful of nodes.
//
//   <Icon name="mail" />                  16px
//   <Icon name="db-mail" />               32px (size comes from the data)
//   <Icon name="follow-up" tint="#c00" /> recolor the "@" tint slot
//   <Icon name="mail" scale={2} />        chunky 2x render of a 16px icon
// ============================================================================

import { memo } from "react";
import { DEFAULT_TINT, PALETTE } from "./icons/palette";
import { ICONS16A } from "./icons/icons16a";
import { ICONS16B } from "./icons/icons16b";
import { ICONS32 } from "./icons/icons32";
import type { IconName } from "./icons/names";
import type { PixelIcon } from "./icons/types";

export type { IconName } from "./icons/names";

const ALL: Partial<Record<IconName, PixelIcon>> = { ...ICONS16A, ...ICONS16B, ...ICONS32 };

/** Look up an icon's pixel data (undefined when it has not been drawn yet). */
export function iconData(name: IconName): PixelIcon | undefined {
  return ALL[name];
}

interface Compiled {
  size: number;
  /** One path per palette key (the tint slot keeps the "@" key). */
  paths: { key: string; d: string }[];
}

const cache = new Map<string, Compiled>();

function compile(name: string, icon: PixelIcon): Compiled {
  const hit = cache.get(name);
  if (hit) return hit;
  const byKey = new Map<string, string[]>();
  icon.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      let run = 1;
      while (x + run < row.length && row[x + run] === key) run++;
      if (key !== "." && key !== " ") {
        const list = byKey.get(key) ?? [];
        list.push(`M${x} ${y}h${run}v1h-${run}z`);
        byKey.set(key, list);
      }
      x += run;
    }
  });
  const compiled: Compiled = {
    size: icon.size,
    paths: [...byKey.entries()].map(([key, parts]) => ({ key, d: parts.join("") })),
  };
  cache.set(name, compiled);
  return compiled;
}

export interface IconProps {
  name: IconName;
  /** Recolors the "@" tint slot. */
  tint?: string;
  /** Integer upscale (2 draws a 16px icon at 32px, pixelated). */
  scale?: number;
  /** Force a rendered pixel size (overrides size x scale). */
  px?: number;
  title?: string;
  className?: string;
}

function IconImpl({ name, tint, scale = 1, px, title, className }: IconProps) {
  const icon = ALL[name];
  if (!icon) {
    // Not drawn yet: a neutral placeholder keeps layouts stable.
    const s = px ?? 16 * scale;
    return (
      <svg
        className={"px-icon missing" + (className ? " " + className : "")}
        width={s}
        height={s}
        viewBox="0 0 16 16"
        aria-hidden={title ? undefined : true}
      >
        {title && <title>{title}</title>}
        <rect x="2.5" y="2.5" width="11" height="11" fill="#d4d0c8" stroke="#808080" />
      </svg>
    );
  }
  const c = compile(name, icon);
  const s = px ?? c.size * scale;
  return (
    <svg
      className={"px-icon" + (className ? " " + className : "")}
      width={s}
      height={s}
      viewBox={`0 0 ${c.size} ${c.size}`}
      shapeRendering="crispEdges"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {c.paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill={p.key === "@" ? tint ?? DEFAULT_TINT : PALETTE[p.key] ?? "#ff00ff"}
        />
      ))}
    </svg>
  );
}

export const Icon = memo(IconImpl);
export default Icon;

/**
 * Render arbitrary pixel art that is not a named icon (e.g. the password
 * dialog's hieroglyphs). `cacheKey` must be unique per artwork.
 */
export function PixelArt({
  art,
  cacheKey,
  scale = 1,
  className,
}: {
  art: PixelIcon;
  cacheKey: string;
  scale?: number;
  className?: string;
}) {
  const c = compile("art:" + cacheKey, art);
  const s = c.size * scale;
  return (
    <svg
      className={"px-icon" + (className ? " " + className : "")}
      width={s}
      height={s}
      viewBox={`0 0 ${c.size} ${c.size}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {c.paths.map((p) => (
        <path key={p.key} d={p.d} fill={p.key === "@" ? DEFAULT_TINT : PALETTE[p.key] ?? "#ff00ff"} />
      ))}
    </svg>
  );
}
