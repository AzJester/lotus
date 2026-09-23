// ============================================================================
// The menu bar's contents, built on demand from the current state so items
// enable, disable and check themselves: File, Edit, View, Create, Actions
// (mirrors the window's action bar), Text (while editing rich text), Tools
// (Notes 8), Window (the open windows) and Help.
// ============================================================================

import type { MenuItem } from "../components/menu";
import { SEP } from "../components/menu";
import { actionsToMenu } from "../components/ActionBar";
import { getTabActions, getTabCommands } from "../components/tabs";
import { notesAsk } from "../components/dialogs";
import {
  FONTS,
  SIZES,
  TEXT_COLORS,
  execText,
  hasActiveEditor,
  insertSection,
  insertTable,
  pasteDocLink,
  setFont,
  setSize,
  togglePermanentPen,
} from "../components/RichText";
import { useNotes, LOCATIONS } from "../data/store";
import { activeTabOf, requestClose, useUI, VIEWS } from "../data/ui";
import type { DocColl } from "../data/ui";
import { runReplication } from "./replicate";
import { dbOfTab } from "./nav";
import { openPreferences, openOutOfOffice } from "./dialogs/Preferences";
import { openDatabaseDialog, newDatabaseDialog } from "./dialogs/DatabaseDialogs";
import { openDatabaseProperties } from "./dialogs/Properties";
import { openAboutNotes } from "./dialogs/About";
import { exportWorkspace, importWorkspace } from "./workspaceFile";

export interface TopMenu {
  label: string;
  items: () => MenuItem[];
}

const ui = () => useUI.getState();
const notes = () => useNotes.getState();
const cmds = () => getTabCommands(ui().activeTab);

function newDoc(coll: DocColl, title: string, init: Record<string, unknown> = {}, db?: string) {
  ui().newDocument(coll, init, { title, db });
}

function helpDoc(kind: "about" | "using") {
  const tab = activeTabOf(ui());
  const db = dbOfTab(tab);
  const key =
    tab?.view === "calendar" ? "calendar" : tab?.view === "todo" ? "todo" : db?.template === "addressbook" ? "addressbook" : db?.template ?? "help";
  ui().openDocument({ coll: "help", id: `${kind}-${key}` }, { title: `${kind === "about" ? "About" : "Using"} ${db?.title ?? "Lotus Notes Help"}` });
}

function fileMenu(): MenuItem[] {
  const s = ui();
  const tab = activeTabOf(s);
  const c = cmds();
  const r5 = s.theme === "r5";
  const db = dbOfTab(tab);
  // R5 kept User Preferences under File > Preferences and the ID tools
  // under File > Tools.
  const prefs: MenuItem[] = [
    { label: "&User Preferences...", run: () => void openPreferences() },
    { label: "&Location Preferences...", disabled: true },
  ];
  const tools: MenuItem[] = [
    { label: "&Out of Office...", run: () => void openOutOfOffice() },
    SEP,
    { label: "&Lock ID", accel: "F5", run: () => s.lock("locked") },
    { label: "&Switch ID...", disabled: true },
  ];
  const location: MenuItem = {
    label: "&Mobile",
    children: [
      {
        label: "Choose Current &Location",
        children: LOCATIONS.map((loc) => ({
          label: loc,
          checked: notes().user.location === loc,
          run: () => {
            notes().setLocation(loc);
            ui().setStatus(`Location: ${loc}`);
          },
        })),
      },
    ],
  };
  return [
    {
      label: "&Database",
      children: [
        { label: "&Open...", accel: "Ctrl+O", run: () => void openDatabaseDialog() },
        { label: "&New...", run: () => void newDatabaseDialog() },
        SEP,
        { label: "&Properties...", disabled: !db, run: () => db && void openDatabaseProperties(db.id) },
      ],
    },
    {
      label: "&Replication",
      children: [
        { label: "&Replicate", run: () => void runReplication() },
        { label: "&Send Outgoing Mail", run: () => void runReplication({ dbs: [], sendOutgoing: true }) },
        SEP,
        { label: "Open &Replicator", run: () => s.openView("replicator") },
      ],
    },
    SEP,
    { label: "&Close", accel: "Esc", disabled: !tab || (!tab.doc && tab.view === "welcome"), run: () => tab && void requestClose(tab.id) },
    { label: "&Save", accel: "Ctrl+S", disabled: !c.save, run: () => c.save?.() },
    SEP,
    { label: "Document P&roperties...", accel: "Alt+Enter", disabled: !c.properties, run: () => c.properties?.() },
    { label: "&Print...", accel: "Ctrl+P", run: () => window.print() },
    SEP,
    { label: "&Import Workspace...", run: () => importWorkspace() },
    { label: "&Export Workspace...", run: () => exportWorkspace() },
    SEP,
    ...(r5
      ? [{ label: "Pr&eferences", children: prefs }, { label: "&Tools", children: tools }, location]
      : [{ label: "Pr&eferences...", run: () => void openPreferences() }, location]),
    SEP,
    {
      label: "Reset Demo Data...",
      run: async () => {
        if (await notesAsk("Reset all Notes data back to the original demo content?", { icon: "warning" })) {
          notes().resetAll();
          ui().setStatus("Demo data restored.");
        }
      },
    },
    { label: "E&xit Notes", run: () => s.exit() },
  ];
}

