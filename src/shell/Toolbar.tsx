// ============================================================================
// The SmartIcons toolbar. A universal set (print, clipboard, open database,
// replicate, the applications), a text set that appears while you edit rich
// text, and on the right the Back / Forward / Stop / Refresh / Search
// navigation buttons with the notes:// address field. The Notes 8 theme keeps
// a search box for searching every database.
// ============================================================================

import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import type { IconName } from "../components/Icon";
import { activeTabOf, useUI } from "../data/ui";
import { getTabCommands } from "../components/tabs";
import { execText, hasActiveEditor, insertSection, insertTable, togglePermanentPen } from "../components/RichText";
import { runReplication } from "./replicate";
import { openDatabaseDialog } from "./dialogs/DatabaseDialogs";
import { openUrl, tabUrl } from "./nav";

interface Tool {
  icon: IconName;
  title: string;
  run: () => void;
  disabled?: boolean;
}

function ToolButton({ t }: { t: Tool }) {
  return (
    <button
      type="button"
      className="tool-btn"
      title={t.title}
      disabled={t.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={t.run}
    >
      <Icon name={t.icon} />
    </button>
  );
}

const sep = <div className="tool-sep" />;

export default function Toolbar() {
  const theme = useUI((s) => s.theme);
  const tab = useUI(activeTabOf);
  const editing = useUI((s) => !!s.editing);
  const history = useUI((s) => s.history);
  const historyIndex = useUI((s) => s.historyIndex);
  const busy = useUI((s) => s.networkBusy > 0);
  const ui = useUI.getState;
  const [address, setAddress] = useState("");
  const [search, setSearch] = useState("");
  const url = tabUrl(tab);

  useEffect(() => setAddress(url), [url]);

  const cmds = () => getTabCommands(ui().activeTab);
  const inEditor = editing && hasActiveEditor();

  const universal: Tool[] = [
    { icon: "print", title: "Print (Ctrl+P)", run: () => window.print() },
    { icon: "cut", title: "Cut", run: () => execText("cut"), disabled: !inEditor },
    { icon: "copy", title: "Copy", run: () => execText("copy"), disabled: !inEditor },
    { icon: "paste", title: "Paste (Ctrl+V)", run: () => ui().setStatus("Use Ctrl+V to paste."), disabled: !inEditor },
  ];
  const docs: Tool[] = [
    { icon: "edit", title: "Edit Document (Ctrl+E)", run: () => cmds().toggleEdit?.(), disabled: !tab?.doc },
    { icon: "save", title: "Save (Ctrl+S)", run: () => cmds().save?.(), disabled: !tab?.doc },
    { icon: "open", title: "Open Database (Ctrl+O)", run: () => void openDatabaseDialog() },
    { icon: "replicator", title: "Replicate", run: () => void runReplication() },
  ];
  const apps: Tool[] = [
    { icon: "new-memo", title: "New Memo (Ctrl+M)", run: () => ui().requestMemo("") },
    { icon: "mail", title: "Mail", run: () => ui().openView("mail") },
    { icon: "calendar", title: "Calendar", run: () => ui().openView("calendar") },
    { icon: "addressbook", title: "Address Book", run: () => ui().openView("contacts") },
    { icon: "todo", title: "To Do", run: () => ui().openView("todo") },
  ];
  const text: Tool[] = [
    { icon: "fmt-bold", title: "Bold (Ctrl+B)", run: () => execText("bold") },
    { icon: "fmt-italic", title: "Italic (Ctrl+I)", run: () => execText("italic") },
    { icon: "fmt-underline", title: "Underline (Ctrl+U)", run: () => execText("underline") },
    { icon: "fmt-color", title: "Red text", run: () => execText("foreColor", "#d00000") },
    { icon: "permanent-pen", title: "Permanent Pen", run: togglePermanentPen },
    { icon: "fmt-bullets", title: "Bullets", run: () => execText("insertUnorderedList") },
    { icon: "fmt-numbers", title: "Numbers", run: () => execText("insertOrderedList") },
    { icon: "section", title: "Create Section", run: insertSection },
    { icon: "table", title: "Create Table", run: () => insertTable() },
  ];

  const canBack = history.slice(0, historyIndex).some((h) => ui().tabs.some((t) => t.id === h));
  const canForward = history.slice(historyIndex + 1).some((h) => ui().tabs.some((t) => t.id === h));
  const nav: Tool[] = [
    { icon: "back", title: "Go Back", run: () => ui().back(), disabled: !canBack },
    { icon: "forward", title: "Go Forward", run: () => ui().forward(), disabled: !canForward },
    { icon: "stop", title: "Stop", run: () => ui().setStatus(busy ? "Stopping..." : "Nothing to stop."), disabled: !busy },
    { icon: "refresh", title: "Refresh (F9)", run: () => cmds().refresh?.() },
    {
      icon: "search",
      title: "Search",
      run: () => {
        const c = cmds();
        if (c.searchBar) c.searchBar();
        else ui().openView("search");
      },
    },
  ];

  return (
    <div className="toolbar">
      {universal.map((t) => (
        <ToolButton key={t.icon} t={t} />
      ))}
      {sep}
      {docs.map((t) => (
        <ToolButton key={t.icon} t={t} />
      ))}
      {sep}
      {inEditor
        ? text.map((t) => <ToolButton key={t.icon} t={t} />)
        : apps.map((t) => <ToolButton key={t.icon} t={t} />)}
      <div className="tool-fill" />
      {theme === "r5" ? (
        <div className="addr">
          <label>Address</label>
          <input
            className="bevel-field tb-address"
            value={address}
            spellCheck={false}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void openUrl(address);
              if (e.key === "Escape") setAddress(url);
            }}
          />
        </div>
      ) : (
        <div className="addr">
          <input
            type="search"
            className="bevel-field tb-search"
            placeholder="Search all databases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && search.trim()) ui().runSearch(search.trim());
            }}
          />
        </div>
      )}
      <div className="tool-nav">
        {nav.map((t) => (
          <ToolButton key={t.icon} t={t} />
        ))}
      </div>
    </div>
  );
}
