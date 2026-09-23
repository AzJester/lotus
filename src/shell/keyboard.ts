// ============================================================================
// Client-wide keyboard shortcuts (views handle their own keys when focused):
//   Ctrl+M new memo · Ctrl+O Open Database · Ctrl+E edit · Ctrl+S save ·
//   Ctrl+P print · Ctrl+F search bar · Esc close window · F1 help ·
//   F5 lock ID · F9 refresh · Delete delete selected · Alt+Enter properties
// ============================================================================

import { useEffect } from "react";
import { dialogOpen } from "../components/dialogs";
import { contextMenuOpen } from "../components/menu";
import { getTabCommands } from "../components/tabs";
import { requestClose, useUI } from "../data/ui";
import { openDatabaseDialog } from "./dialogs/DatabaseDialogs";

function isTyping(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null;
  if (!e) return false;
  return e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.tagName === "SELECT" || e.isContentEditable;
}

export function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || dialogOpen() || contextMenuOpen()) return;
      const ui = useUI.getState();
      if (ui.locked || ui.exited) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const cmds = getTabCommands(ui.activeTab);
      const typing = isTyping(e.target);
      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      if (ctrl && !e.shiftKey && k === "m") {
        handled();
        ui.requestMemo("");
      } else if (ctrl && k === "o") {
        handled();
        void openDatabaseDialog();
      } else if (ctrl && k === "p") {
        handled();
        window.print();
      } else if (ctrl && k === "s" && cmds.save) {
        handled();
        cmds.save();
      } else if (ctrl && k === "e" && cmds.toggleEdit) {
        handled();
        cmds.toggleEdit();
      } else if (ctrl && k === "f" && cmds.searchBar) {
        handled();
        cmds.searchBar();
      } else if (e.key === "F1") {
        handled();
        ui.openView("help");
      } else if (e.key === "F5") {
        handled();
        ui.lock("locked");
      } else if (e.key === "F9" && cmds.refresh) {
        handled();
        cmds.refresh();
      } else if (e.key === "Enter" && e.altKey && cmds.properties) {
        handled();
        cmds.properties();
      } else if (e.key === "Delete" && !typing && cmds.deleteSelected) {
        handled();
        cmds.deleteSelected();
      } else if (e.key === "Escape") {
        // Esc closes the window, even from inside a field (with the usual
        // save prompt for documents that changed).
        handled();
        void requestClose(ui.activeTab);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
