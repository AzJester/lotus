// ============================================================================
// Lotus Notes: application shell. The client window: title bar, menu bar,
// SmartIcons, the bookmark bar, window tabs over every open window (each one
// stays mounted), the Notes 8 sidebar, the status bar, and the floating
// windows (dialogs, context menus, new mail, alarms, chat). The Enter
// Password prompt stands in front of all of it at startup and after F5.
// ============================================================================

import { useEffect } from "react";
import { activeTabOf, useUI } from "./data/ui";
import { useNotes } from "./data/store";
import { notesName } from "./data/names";
import TitleBar from "./shell/TitleBar";
import MenuBar from "./shell/MenuBar";
import Toolbar from "./shell/Toolbar";
import BookmarkBar from "./shell/BookmarkBar";
import WindowTabs, { tabLabel } from "./shell/WindowTabs";
import TabHost from "./shell/TabHost";
import StatusBar from "./shell/StatusBar";
import { AlarmsWindow, ExitScreen, NewMailNotice } from "./shell/Overlays";
import PasswordDialog from "./shell/PasswordDialog";
import { componentFor } from "./shell/registry";
import { useAlarmDaemon, useDominoServer, useLeaveGuard } from "./shell/services";
import { useGlobalKeys } from "./shell/keyboard";
import { DialogHost } from "./components/dialogs";
import { ContextMenuHost } from "./components/menu";
import Sidebar from "./components/Sidebar";
import ChatDock from "./components/ChatDock";

function Desktop() {
  const theme = useUI((s) => s.theme);
  const tabs = useUI((s) => s.tabs);
  const activeTab = useUI((s) => s.activeTab);
  const sidebar = useUI((s) => s.uiPrefs.sidebar);
  const locked = useUI((s) => s.locked);
  const tab = useUI(activeTabOf);

  useDominoServer();
  useAlarmDaemon();
  useLeaveGuard();
  useGlobalKeys();

  useEffect(() => {
    const product = theme === "r5" ? "Lotus Notes" : "IBM Lotus Notes";
    document.title = tab ? `${tabLabel(tab)} - ${product}` : product;
  }, [tab, theme]);

  return (
    <div className={"notes-window theme-" + theme} aria-hidden={locked ? true : undefined}>
      <TitleBar />
      <MenuBar />
      <Toolbar />
      <div className="notes-body">
        <BookmarkBar />
        <div className="workpane">
          <WindowTabs />
          <div className="workview">
            {tabs.map((t) => (
              <TabHost key={t.id} tab={t} active={t.id === activeTab} component={componentFor(t)} />
            ))}
          </div>
        </div>
        {theme === "notes8" && sidebar && <Sidebar />}
      </div>
      <StatusBar />
      <ChatDock />
      <NewMailNotice />
      <AlarmsWindow />
    </div>
  );
}

export default function App() {
  const theme = useUI((s) => s.theme);
  const locked = useUI((s) => s.locked);
  const exited = useUI((s) => s.exited);
  const unlock = useUI((s) => s.unlock);
  const exit = useUI((s) => s.exit);
  const setStatus = useUI((s) => s.setStatus);
  const user = useNotes((s) => s.user);

  // The theme also styles the page behind the client window.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-notes8", "theme-r5");
    root.classList.add(`theme-${theme}`);
  }, [theme]);

  if (exited) return <ExitScreen />;

  return (
    <>
      {locked !== "startup" && <Desktop />}
      {locked && (
        <PasswordDialog
          key={locked}
          userName={notesName({ name: user.name, email: user.email })}
          mode={locked}
          onUnlock={() => {
            unlock();
            setStatus(locked === "startup" ? `Welcome, ${user.name}.` : "Your Notes ID is unlocked.");
          }}
          onCancel={() => {
            if (locked === "startup") exit();
            else setStatus("Your Notes ID is still locked. Enter your password to continue.");
          }}
        />
      )}
      <DialogHost />
      <ContextMenuHost />
    </>
  );
}
