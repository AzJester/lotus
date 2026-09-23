// ============================================================================
// The action bar across the top of every view and document. Actions that do
// not fit collapse into a "»" menu, dropdown actions open a menu, and the
// window's actions are published so the Actions menu mirrors the bar, as in
// Notes.
// ============================================================================

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { MenuPopup } from "./menu";
import type { MenuItem } from "./menu";
import { publishActions, useTab } from "./tabs";
import type { ActionDef, ActionItem } from "./tabs";

export type { ActionDef, ActionItem } from "./tabs";

/** Convert action items into menu items (for the Actions menu and »). */
export function actionsToMenu(items: ActionItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const it of items) {
    if (!it) continue;
    if (it === "sep") {
      out.push({ sep: true });
      continue;
    }
    out.push({
      label: it.label,
      icon: it.icon,
      run: it.run,
      disabled: it.disabled,
      checked: it.checked,
      accel: it.accel,
      children: it.children ? actionsToMenu(it.children) : undefined,
    });
  }
  return out;
}

function ActionButtonView({
  a,
  onDropdown,
  open,
}: {
  a: ActionDef;
  onDropdown: () => void;
  open: boolean;
}) {
  return (
    <button
      type="button"
      className={"action-btn" + (a.disabled ? " disabled" : "") + (open ? " open" : "") + (a.checked ? " checked" : "")}
      disabled={a.disabled}
      title={a.accel ? `${a.label} (${a.accel})` : a.label}
      onMouseDown={(e) => {
        if (a.children && !a.disabled) {
          e.preventDefault();
          onDropdown();
        }
      }}
      onClick={() => {
        if (!a.disabled && !a.children) a.run?.();
      }}
    >
      {a.icon && <Icon name={a.icon} />}
      <span>{a.label}</span>
      {a.children && <span className="caret">▾</span>}
    </button>
  );
}

export function ActionBar({
  actions,
  right,
  publish = true,
}: {
  actions: ActionItem[];
  /** Right-aligned extras (search field, etc.). */
  right?: ReactNode;
  /** Mirror these actions into the Actions menu (default true). */
  publish?: boolean;
}) {
  const { tab } = useTab();
  const items = actions.filter((a): a is ActionDef | "sep" => !!a && (a === "sep" || !a.menuOnly));
  const latest = useRef(actions);
  latest.current = actions;

  useEffect(() => {
    if (!publish) return;
    return publishActions(tab.id, () => latest.current);
  }, [publish, tab.id]);

  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(items.length);
  const [openId, setOpenId] = useState<string | null>(null);
  const signature = items.map((a) => (a === "sep" ? "|" : a.label + (a.children ? "v" : ""))).join(",");

  useLayoutEffect(() => {
    const bar = barRef.current;
    const measure = measureRef.current;
    if (!bar || !measure) return;
    const compute = () => {
      const widths = Array.from(measure.children).map((c) => (c as HTMLElement).offsetWidth + 1);
      const total = widths.reduce((a, b) => a + b, 0);
      const avail = bar.clientWidth;
      if (total <= avail) {
        setFit(items.length);
        return;
      }
      const room = avail - 34; // the » button
      let used = 0;
      let n = 0;
      for (; n < widths.length; n++) {
        if (used + widths[n] > room) break;
        used += widths[n];
      }
      // Never end the visible run on a separator.
      while (n > 0 && items[n - 1] === "sep") n--;
      setFit(n);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(bar);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    if (!openId) return;
    const close = () => setOpenId(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [openId]);

  const visible = items.slice(0, fit);
  const hidden = items.slice(fit);

  const renderItem = (a: ActionDef | "sep", i: number, live: boolean) => {
    if (a === "sep") return <div key={"s" + i} className="action-sep" />;
    return (
      <div key={a.id} className="action-slot">
        <ActionButtonView a={a} open={live && openId === a.id} onDropdown={() => setOpenId(openId === a.id ? null : a.id)} />
        {live && openId === a.id && a.children && (
          <MenuPopup
            items={actionsToMenu(a.children)}
            onClose={() => setOpenId(null)}
            style={{ position: "absolute", top: "100%", left: 0, zIndex: 300 }}
          />
        )}
      </div>
    );
  };

  return (
    <div className="action-bar">
      <div className="action-items" ref={barRef}>
        {visible.map((a, i) => renderItem(a, i, true))}
        {hidden.some((a) => a !== "sep") && (
          <div className="action-slot">
            <button
              type="button"
              className={"action-btn action-more" + (openId === "__more" ? " open" : "")}
              title="More actions"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpenId(openId === "__more" ? null : "__more");
              }}
            >
              »
            </button>
            {openId === "__more" && (
              <MenuPopup
                items={actionsToMenu(hidden)}
                onClose={() => setOpenId(null)}
                style={{ position: "absolute", top: "100%", right: 0, zIndex: 300 }}
              />
            )}
          </div>
        )}
        {/* Invisible copy used to measure every action's natural width. */}
        <div className="action-measure" ref={measureRef} aria-hidden>
          {items.map((a, i) => (
            <Fragment key={i}>{renderItem(a, i, false)}</Fragment>
          ))}
        </div>
      </div>
      {right && <div className="action-right">{right}</div>}
    </div>
  );
}
