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
  | "discussion";

export interface OpenTab {
  view: ViewId;
}

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
};

interface UIState {
  tabs: OpenTab[];
  active: ViewId;
  /** Transient message shown in the status bar. */
  status: string;

  openView: (view: ViewId) => void;
  closeTab: (view: ViewId) => void;
  setActive: (view: ViewId) => void;
  setStatus: (status: string) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      tabs: [{ view: "welcome" }, { view: "workspace" }],
      active: "welcome",
      status: "Done",

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
          const tabs = s.tabs.filter((t) => t.view !== view);
          const safeTabs = tabs.length ? tabs : [{ view: "welcome" as ViewId }];
          let active = s.active;
          if (active === view) {
            active = safeTabs[safeTabs.length - 1].view;
          }
          return { tabs: safeTabs, active };
        }),

      setActive: (view) => set({ active: view }),
      setStatus: (status) => set({ status }),
    }),
    { name: "lotus-notes-ui", version: 1 },
  ),
);
