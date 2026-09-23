// ============================================================================
// Lotus Notes: window and desktop state. Every open view and every open
// document is a window tab (Notes R5 onward); tabs stay mounted while hidden
// so nothing is lost when you switch. Also holds the Workspace pages,
// bookmarks, per-view column settings and other desktop preferences (the
// desktop.dsk of this client), persisted to IndexedDB.
// ============================================================================

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "./idb";
import type { IconName } from "../components/Icon";

export type ViewId =
  | "welcome"
  | "workspace"
  | "mail"
  | "calendar"
  | "contacts"
  | "todo"
  | "journal"
  | "discussion"
  | "search"
  | "replicator"
  | "help"
  | "outbox"
  | "directory";

/** Document collections that open in their own window. */
export type DocColl = "mail" | "calendar" | "contacts" | "todos" | "journal" | "discussion" | "help";

export interface DocRef {
  coll: DocColl;
  id: string;
}

export interface OpenTab {
  id: string;
  /** Module that renders the tab. */
  view: ViewId;
  /** Database id for templates with several databases (discussion, journal). */
  db?: string;
  /** Set for document windows. */
  doc?: DocRef;
  /** A document window for a document not saved yet. */
  isNew?: boolean;
  /** Document window title (kept up to date by the document). */
  title?: string;
  /** Initial field values for a new document (not persisted). */
  init?: Record<string, unknown>;
}

/** Visual theme: Notes 8 (XP era) or classic R5 (Windows 98 era). */
export type Theme = "notes8" | "r5";

export interface ViewMeta {
  id: ViewId;
  title: string;
  /** Short label used on bookmark tooltips. */
  bookmark: string;
  /** Accent color used for the tab marker. */
  color: string;
  icon: IconName;
  /** Database that holds this view (for Database Properties, About...). */
  db?: string;
}

export const VIEWS: Record<ViewId, ViewMeta> = {
  welcome: { id: "welcome", title: "Welcome", bookmark: "Welcome", color: "#3a6ea5", icon: "home" },
  workspace: { id: "workspace", title: "Workspace", bookmark: "Workspace", color: "#5a5a8a", icon: "workspace" },
  mail: { id: "mail", title: "Mail", bookmark: "Mail", color: "#c8a415", icon: "mail", db: "mail" },
  calendar: { id: "calendar", title: "Calendar", bookmark: "Calendar", color: "#2e8b57", icon: "calendar", db: "mail" },
  contacts: { id: "contacts", title: "Address Book", bookmark: "Address Book", color: "#7a3b8f", icon: "addressbook", db: "contacts" },
  todo: { id: "todo", title: "To Do", bookmark: "To Do", color: "#b5651d", icon: "todo", db: "mail" },
  journal: { id: "journal", title: "Notebook", bookmark: "Notebook", color: "#2f5fa5", icon: "notebook", db: "journal" },
  discussion: { id: "discussion", title: "Discussion", bookmark: "Discussion", color: "#a52f4f", icon: "discussion", db: "discussion" },
  search: { id: "search", title: "Search Results", bookmark: "Search", color: "#555555", icon: "search" },
  replicator: { id: "replicator", title: "Replicator", bookmark: "Replicator", color: "#2a6f8f", icon: "replicator" },
  help: { id: "help", title: "Lotus Notes Help", bookmark: "Help", color: "#1f5f9f", icon: "help", db: "help" },
  outbox: { id: "outbox", title: "Outgoing Mail", bookmark: "Outgoing Mail", color: "#8a6d1f", icon: "outbox", db: "outbox" },
  directory: { id: "directory", title: "Acme's Directory", bookmark: "Directory", color: "#3b6f5f", icon: "directory", db: "directory" },
};

/** Which view a document collection belongs to. */
export const COLL_VIEW: Record<DocColl, ViewId> = {
  mail: "mail",
  calendar: "calendar",
  contacts: "contacts",
  todos: "todo",
  journal: "journal",
  discussion: "discussion",
  help: "help",
};

/** Views that cannot be closed (the home bases). */
export const PINNED_VIEWS: ViewId[] = ["welcome"];

