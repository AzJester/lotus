// ============================================================================
// Lotus Notes — UI / window state (not persisted to disk like documents are,
// but kept light in localStorage so the desktop reopens where you left it).
// Models the "window tabs" of Notes 6/7: every open view is a tab.
// ============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewId =
  | "welcome"
  | "workspace"
  | "mail"
  | "calendar"
  | "contacts"
  | "todo"
  | "journal"
  | "discussion"
  | "search";

export interface OpenTab {
  view: ViewId;
}

/** Visual theme: the default Notes 8 (XP-era blue) chrome, or the classic
 *  R4/R5 teal/grey look. */
export type Theme = "notes8" | "r5";

export interface ViewMeta {
  id: ViewId;
  title: string;
  /** Short label used on the bookmark bar tooltip. */
  bookmark: string;
  /** Accent color used for the tab/icon. */
  color: string;
  icon: string; // emoji glyph used as a lightweight icon
}

export const VIEWS: Record<ViewId, ViewMeta> = {
  welcome: { id: "welcome", title: "Welcome", bookmark: "Home", color: "#3a6ea5", icon: "🏠" },
  workspace: { id: "workspace", title: "Workspace", bookmark: "Workspace", color: "#5a5a8a", icon: "🗔" },
  mail: { id: "mail", title: "Mail", bookmark: "Mail", color: "#c8a415", icon: "✉️" },
  calendar: { id: "calendar", title: "Calendar", bookmark: "Calendar", color: "#2e8b57", icon: "📅" },
  contacts: { id: "contacts", title: "Contacts", bookmark: "Contacts", color: "#7a3b8f", icon: "👤" },
  todo: { id: "todo", title: "To Do", bookmark: "To Do", color: "#b5651d", icon: "✅" },
  journal: { id: "journal", title: "Notebook", bookmark: "Notebook", color: "#2f5fa5", icon: "📓" },
  discussion: { id: "discussion", title: "Discussion", bookmark: "Discussion", color: "#a52f4f", icon: "💬" },
  search: { id: "search", title: "Search Results", bookmark: "Search", color: "#555", icon: "🔍" },
};

/** A simple command bus so global keyboard shortcuts can reach whichever module
 *  is currently active (e.g. Delete the selected document). The active module
 *  watches `cmd` and acts when the name applies; `n` retriggers repeats. */
export interface UICommand {
  name: "new" | "delete" | "reply" | "refresh";
  n: number;
}

/** A request to open Mail with the compose form pre-addressed (e.g. from a
 *  contact's "Write Memo" action). Consumed and cleared by the Mail module. */
export interface PendingMemo {
  to: string;
  subject: string;
}

/** A "Copy Into New" handover (e.g. from a mail memo). Consumed and cleared by
 *  the target Calendar / To Do module on open, mirroring PendingMemo. */
export interface PendingCopy {
  subject: string;
  description: string;
}

interface UIState {
  tabs: OpenTab[];
  active: ViewId;
  /** The active visual theme (persisted). */
  theme: Theme;
  /** Transient message shown in the status bar. */
  status: string;
  /** A pending "new memo" request, consumed by the Mail module on open. */
  pendingMemo: PendingMemo | null;
  /** A pending "copy into a calendar entry" handover, consumed by Calendar. */
  pendingCalendar: PendingCopy | null;
  /** A pending "copy into a to do" handover, consumed by the To Do module. */
  pendingTodo: PendingCopy | null;
  /** Current global search query, shown by the Search Results view. */
  searchQuery: string;
  /** Latest keyboard command for the active module to consume. */
  cmd: UICommand | null;
  /** Open Sametime chat windows, keyed by buddy display name (no duplicates). */
  openChats: string[];

