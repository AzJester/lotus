// ============================================================================
// The pulldown menu bar. Click a title, or use the keyboard: Alt (or F10)
// activates the bar and shows the mnemonics, Alt+letter opens a menu
// directly, arrows move between menus and items, Esc backs out.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { MenuPopup, MnemonicLabel, mnemonicOf } from "../components/menu";
import { dialogOpen } from "../components/dialogs";
import { useUI } from "../data/ui";
import { topMenus } from "./menus";

export default function MenuBar() {
  const [open, setOpen] = useState<number | null>(null);
  const [keyMode, setKeyMode] = useState(false);
  const [hot, setHot] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const theme = useUI((s) => s.theme);
  // Re-render when the editing state changes (the Text menu comes and goes).
  useUI((s) => !!s.editing);
  const menus = topMenus();

  useEffect(() => {
    if (open === null) return;
    const close = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpen(null);
        setKeyMode(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    let altAlone = false;
    const onDown = (e: KeyboardEvent) => {
      if (dialogOpen() || useUI.getState().locked) return;
      if (e.key === "Alt") {
        altAlone = true;
        return;
      }
      altAlone = false;
      if (e.key === "F10" && !e.shiftKey) {
        e.preventDefault();
        setKeyMode((k) => !k);
        setOpen(null);
        setHot(0);
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
        const idx = menus.findIndex((m) => mnemonicOf(m.label) === e.key.toLowerCase());
        if (idx >= 0) {
          e.preventDefault();
          setKeyMode(true);
          setHot(idx);
          setOpen(idx);
        }
        return;
      }
      if (!keyMode) return;
      if (e.key === "Escape") {
        if (open !== null) setOpen(null);
        else setKeyMode(false);
      } else if (e.key === "ArrowLeft") {
        const n = ((open ?? hot) - 1 + menus.length) % menus.length;
        setHot(n);
        if (open !== null) setOpen(n);
      } else if (e.key === "ArrowRight") {
        const n = ((open ?? hot) + 1) % menus.length;
        setHot(n);
        if (open !== null) setOpen(n);
      } else if ((e.key === "ArrowDown" || e.key === "Enter") && open === null) {
        setOpen(hot);
      } else if (open === null && e.key.length === 1) {
        const idx = menus.findIndex((m) => mnemonicOf(m.label) === e.key.toLowerCase());
        if (idx < 0) return;
        setHot(idx);
        setOpen(idx);
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Alt" && altAlone && !dialogOpen()) {
        e.preventDefault();
        setKeyMode((k) => !k);
        setOpen(null);
        setHot(0);
      }
      altAlone = false;
    };
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
    };
  });

  // Classic Windows always underlines mnemonics; XP shows them on Alt.
  const underline = theme === "r5" || keyMode;

  return (
    <div className={"menubar" + (keyMode ? " keymode" : "")} ref={barRef}>
      {menus.map((m, i) => (
        <div
          key={m.label}
          className={"menu-item" + (open === i ? " open" : "") + (keyMode && open === null && hot === i ? " hot" : "")}
          onMouseDown={(e) => {
            e.preventDefault();
            setOpen(open === i ? null : i);
            setHot(i);
          }}
          onMouseEnter={() => {
            if (open !== null) {
              setOpen(i);
              setHot(i);
            }
          }}
        >
          <MnemonicLabel label={m.label} underline={underline} />
          {open === i && (
            <MenuPopup
              items={m.items()}
              underline={underline}
              onClose={() => {
                setOpen(null);
                setKeyMode(false);
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