export interface WsPage {
  id: string;
  name: string;
  color: string;
  /** Database ids, in icon order. */
  icons: string[];
}

export interface Bookmark {
  id: string;
  title: string;
  /** Folder on the bookmark bar. */
  folder: "favorites" | "more";
  view: ViewId;
  db?: string;
  doc?: DocRef;
}

export interface ViewPrefs {
  sort?: { col: string; dir: 1 | -1 };
  widths?: Record<string, number>;
  collapsed?: string[];
}

export interface UiPrefs {
  texturedWorkspace: boolean;
  showUnread: boolean;
  showServerNames: boolean;
  stackReplicas: boolean;
  /** Mail preview pane placement. */
  preview: "bottom" | "right" | "off";
  /** Show the Notes 8 sidebar. */
  sidebar: boolean;
  /** Database icons removed from the Workspace (kept off the first page). */
  hiddenIcons?: string[];
}

export interface EditingState {
  font: string;
  size: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  permanentPen: boolean;
}

export interface DocLinkRef {
  coll: DocColl;
  id: string;
  db?: string;
  title: string;
}

/** A "Copy Into New" handover (e.g. from a mail memo). */
export interface PendingCopy {
  subject: string;
  description: string;
}

interface UIState {
  tabs: OpenTab[];
  activeTab: string;
  /** Window history for Back / Forward. */
  history: string[];
  historyIndex: number;
  theme: Theme;
  status: string;
  statusHistory: { at: number; text: string }[];
  searchQuery: string;
  openChats: string[];
  /** Password prompt showing (startup or after F5). */
  locked: "startup" | "locked" | null;
  /** File > Exit Notes: the client is closed. */
  exited: boolean;
  /** >0 while replication/routing traffic is running (the lightning bolt). */
  networkBusy: number;
  /** Rich text editing state (status bar font popups, Text menu). */
  editing: EditingState | null;
  clipboardLink: DocLinkRef | null;
  newMail: { count: number; at: number } | null;
  uiPrefs: UiPrefs;
  workspacePages: WsPage[];
  bookmarks: Bookmark[];
  viewPrefs: Record<string, ViewPrefs>;
  paneSizes: Record<string, number>;
  /** Databases whose About document has been shown on first open. */
  aboutShown: string[];

  openView: (view: ViewId, opts?: { db?: string }) => string;
  openDocument: (doc: DocRef, opts?: { title?: string; db?: string }) => string;
  newDocument: (coll: DocColl, init?: Record<string, unknown>, opts?: { title?: string; db?: string }) => string;
  /** A new document window was saved: it becomes a normal document window. */
  retargetTab: (tabId: string, doc: DocRef) => void;
  setTabTitle: (tabId: string, title: string) => void;
  activate: (tabId: string) => void;
  /** Close without asking (use requestClose from the shell for guarded closes). */
  closeTab: (tabId: string) => void;
  back: () => void;
  forward: () => void;
  setStatus: (status: string) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  requestMemo: (to: string, subject?: string) => void;
  copyToCalendar: (p: PendingCopy) => void;
  copyToTodo: (p: PendingCopy) => void;
  runSearch: (query: string) => void;
  openChat: (name: string) => void;
  closeChat: (name: string) => void;
  openReplication: () => void;
  lock: (mode?: "startup" | "locked") => void;
  unlock: () => void;
  exit: () => void;
  restart: () => void;
  networkStart: () => void;
  networkEnd: () => void;
  setEditing: (e: EditingState | null) => void;
  setClipboardLink: (link: DocLinkRef | null) => void;
  notifyNewMail: (count: number) => void;
  clearNewMail: () => void;
  setUiPrefs: (patch: Partial<UiPrefs>) => void;
  setWorkspacePages: (pages: WsPage[]) => void;
  addBookmark: (b: Omit<Bookmark, "id">) => void;
  removeBookmark: (id: string) => void;
  setViewPrefs: (key: string, patch: Partial<ViewPrefs>) => void;
  setPaneSize: (key: string, px: number) => void;
  markAboutShown: (db: string) => void;
}

