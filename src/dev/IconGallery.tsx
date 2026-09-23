// ============================================================================
// Dev-only icon gallery (served by `npm run dev` at /dev/icons.html; not part
// of the production build). Renders every icon at 1x and 2x on the backgrounds
// the app uses, and flags names that have no artwork yet.
//   /dev/icons.html?set=16a | 16b | 32   show one data file only
// ============================================================================

import { createRoot } from "react-dom/client";
import { Icon, iconData } from "../components/Icon";
import { ICON16A_NAMES, ICON16B_NAMES, ICON32_NAMES } from "../components/icons/names";
import type { IconName } from "../components/icons/names";

const SETS: { key: string; title: string; names: readonly IconName[] }[] = [
  { key: "16a", title: "16px group A (icons16a.ts)", names: ICON16A_NAMES },
  { key: "16b", title: "16px group B (icons16b.ts)", names: ICON16B_NAMES },
  { key: "32", title: "32px (icons32.ts)", names: ICON32_NAMES },
];

const BACKGROUNDS = ["#d4d0c8", "#ffffff", "#cfe0f5", "#0a246a"];

function Cell({ name }: { name: IconName }) {
  const missing = !iconData(name);
  return (
    <div
      style={{
        width: 132,
        padding: 6,
        border: "1px solid #b0aca4",
        background: missing ? "#ffe0e0" : "#f3f1ec",
        font: "11px Tahoma, sans-serif",
      }}
    >
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {BACKGROUNDS.map((bg) => (
          <span key={bg} style={{ background: bg, padding: 2, lineHeight: 0 }}>
            <Icon name={name} tint="#d00000" />
          </span>
        ))}
        <span style={{ background: "#d4d0c8", padding: 2, lineHeight: 0 }}>
          <Icon name={name} scale={2} tint="#d00000" />
        </span>
      </div>
      <div style={{ marginTop: 4, color: missing ? "#b00000" : "#000" }}>
        {name}
        {missing ? " (missing)" : ""}
      </div>
    </div>
  );
}

function Gallery() {
  const only = new URLSearchParams(location.search).get("set");
  return (
    <div style={{ padding: 12, background: "#ece9d8", minHeight: "100vh" }}>
      {SETS.filter((s) => !only || s.key === only).map((s) => {
        const drawn = s.names.filter((n) => iconData(n)).length;
        return (
          <section key={s.key} style={{ marginBottom: 20 }}>
            <h2 style={{ font: "bold 14px Tahoma, sans-serif", margin: "0 0 8px" }}>
              {s.title}: {drawn}/{s.names.length} drawn
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {s.names.map((n) => (
                <Cell key={n} name={n} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Gallery />);
