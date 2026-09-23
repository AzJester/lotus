// ============================================================================
// Per-window plumbing. Every window tab renders inside a TabContext so its
// module knows which window it is and whether it is in front. Modules
// register commands (Refresh, Expand All, Document Properties, Save...) and
// action-bar actions against their window, so the menu bar, SmartIcons and
// keyboard can act on whichever window is active.
// ============================================================================

import { createContext, useContext, useEffect, useRef } from "react";
import type { OpenTab } from "../data/ui";
import type { IconName } from "./Icon";

export interface TabCtx {
  tab: OpenTab;
  active: boolean;
}

export const TabContext = createContext<TabCtx | null>(null);

const FALLBACK: TabCtx = { tab: { id: "detached", view: "welcome" }, active: true };

export function useTab(): TabCtx {
  return useContext(TabContext) ?? FALLBACK;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export interface TabCommands {
  // views
  expandAll?: () => void;
  collapseAll?: () => void;
  selectAll?: () => void;
  deselectAll?: () => void;
  /** F9: refresh the view (and process documents marked for deletion). */
  refresh?: () => void;
  /** Delete key pressed outside the view. */
  deleteSelected?: () => void;
  markRead?: (read: boolean, scope: "selected" | "all") => void;
  /** View > Search Bar (Ctrl+F). */
  searchBar?: () => void;
  /** Edit > Copy as Link > Document Link. */
  copyAsLink?: () => void;
  /** File > Document Properties. */
  properties?: () => void;
  // documents
  save?: () => void;
  toggleEdit?: () => void;
  /** Create > (context) new document in this database. */
  newDocument?: () => void;
}

type Getter = () => TabCommands;
const commandRegistry = new Map<string, Map<string, Getter>>();

/** Register commands for the current window (latest closures are always used). */
export function useTabCommands(source: string, cmds: TabCommands) {
  const { tab } = useTab();
  const ref = useRef(cmds);
  ref.current = cmds;
  useEffect(() => {
    let byTab = commandRegistry.get(tab.id);
    if (!byTab) {
      byTab = new Map();
      commandRegistry.set(tab.id, byTab);
    }
    const getter = () => ref.current;
    byTab.set(source, getter);
    return () => {
      const m = commandRegistry.get(tab.id);
      if (m && m.get(source) === getter) m.delete(source);
    };
  }, [tab.id, source]);
}

/** Merged commands of a window. */
export function getTabCommands(tabId: string): TabCommands {
  const byTab = commandRegistry.get(tabId);
  if (!byTab) return {};
  const out: Record<string, unknown> = {};
  // A source that leaves a command undefined must not hide another's.
  for (const g of byTab.values()) for (const [k, v] of Object.entries(g())) if (v !== undefined) out[k] = v;
  return out as TabCommands;
}

// ---------------------------------------------------------------------------
// Actions (the action bar, mirrored into the Actions menu)
// ---------------------------------------------------------------------------

export interface ActionDef {
  id: string;
  label: string;
  icon?: IconName;
  run?: () => void;
  disabled?: boolean;
  checked?: boolean;
  /** A dropdown action: clicking opens these. */
  children?: ActionItem[];
  /** Keyboard hint shown in menus. */
  accel?: string;
  /** Hide from the action bar (menu only). */
  menuOnly?: boolean;
}

export type ActionItem = ActionDef | "sep" | null | false | undefined;

const actionRegistry = new Map<string, () => ActionItem[]>();

export function publishActions(tabId: string, getter: () => ActionItem[]): () => void {
  actionRegistry.set(tabId, getter);
  return () => {
    if (actionRegistry.get(tabId) === getter) actionRegistry.delete(tabId);
  };
}

export function getTabActions(tabId: string): ActionItem[] {
  return actionRegistry.get(tabId)?.() ?? [];
}