// ---------------------------------------------------------------------------
// Close guards: a document window registers one so closing it can ask
// "Do you want to save your changes?" (or show the memo Close Window dialog).
// Kept outside the store because they are functions tied to live components.
// ---------------------------------------------------------------------------

export interface CloseGuard {
  /** Unsaved changes? (also used for the browser's leave-page prompt) */
  isDirty: () => boolean;
  /** Resolve true to let the window close. */
  confirmClose: () => Promise<boolean>;
}

const closeGuards = new Map<string, CloseGuard>();

export function registerCloseGuard(tabId: string, guard: CloseGuard): () => void {
  closeGuards.set(tabId, guard);
  return () => {
    if (closeGuards.get(tabId) === guard) closeGuards.delete(tabId);
  };
}

export function anyDirtyWindows(): boolean {
  for (const g of closeGuards.values()) if (g.isDirty()) return true;
  return false;
}

/** Close a window, letting its guard veto (e.g. Cancel in the save prompt). */
export async function requestClose(tabId: string): Promise<boolean> {
  const tab = useUI.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return true;
  if (!tab.doc && PINNED_VIEWS.includes(tab.view)) return false;
  const guard = closeGuards.get(tabId);
  if (guard && !(await guard.confirmClose())) return false;
  useUI.getState().closeTab(tabId);
  return true;
}

// ---------------------------------------------------------------------------

export const viewTabId = (view: ViewId, db?: string) => (db && db !== VIEWS[view].db ? `view:${view}:${db}` : `view:${view}`);
export const docTabId = (doc: DocRef) => `doc:${doc.coll}:${doc.id}`;