  openView: (view: ViewId) => void;
  closeTab: (view: ViewId) => void;
  setActive: (view: ViewId) => void;
  setStatus: (status: string) => void;
  /** Set the visual theme directly. */
  setTheme: (theme: Theme) => void;
  /** Cycle between the Notes 8 and classic R5 themes. */
  toggleTheme: () => void;
  /** Open Mail and start a new memo addressed to `to`. */
  requestMemo: (to: string, subject?: string) => void;
  clearMemo: () => void;
  /** Open Calendar and prefill a new entry from the given subject/description. */
  copyToCalendar: (p: PendingCopy) => void;
  clearPendingCalendar: () => void;
  /** Open To Do and prefill a new task from the given subject/description. */
  copyToTodo: (p: PendingCopy) => void;
  clearPendingTodo: () => void;
  /** Run a global search and open the results view. */
  runSearch: (query: string) => void;
  /** Dispatch a keyboard command to the active module. */
  sendCmd: (name: UICommand["name"]) => void;
  /** Open a Sametime chat window with the named buddy (idempotent). */
  openChat: (name: string) => void;
  /** Close the named buddy's chat window. */
  closeChat: (name: string) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      tabs: [{ view: "welcome" }, { view: "workspace" }],
      active: "welcome",
      theme: "notes8",
      status: "Done",
      pendingMemo: null,
      pendingCalendar: null,
      pendingTodo: null,
      searchQuery: "",
      cmd: null,
      openChats: [],

      openView: (view) =>
        set((s) => {
          const exists = s.tabs.some((t) => t.view === view);
          return {
            tabs: exists ? s.tabs : [...s.tabs, { view }],
            active: view,
            status: `Opening ${VIEWS[view].title}...`,
          };
        }),

      closeTab: (view) =>
        set((s) => {
          // The Welcome tab is the home base; keep at least one tab open.
          const idx = s.tabs.findIndex((t) => t.view === view);
          const tabs = s.tabs.filter((t) => t.view !== view);
          const safeTabs = tabs.length ? tabs : [{ view: "welcome" as ViewId }];
          let active = s.active;
          if (active === view) {
            // Focus the neighbour that took the closed tab's place.
            const ni = Math.max(0, Math.min(idx, safeTabs.length - 1));
            active = safeTabs[ni].view;
          }
          return { tabs: safeTabs, active };
        }),

      setActive: (view) => set({ active: view }),
      setStatus: (status) => set({ status }),

      setTheme: (theme) =>
        set({
          theme,
          status: theme === "r5" ? "Theme: Classic (R5)" : "Theme: Notes 8",
        }),
      toggleTheme: () =>
        set((s) => {
          const theme: Theme = s.theme === "notes8" ? "r5" : "notes8";
          return {
            theme,
            status: theme === "r5" ? "Theme: Classic (R5)" : "Theme: Notes 8",
          };
        }),

      requestMemo: (to, subject = "") =>
        set((s) => {
          const exists = s.tabs.some((t) => t.view === "mail");
          return {
            pendingMemo: { to, subject },
            tabs: exists ? s.tabs : [...s.tabs, { view: "mail" as ViewId }],
            active: "mail",
            status: `New memo to ${to}`,
          };
        }),
      clearMemo: () => set({ pendingMemo: null }),

      copyToCalendar: (p) =>
        set((s) => {
          const exists = s.tabs.some((t) => t.view === "calendar");
          return {
            pendingCalendar: p,
            tabs: exists ? s.tabs : [...s.tabs, { view: "calendar" as ViewId }],
            active: "calendar",
            status: "Copied to Calendar.",
          };
        }),
      clearPendingCalendar: () => set({ pendingCalendar: null }),

      copyToTodo: (p) =>
        set((s) => {
          const exists = s.tabs.some((t) => t.view === "todo");
          return {
            pendingTodo: p,
            tabs: exists ? s.tabs : [...s.tabs, { view: "todo" as ViewId }],
            active: "todo",
            status: "Copied to To Do.",
          };
        }),
      clearPendingTodo: () => set({ pendingTodo: null }),

      runSearch: (query) =>
        set((s) => {
          const exists = s.tabs.some((t) => t.view === "search");
          return {
            searchQuery: query,
            tabs: exists ? s.tabs : [...s.tabs, { view: "search" as ViewId }],
            active: "search",
            status: `Searching for "${query}"...`,
          };
        }),

      sendCmd: (name) => set((s) => ({ cmd: { name, n: (s.cmd?.n ?? 0) + 1 } })),

      openChat: (name) =>
        set((s) => ({
          openChats: s.openChats.includes(name) ? s.openChats : [...s.openChats, name],
          status: `Chat with ${name}`,
        })),
      closeChat: (name) =>
        set((s) => ({ openChats: s.openChats.filter((n) => n !== name) })),
    }),
    {
      name: "lotus-notes-ui",
      version: 1,
      // Persist only the desktop layout + theme, not transient status / compose requests.
      partialize: (s) => ({ tabs: s.tabs, active: s.active, theme: s.theme }),
    },
  ),
);
