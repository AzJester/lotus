// ============================================================================
// Menus: the shared menu model and popup used by the menu bar, action-bar
// dropdowns and right-click context menus. Items may nest (cascading
// submenus open on hover or Right arrow), carry accelerator hints, check
// marks, icons and "&" mnemonics ("&File" underlines the F).
// ============================================================================

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { create } from "zustand";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export interface MenuItem {
  label?: string;
  accel?: string;
  run?: () => void;
  disabled?: boolean;
  checked?: boolean;
  sep?: boolean;
  children?: MenuItem[];
  icon?: IconName;
}

export const SEP: MenuItem = { sep: true };

/** Render a label, underlining the "&" mnemonic letter when asked. */
export function MnemonicLabel({ label, underline }: { label: string; underline: boolean }) {
  const i = label.indexOf("&");
  if (i === -1 || i === label.length - 1) return <>{label}</>;
  const before = label.slice(0, i);
  const letter = label[i + 1];
  const after = label.slice(i + 2);
  return (
    <>
      {before}
      {underline ? <u>{letter}</u> : letter}
      {after}
    </>
  );
}

export const stripMnemonic = (label: string) => label.replace("&", "");
export const mnemonicOf = (label: string) => {
  const i = label.indexOf("&");
  return i >= 0 && i < label.length - 1 ? label[i + 1].toLowerCase() : "";
};

/** Drop leading/trailing/duplicate separators. */
export function tidy(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const it of items) {
    if (it.sep && (out.length === 0 || out[out.length - 1].sep)) continue;
    out.push(it);
  }
  while (out.length && out[out.length - 1].sep) out.pop();
  return out;
}

export function MenuPopup({
  items,
  onClose,
  style,
  keyboard = true,
  underline = true,
  className,
}: {
  items: MenuItem[];
  onClose: () => void;
  style?: CSSProperties;
  /** Listen for arrow keys / Enter / Esc (the innermost open menu does). */
  keyboard?: boolean;
  underline?: boolean;
  className?: string;
}) {
  const list = tidy(items);
  const [hot, setHot] = useState(-1);
  const [openSub, setOpenSub] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({});

  // Keep the popup inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fix: CSSProperties = {};
    if (r.right > window.innerWidth - 2) fix.transform = `translateX(${window.innerWidth - 2 - r.right}px)`;
    if (r.bottom > window.innerHeight - 2) {
      fix.transform = `${fix.transform ?? ""} translateY(${Math.max(-r.top + 2, window.innerHeight - 2 - r.bottom)}px)`;
    }
    setPos(fix);
  }, []);

  const activate = (i: number) => {
    const it = list[i];
    if (!it || it.sep || it.disabled) return;
    if (it.children) {
      setOpenSub(i);
      return;
    }
    onClose();
    it.run?.();
  };

  useEffect(() => {
    if (!keyboard || openSub !== -1) return;
    const onKey = (e: KeyboardEvent) => {
      const step = (dir: number) => {
        let i = hot;
        for (let n = 0; n < list.length; n++) {
          i = (i + dir + list.length) % list.length;
          if (!list[i].sep && !list[i].disabled) break;
        }
        setHot(i);
      };
      if (e.key === "ArrowDown") step(1);
      else if (e.key === "ArrowUp") step(-1);
      else if (e.key === "ArrowRight" && hot >= 0 && list[hot].children) setOpenSub(hot);
      else if (e.key === "Enter") activate(hot);
      else if (e.key === "Escape") onClose();
      else {
        const k = e.key.toLowerCase();
        const idx = list.findIndex((it) => it.label && mnemonicOf(it.label) === k && !it.disabled);
        if (idx === -1) return;
        activate(idx);
      }
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div
      ref={ref}
      className={"menu-popup" + (className ? " " + className : "")}
      style={{ ...style, ...pos }}
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
    >
      {list.map((it, i) =>
        it.sep ? (
          <div key={i} className="menu-sep" />
        ) : (
          <div
            key={i}
            role="menuitem"
            aria-disabled={it.disabled || undefined}
            className={"menu-row" + (it.disabled ? " disabled" : "") + (hot === i ? " hot" : "")}
            onMouseEnter={() => {
              setHot(i);
              setOpenSub(it.children ? i : -1);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              activate(i);
            }}
          >
            <span className="menu-check">{it.checked ? "✓" : it.icon ? <Icon name={it.icon} /> : ""}</span>
            <span className="menu-label">
              <MnemonicLabel label={it.label ?? ""} underline={underline} />
            </span>
            {it.accel && <span className="accel">{it.accel}</span>}
            {it.children && <span className="menu-arrow">▶</span>}
            {it.children && openSub === i && (
              <MenuPopup
                items={it.children}
                onClose={onClose}
                underline={underline}
                className="submenu"
                style={{ position: "absolute", left: "100%", top: -3 }}
              />
            )}
          </div>
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context menus
// ---------------------------------------------------------------------------

interface ContextMenuState {
  menu: { x: number; y: number; items: MenuItem[] } | null;
}

const useContextMenu = create<ContextMenuState>(() => ({ menu: null }));

/** Open a right-click menu at the pointer. */
export function openContextMenu(e: { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuItem[]) {
  e.preventDefault?.();
  if (!tidy(items).length) return;
  useContextMenu.setState({ menu: { x: e.clientX, y: e.clientY, items } });
}

export const closeContextMenu = () => useContextMenu.setState({ menu: null });
export const contextMenuOpen = () => useContextMenu.getState().menu !== null;

export function ContextMenuHost() {
  const menu = useContextMenu((s) => s.menu);
  useEffect(() => {
    if (!menu) return;
    const close = () => closeContextMenu();
    // Attached on the next tick: a menu opened from a mousedown (status bar
    // pop-ups, the replica arrow) must not be closed by that same event.
    const t = window.setTimeout(() => window.addEventListener("mousedown", close), 0);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);
  if (!menu) return null;
  return (
    <MenuPopup
      items={menu.items}
      onClose={closeContextMenu}
      className="context-menu"
      style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 3000 }}
    />
  );
}