const newTabId = (coll: DocColl) =>
  `new:${coll}:${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

const DEFAULT_PAGES: WsPage[] = [
  { id: "p-mail", name: "Mail", color: "#c8a415", icons: ["mail", "contacts", "journal", "outbox"] },
  { id: "p-disc", name: "Discussions", color: "#3a6ea5", icons: ["discussion"] },
  { id: "p-ref", name: "Reference", color: "#2e8b57", icons: ["help", "directory"] },
];

const DEFAULT_BOOKMARKS: Bookmark[] = [
  { id: "bm-1", title: "Acme Team Discussion", folder: "favorites", view: "discussion" },
  { id: "bm-2", title: "Personal Journal", folder: "favorites", view: "journal" },
  { id: "bm-3", title: "Lotus Notes Help", folder: "more", view: "help" },
  { id: "bm-4", title: "Acme's Directory", folder: "more", view: "directory" },
];

const withHistory = (s: UIState, tabId: string) => {
  if (s.history[s.historyIndex] === tabId) return {};
  const history = [...s.history.slice(0, s.historyIndex + 1), tabId].slice(-50);
  return { history, historyIndex: history.length - 1 };
};

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      tabs: [
        { id: "view:welcome", view: "welcome" },
        { id: "view:workspace", view: "workspace" },
      ],
      activeTab: "view:welcome",
      history: ["view:welcome"],
      historyIndex: 0,
      theme: "notes8",
      status: "Done",
      statusHistory: [],
      searchQuery: "",
      openChats: [],
      locked: "startup",
      exited: false,
      networkBusy: 0,
      editing: null,
      clipboardLink: null,
      newMail: null,
      uiPrefs: {
        texturedWorkspace: true,
        showUnread: true,
        showServerNames: false,
        stackReplicas: true,
        preview: "bottom",
        sidebar: true,
      },
      workspacePages: DEFAULT_PAGES,
      bookmarks: DEFAULT_BOOKMARKS,
      viewPrefs: {},
      paneSizes: {},
      aboutShown: [],

      openView: (view, opts = {}) => {
        const id = viewTabId(view, opts.db);
        set((s) => {
          const exists = s.tabs.some((t) => t.id === id);
          return {
            tabs: exists ? s.tabs : [...s.tabs, { id, view, db: opts.db }],
            activeTab: id,
            ...withHistory(s, id),
          };
        });
        return id;
      },

      openDocument: (doc, opts = {}) => {
        // A window already showing the document (including a new document
        // window that has since been saved) comes to the front instead.
        const open = get().tabs.find((t) => t.doc && t.doc.coll === doc.coll && t.doc.id === doc.id);
        const id = open?.id ?? docTabId(doc);
        set((s) => {
          const tab: OpenTab = { id, view: COLL_VIEW[doc.coll], doc, db: opts.db, title: opts.title };
          return {
            tabs: open ? s.tabs : [...s.tabs, tab],
            activeTab: id,
            ...withHistory(s, id),
          };
        });
        return id;
      },

      newDocument: (coll, init, opts = {}) => {
        const id = newTabId(coll);
        const tab: OpenTab = {
          id,
          view: COLL_VIEW[coll],
          doc: { coll, id: id.split(":")[2] },
          isNew: true,
          db: opts.db,
          title: opts.title,
          init,
        };
        set((s) => ({ tabs: [...s.tabs, tab], activeTab: id, ...withHistory(s, id) }));
        return id;
      },

      retargetTab: (tabId, doc) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, doc, isNew: false, init: undefined } : t)),
        })),

      setTabTitle: (tabId, title) =>
        set((s) => {
          const tab = s.tabs.find((t) => t.id === tabId);
          if (!tab || tab.title === title) return {};
          return { tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)) };
        }),

      activate: (tabId) =>
        set((s) => (s.tabs.some((t) => t.id === tabId) ? { activeTab: tabId, ...withHistory(s, tabId) } : {})),

      closeTab: (tabId) =>
        set((s) => {
          const idx = s.tabs.findIndex((t) => t.id === tabId);
          if (idx === -1) return {};
          const tabs = s.tabs.filter((t) => t.id !== tabId);
          const safeTabs = tabs.length ? tabs : [{ id: "view:welcome", view: "welcome" as ViewId }];
          let activeTab = s.activeTab;
          if (activeTab === tabId) {
            // Return to the window you came from, else the neighbor.
            const prev = [...s.history.slice(0, s.historyIndex)].reverse().find((h) => safeTabs.some((t) => t.id === h));
            activeTab = prev ?? safeTabs[Math.max(0, Math.min(idx, safeTabs.length - 1))].id;
          }
          const history = s.history.filter((h) => h !== tabId);
          return {
            tabs: safeTabs,
            activeTab,
            history,
            historyIndex: Math.max(0, history.lastIndexOf(activeTab)),
          };
        }),

      back: () =>
        set((s) => {
          for (let i = s.historyIndex - 1; i >= 0; i--) {
            if (s.tabs.some((t) => t.id === s.history[i])) return { historyIndex: i, activeTab: s.history[i] };
          }
          return {};
        }),
      forward: () =>
        set((s) => {
          for (let i = s.historyIndex + 1; i < s.history.length; i++) {
            if (s.tabs.some((t) => t.id === s.history[i])) return { historyIndex: i, activeTab: s.history[i] };
          }
          return {};
        }),

      setStatus: (status) =>
        set((s) => ({
          status,
          statusHistory:
            s.statusHistory[0]?.text === status
              ? s.statusHistory
              : [{ at: Date.now(), text: status }, ...s.statusHistory].slice(0, 30),
        })),

      setTheme: (theme) => {
        set({ theme });
        get().setStatus(theme === "r5" ? "Theme: Classic (R5)" : "Theme: Notes 8");
      },
      toggleTheme: () => get().setTheme(get().theme === "notes8" ? "r5" : "notes8"),

      requestMemo: (to, subject = "") => {
        get().newDocument("mail", { to, subject }, { title: "New Memo" });
        get().setStatus(to ? `New memo to ${to}` : "New memo");
      },
      copyToCalendar: (p) => {
        get().newDocument("calendar", { subject: p.subject, description: p.description }, { title: "New Calendar Entry" });
        get().setStatus("Copied into a new Calendar entry.");
      },
      copyToTodo: (p) => {
        get().newDocument("todos", { subject: p.subject, description: p.description }, { title: "New To Do" });
        get().setStatus("Copied into a new To Do.");
      },

      runSearch: (query) => {
        set({ searchQuery: query });
        get().openView("search");
        get().setStatus(`Searching all databases for "${query}"...`);
      },

      openChat: (name) =>
        set((s) => ({
          openChats: s.openChats.includes(name) ? s.openChats : [...s.openChats, name],
          status: `Chat with ${name}`,
        })),
      closeChat: (name) => set((s) => ({ openChats: s.openChats.filter((n) => n !== name) })),

      openReplication: () => {
        get().openView("replicator");
      },

      lock: (mode = "locked") => set({ locked: mode }),
      unlock: () => set({ locked: null }),
      exit: () => set({ exited: true }),
      restart: () => set({ exited: false, locked: "startup" }),

      networkStart: () => set((s) => ({ networkBusy: s.networkBusy + 1 })),
      networkEnd: () => set((s) => ({ networkBusy: Math.max(0, s.networkBusy - 1) })),

      setEditing: (editing) => set({ editing }),
      setClipboardLink: (clipboardLink) => set({ clipboardLink }),
      notifyNewMail: (count) =>
        set((s) => ({ newMail: { count: (s.newMail?.count ?? 0) + count, at: Date.now() } })),
      clearNewMail: () => set({ newMail: null }),

      setUiPrefs: (patch) => set((s) => ({ uiPrefs: { ...s.uiPrefs, ...patch } })),
      setWorkspacePages: (workspacePages) => set({ workspacePages }),
      addBookmark: (b) =>
        set((s) => ({ bookmarks: [...s.bookmarks, { ...b, id: "bm-" + Math.random().toString(36).slice(2, 9) }] })),
      removeBookmark: (id) => set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),
      setViewPrefs: (key, patch) =>
        set((s) => ({ viewPrefs: { ...s.viewPrefs, [key]: { ...s.viewPrefs[key], ...patch } } })),
      setPaneSize: (key, px) => set((s) => ({ paneSizes: { ...s.paneSizes, [key]: px } })),
      markAboutShown: (db) => set((s) => (s.aboutShown.includes(db) ? {} : { aboutShown: [...s.aboutShown, db] })),
    }),
    {
      name: "lotus-notes-ui",
      version: 2,
      storage: createJSONStorage(() => idbStorage),
      // Persist the desktop, not transient state. Unsaved new documents are
      // not restored (like a Notes client that was closed without saving).
      partialize: (s) => ({
        tabs: s.tabs.filter((t) => !t.isNew).map(({ init: _init, ...t }) => t),
        activeTab: s.activeTab,
        theme: s.theme,
        uiPrefs: s.uiPrefs,
        workspacePages: s.workspacePages,
        bookmarks: s.bookmarks,
        viewPrefs: s.viewPrefs,
        paneSizes: s.paneSizes,
        aboutShown: s.aboutShown,
      }),
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as Record<string, unknown>;
        if (version >= 2) return old as unknown as UIState;
        // v1 stored tabs as [{ view }] and an `active` view id.
        const oldTabs = Array.isArray(old.tabs) ? (old.tabs as { view: ViewId }[]) : [];
        const tabs: OpenTab[] = oldTabs
          .filter((t) => t && VIEWS[t.view])
          .map((t) => ({ id: viewTabId(t.view), view: t.view }));
        if (!tabs.some((t) => t.view === "welcome")) tabs.unshift({ id: "view:welcome", view: "welcome" });
        const active = typeof old.active === "string" ? viewTabId(old.active as ViewId) : "view:welcome";
        return {
          tabs,
          activeTab: tabs.some((t) => t.id === active) ? active : "view:welcome",
          theme: old.theme === "r5" ? "r5" : "notes8",
        } as unknown as UIState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const activeTab = state.tabs.some((t) => t.id === state.activeTab)
          ? state.activeTab
          : state.tabs[0]?.id ?? "view:welcome";
        // Deferred: the store is still being created when this runs.
        setTimeout(() => useUI.setState({ activeTab, history: [activeTab], historyIndex: 0 }), 0);
      },
    },
  ),
);

/** The active tab object. */
export const activeTabOf = (s: Pick<UIState, "tabs" | "activeTab">) => s.tabs.find((t) => t.id === s.activeTab);
