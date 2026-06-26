// ============================================================================
// The classic Notes pulldown menu bar. Menus are mostly faithful labels; the
// items that have a real implementation are wired to actions, the rest are
// shown disabled so the bar reads authentically without pretending to work.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useUI, VIEWS } from "../data/ui";
import type { ViewId } from "../data/ui";
import { useNotes } from "../data/store";
import { Dialog } from "./ui";

interface Item {
  label?: string;
  accel?: string;
  onClick?: () => void;
  disabled?: boolean;
  sep?: boolean;
}

export default function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const openView = useUI((s) => s.openView);
  const setStatus = useUI((s) => s.setStatus);
  const resetAll = useNotes((s) => s.resetAll);
  const exportAll = useNotes((s) => s.exportAll);
  const importAll = useNotes((s) => s.importAll);
  const barRef = useRef<HTMLDivElement>(null);

  function doExport() {
    setOpen(null);
    const blob = new Blob([exportAll()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `lotus-notes-${stamp}.nsf.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Workspace exported.");
  }

  function doImport() {
    setOpen(null);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const ok = importAll(String(reader.result));
        setStatus(ok ? "Workspace imported." : "Import failed: invalid file.");
      };
      reader.readAsText(file);
    };
    input.click();
  }

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const go = (v: ViewId) => () => {
    openView(v);
    setOpen(null);
  };

  const todo = (label: string) => () => {
    setStatus(`${label} is not available in this demo build.`);
    setOpen(null);
  };

  const menus: Record<string, Item[]> = {
    File: [
      { label: "New Database...", accel: "Ctrl+N", disabled: true },
      { label: "Open", onClick: go("workspace") },
      { sep: true },
      { label: "Print...", accel: "Ctrl+P", onClick: () => { setOpen(null); window.print(); } },
      { sep: true },
      { label: "Export Workspace... (.nsf.json)", onClick: doExport },
      { label: "Import Workspace...", onClick: doImport },
      { sep: true },
      { label: "Replication", disabled: true },
      { sep: true },
      {
        label: "Reset demo data...",
        onClick: () => {
          setOpen(null);
          if (confirm("Reset all Notes data back to the original demo content?")) {
            resetAll();
            setStatus("Demo data restored.");
          }
        },
      },
      { label: "Exit Notes", onClick: todo("Exit") },
    ],
    Edit: [
      { label: "Undo", accel: "Ctrl+Z", disabled: true },
      { sep: true },
      { label: "Cut", accel: "Ctrl+X", disabled: true },
      { label: "Copy", accel: "Ctrl+C", disabled: true },
      { label: "Paste", accel: "Ctrl+V", disabled: true },
      { sep: true },
      { label: "Find/Replace...", accel: "Ctrl+F", disabled: true },
    ],
    View: [
      { label: "Go To...", disabled: true },
      { sep: true },
      { label: "Welcome", onClick: go("welcome") },
      { label: "Workspace", onClick: go("workspace") },
      { sep: true },
      { label: "Refresh", accel: "F9", onClick: () => { setOpen(null); setStatus("Refreshed."); } },
    ],
    Create: [
      { label: "Mail → Memo", onClick: go("mail") },
      { label: "Calendar Entry", onClick: go("calendar") },
      { label: "Contact", onClick: go("contacts") },
      { label: "To Do Item", onClick: go("todo") },
      { label: "Notebook Entry", onClick: go("journal") },
      { sep: true },
      { label: "Discussion Topic", onClick: go("discussion") },
    ],
    Actions: [
      { label: "Open Mail", onClick: go("mail") },
      { label: "Open Calendar", onClick: go("calendar") },
      { label: "Open Contacts", onClick: go("contacts") },
      { sep: true },
      { label: "Tools", disabled: true },
    ],
    Tools: [
      { label: "Preferences...", disabled: true },
      { label: "Spell Check", accel: "Ctrl+F2", disabled: true },
      { sep: true },
      { label: "User ID...", disabled: true },
    ],
    Window: Object.values(VIEWS).map((v) => ({ label: v.title, onClick: go(v.id) })),
    Help: [
      { label: "Help Topics", accel: "F1", disabled: true },
      { sep: true },
      {
        label: "About IBM Lotus Notes",
        onClick: () => {
          setOpen(null);
          setAboutOpen(true);
        },
      },
    ],
  };

  return (
    <>
    <div className="menubar" ref={barRef}>
      {Object.keys(menus).map((name) => (
        <div
          key={name}
          className={"menu-item" + (open === name ? " open" : "")}
          onMouseDown={(e) => {
            e.preventDefault();
            setOpen(open === name ? null : name);
          }}
          onMouseEnter={() => open && setOpen(name)}
        >
          {name}
          {open === name && (
            <div className="menu-popup" onMouseDown={(e) => e.stopPropagation()}>
              {menus[name].map((it, i) =>
                it.sep ? (
                  <div key={i} className="menu-sep" />
                ) : (
                  <div
                    key={i}
                    className={"menu-row" + (it.disabled ? " disabled" : "")}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (!it.disabled && it.onClick) it.onClick();
                    }}
                  >
                    <span>{it.label}</span>
                    {it.accel && <span className="accel">{it.accel}</span>}
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>

      {aboutOpen && (
        <Dialog
          title="About IBM Lotus Notes"
          width={460}
          onClose={() => setAboutOpen(false)}
          footer={
            <button className="btn" onClick={() => setAboutOpen(false)}>
              OK
            </button>
          }
        >
          <div className="about-box">
            <span className="tb-appicon about-icon" aria-hidden>
              <span className="tb-appicon-mark">❋</span>
            </span>
            <div className="about-text">
              <div className="about-title">IBM Lotus Notes — Web Edition</div>
              <p>
                Resurrected by <b>Dr. Shane Turner</b> for Gen X and Boomers everywhere.
              </p>
              <p>
                No Domino servers were harmed in the making of this app. Side effects may
                include flashbacks to dial-up, fondness for the SmartIcons toolbar, and the
                sudden urge to replicate.
              </p>
              <div className="about-version">
                Release 8.5 (web recreation) · Built with React · Your data stays in this browser.
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
