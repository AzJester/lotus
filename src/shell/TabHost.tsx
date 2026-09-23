// ============================================================================
// Hosts one window tab. Every open window stays mounted (hidden when not in
// front) so drafts, selections and scroll positions survive tab switches. A
// crash inside one window is contained and reported the Notes way.
// ============================================================================

import { Component, useMemo } from "react";
import type { ComponentType, ReactNode } from "react";
import { TabContext } from "../components/tabs";
import type { OpenTab } from "../data/ui";
import { requestClose } from "../data/ui";

class WindowBoundary extends Component<{ tabId: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="window-error">
          <div className="window-error-box">
            <b>Notes error</b>
            <p>This window could not be displayed: {this.state.error.message}</p>
            <button className="btn" onClick={() => void requestClose(this.props.tabId)}>
              Close Window
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function TabHost({
  tab,
  active,
  component: View,
}: {
  tab: OpenTab;
  active: boolean;
  component: ComponentType;
}) {
  const ctx = useMemo(() => ({ tab, active }), [tab, active]);
  return (
    <TabContext.Provider value={ctx}>
      <div className={"tab-host" + (active ? " active" : "")} hidden={!active} data-tab={tab.id}>
        <WindowBoundary tabId={tab.id}>
          <View />
        </WindowBoundary>
      </div>
    </TabContext.Provider>
  );
}