function editMenu(): MenuItem[] {
  const c = cmds();
  const s = ui();
  const editing = hasActiveEditor() && !!s.editing;
  return [
    { label: "&Undo", accel: "Ctrl+Z", disabled: !editing, run: () => execText("undo") },
    SEP,
    { label: "Cu&t", accel: "Ctrl+X", disabled: !editing, run: () => execText("cut") },
    { label: "&Copy", accel: "Ctrl+C", disabled: !editing, run: () => execText("copy") },
    {
      label: "&Paste",
      accel: "Ctrl+V",
      disabled: !editing,
      run: () => {
        if (!pasteDocLink()) s.setStatus("Use Ctrl+V to paste text from the clipboard.");
      },
    },
    { label: "Copy as &Link", children: [{ label: "&Document Link", disabled: !c.copyAsLink, run: () => c.copyAsLink?.() }] },
    SEP,
    { label: "Select &All", accel: "Ctrl+A", disabled: !c.selectAll, run: () => c.selectAll?.() },
    { label: "D&eselect All", disabled: !c.deselectAll, run: () => c.deselectAll?.() },
    SEP,
    { label: "&Find/Replace...", accel: "Ctrl+F", disabled: !c.searchBar, run: () => c.searchBar?.() },
    {
      label: "U&nread Marks",
      disabled: !c.markRead,
      children: [
        { label: "Mark Selected &Read", run: () => c.markRead?.(true, "selected") },
        { label: "Mark Selected &Unread", run: () => c.markRead?.(false, "selected") },
        SEP,
        { label: "Mark &All Read", run: () => c.markRead?.(true, "all") },
        { label: "Mark All U&nread", run: () => c.markRead?.(false, "all") },
      ],
    },
    SEP,
    { label: "&Delete", accel: "Del", disabled: !c.deleteSelected, run: () => c.deleteSelected?.() },
  ];
}

function viewMenu(): MenuItem[] {
  const s = ui();
  const c = cmds();
  const p = s.uiPrefs;
  return [
    { label: "&Refresh", accel: "F9", disabled: !c.refresh, run: () => c.refresh?.() },
    SEP,
    { label: "&Expand All", accel: "*", disabled: !c.expandAll, run: () => c.expandAll?.() },
    { label: "&Collapse All", disabled: !c.collapseAll, run: () => c.collapseAll?.() },
    SEP,
    { label: "&Search Bar", accel: "Ctrl+F", disabled: !c.searchBar, run: () => c.searchBar?.() },
    {
      label: "Document &Preview",
      children: [
        { label: "&Bottom", checked: p.preview === "bottom", run: () => s.setUiPrefs({ preview: "bottom" }) },
        { label: "&Right", checked: p.preview === "right", run: () => s.setUiPrefs({ preview: "right" }) },
        { label: "&Off", checked: p.preview === "off", run: () => s.setUiPrefs({ preview: "off" }) },
      ],
    },
    {
      label: "S&how",
      children: [
        { label: "&Unread Count", checked: p.showUnread, run: () => s.setUiPrefs({ showUnread: !p.showUnread }) },
        { label: "&Server Names", checked: p.showServerNames, run: () => s.setUiPrefs({ showServerNames: !p.showServerNames }) },
        { label: "Stack &Replica Icons", checked: p.stackReplicas, run: () => s.setUiPrefs({ stackReplicas: !p.stackReplicas }) },
        ...(s.theme === "notes8"
          ? [{ label: "Side&bar", checked: p.sidebar, run: () => s.setUiPrefs({ sidebar: !p.sidebar }) }]
          : []),
      ],
    },
    {
      label: "&Theme",
      children: [
        { label: "&Notes 8", checked: s.theme === "notes8", run: () => s.setTheme("notes8") },
        { label: "&Classic R5", checked: s.theme === "r5", run: () => s.setTheme("r5") },
      ],
    },
    SEP,
    {
      label: "&Go To",
      children: [
        { label: "&Welcome", run: () => s.openView("welcome") },
        { label: "W&orkspace", run: () => s.openView("workspace") },
        { label: "&Replicator", run: () => s.openView("replicator") },
      ],
    },
  ];
}

