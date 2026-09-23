// ============================================================================
// File > Export / Import Workspace: the whole desktop as one JSON "NSF".
// ============================================================================

import { useNotes } from "../data/store";
import { useUI } from "../data/ui";
import { notesAlert } from "../components/dialogs";

export function exportWorkspace() {
  const blob = new Blob([useNotes.getState().exportAll()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lotus-notes-${new Date().toISOString().slice(0, 10)}.nsf.json`;
  a.click();
  URL.revokeObjectURL(url);
  useUI.getState().setStatus("Workspace exported.");
}

export function importWorkspace() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = useNotes.getState().importAll(String(reader.result));
      if (ok) useUI.getState().setStatus("Workspace imported.");
      else void notesAlert("This file is not a valid workspace export.", { icon: "error" });
    };
    reader.readAsText(file);
  };
  input.click();
}