function createMenu(): MenuItem[] {
  const s = ui();
  const tab = activeTabOf(s);
  const c = cmds();
  const editing = hasActiveEditor() && !!s.editing;
  const discDb = tab?.view === "discussion" ? tab.db : undefined;
  const journalDb = tab?.view === "journal" ? tab.db : undefined;
  return [
    { label: "&Memo", accel: "Ctrl+M", run: () => s.requestMemo("") },
    { label: "&Calendar Entry", run: () => newDoc("calendar", "New Calendar Entry") },
    { label: "&To Do", run: () => newDoc("todos", "New To Do") },
    SEP,
    { label: "C&ontact", run: () => newDoc("contacts", "New Contact") },
    { label: "Notebook &Entry", run: () => newDoc("journal", "New Journal Entry", {}, journalDb) },
    {
      label: "&Discussion",
      children: [
        { label: "&Main Topic", run: () => newDoc("discussion", "New Topic", {}, discDb) },
        { label: "&Response", disabled: !(tab?.view === "discussion" && c.newDocument), run: () => c.newDocument?.() },
      ],
    },
    SEP,
    { label: "&Section", disabled: !editing, run: insertSection },
    { label: "T&able...", disabled: !editing, run: () => insertTable() },
    SEP,
    { label: "Data&base...", run: () => void newDatabaseDialog() },
  ];
}

function actionsMenu(): MenuItem[] {
  const items = actionsToMenu(getTabActions(ui().activeTab));
  return items.length ? items : [{ label: "(No actions)", disabled: true }];
}

function textMenu(): MenuItem[] {
  const e = ui().editing;
  return [
    { label: "&Bold", accel: "Ctrl+B", checked: e?.bold, run: () => execText("bold") },
    { label: "&Italic", accel: "Ctrl+I", checked: e?.italic, run: () => execText("italic") },
    { label: "&Underline", accel: "Ctrl+U", checked: e?.underline, run: () => execText("underline") },
    { label: "&Strikethrough", run: () => execText("strikeThrough") },
    SEP,
    { label: "&Permanent Pen", checked: e?.permanentPen, run: togglePermanentPen },
    { label: "Text &Color", children: TEXT_COLORS.map((c) => ({ label: c.label, run: () => execText("foreColor", c.value) })) },
    { label: "&Font", children: FONTS.map((f) => ({ label: f.label, checked: e?.font === f.label, run: () => setFont(f.label) })) },
    { label: "Si&ze", children: SIZES.map((sz) => ({ label: `${sz} pt`, checked: e?.size === sz, run: () => setSize(sz) })) },
    SEP,
    { label: "B&ullets", run: () => execText("insertUnorderedList") },
    { label: "&Numbers", run: () => execText("insertOrderedList") },
    { label: "In&dent", run: () => execText("indent") },
    { label: "&Outdent", run: () => execText("outdent") },
    {
      label: "&Align Paragraph",
      children: [
        { label: "&Left", run: () => execText("justifyLeft") },
        { label: "&Center", run: () => execText("justifyCenter") },
        { label: "&Right", run: () => execText("justifyRight") },
      ],
    },
    SEP,
    { label: "No&rmal Text", run: () => execText("removeFormat") },
  ];
}

function toolsMenu(): MenuItem[] {
  const s = ui();
  return [
    { label: "&Preferences...", run: () => void openPreferences() },
    { label: "&Out of Office...", run: () => void openOutOfOffice() },
    SEP,
    { label: "&Replicate", run: () => void runReplication() },
    { label: "&Lock Notes ID", accel: "F5", run: () => s.lock("locked") },
  ];
}

function windowMenu(): MenuItem[] {
  const s = ui();
  const tab = activeTabOf(s);
  return [
    ...s.tabs.map((t, i) => ({
      label: `${i < 9 ? "&" + (i + 1) + " " : ""}${t.title ?? VIEWS[t.view].title}`,
      checked: t.id === s.activeTab,
      run: () => s.activate(t.id),
    })),
    SEP,
    { label: "&Close Window", accel: "Esc", disabled: !tab || (!tab.doc && tab.view === "welcome"), run: () => tab && void requestClose(tab.id) },
    {
      label: "Close &All Windows",
      run: async () => {
        for (const t of [...ui().tabs].reverse()) {
          if (!t.doc && t.view === "welcome") continue;
          if (!(await requestClose(t.id))) break;
        }
      },
    },
  ];
}

function helpMenu(): MenuItem[] {
  const s = ui();
  return [
    { label: "&Help Topics", accel: "F1", run: () => s.openView("help") },
    SEP,
    { label: "&About This Database", run: () => helpDoc("about") },
    { label: "&Using This Database", run: () => helpDoc("using") },
    SEP,
    { label: "&Keyboard Shortcuts", run: () => s.openDocument({ coll: "help", id: "help-keyboard" }, { title: "Keyboard shortcuts" }) },
    { label: "About IBM Lotus &Notes...", run: () => void openAboutNotes() },
  ];
}

/** The menus for the current theme and editing state. */
export function topMenus(): TopMenu[] {
  const s = ui();
  const editing = !!s.editing && hasActiveEditor();
  return [
    { label: "&File", items: fileMenu },
    { label: "&Edit", items: editMenu },
    { label: "&View", items: viewMenu },
    { label: "&Create", items: createMenu },
    { label: "&Actions", items: actionsMenu },
    ...(editing ? [{ label: "&Text", items: textMenu }] : []),
    ...(s.theme === "notes8" ? [{ label: "T&ools", items: toolsMenu }] : []),
    { label: "&Window", items: windowMenu },
    { label: "&Help", items: helpMenu },
  ];
}
