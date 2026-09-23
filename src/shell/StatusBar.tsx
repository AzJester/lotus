// ============================================================================
// The status bar, laid out like the R4/R5 client: the network activity
// lightning bolt, the message area (click it for recent messages), the font /
// size / style popups while you edit rich text, the access-level key, the
// location popup, and the mail envelope (lit when new mail waits).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import type { IconName } from "../components/Icon";
import { openContextMenu } from "../components/menu";
import type { MenuItem } from "../components/menu";
import { FONTS, SIZES, execText, setFont, setSize, togglePermanentPen } from "../components/RichText";
import { LOCATIONS, unreadCount, useNotes } from "../data/store";
import { activeTabOf, useUI } from "../data/ui";
import type { LocationName } from "../data/types";
import { dbOfTab } from "./nav";
import { openAccessInfo } from "./dialogs/About";
import { fmtTime } from "../lib/format";

const LOCATION_ICON: Record<LocationName, IconName> = {
  "Office (Network)": "location-office",
  "Home (Network Dialup)": "location-home",
  "Travel (Notes Direct Dialup)": "location-travel",
  "Island (Disconnected)": "location-island",
};

function popupAt(e: React.MouseEvent, items: MenuItem[]) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  // Status bar popups open upward from the cell.
  openContextMenu({ clientX: r.left, clientY: r.top - Math.min(320, items.length * 22 + 8) }, items);
}

export default function StatusBar() {
  const theme = useUI((s) => s.theme);
  const status = useUI((s) => s.status);
  const history = useUI((s) => s.statusHistory);
  const busy = useUI((s) => s.networkBusy > 0);
  const editing = useUI((s) => s.editing);
  const newMail = useUI((s) => s.newMail);
  const tab = useUI(activeTabOf);
  const openView = useUI((s) => s.openView);
  const clearNewMail = useUI((s) => s.clearNewMail);
  const setStatus = useUI((s) => s.setStatus);
  const location = useNotes((s) => s.user.location);
  const setLocation = useNotes((s) => s.setLocation);
  const unread = useNotes((s) => unreadCount(s.mail));
  const outbox = useNotes((s) => s.outbox.length);
  useNotes((s) => s.databases);
  const db = dbOfTab(tab);
  const [showHistory, setShowHistory] = useState(false);
  const histRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showHistory) return;
    const close = (e: MouseEvent) => {
      if (histRef.current && !histRef.current.contains(e.target as Node)) setShowHistory(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showHistory]);

  const chooseLocation = (e: React.MouseEvent) =>
    popupAt(e, [
      ...LOCATIONS.map((loc) => ({
        label: loc,
        checked: loc === location,
        run: () => {
          setLocation(loc);
          setStatus(
            loc === "Office (Network)"
              ? `Location: ${loc}. Mail is sent and received directly on ${"Mail01/Acme"}.`
              : loc === "Island (Disconnected)"
                ? `Location: ${loc}. The server cannot be reached.`
                : `Location: ${loc}. Mail waits in Outgoing Mail until you replicate.`,
          );
        },
      })),
    ]);

  return (
    <div className="statusbar">
      <div className={"status-cell sb-bolt" + (busy ? " busy" : "")} title={busy ? "Network activity" : "No network activity"}>
        <Icon name={busy ? "bolt" : "bolt-idle"} />
      </div>
      <div className="status-cell grow sb-msg" ref={histRef} onMouseDown={() => setShowHistory((v) => !v)} title="Click for recent messages">
        <span className="sb-msg-text">{status}</span>
        {showHistory && (
          <div className="sb-history" onMouseDown={(e) => e.stopPropagation()}>
            {history.length === 0 && <div className="sb-history-row muted">No messages.</div>}
            {history.map((h, i) => (
              <div key={i} className="sb-history-row">
                <span className="sb-history-time">{fmtTime(h.at)}</span> {h.text}
              </div>
            ))}
          </div>
        )}
      </div>
      {editing && (
        <>
          <div
            className="status-cell sb-pop"
            title="Font"
            onMouseDown={(e) => {
              e.preventDefault();
              popupAt(e, FONTS.map((f) => ({ label: f.label, checked: editing.font === f.label, run: () => setFont(f.label) })));
            }}
          >
            {editing.font}
          </div>
          <div
            className="status-cell sb-pop"
            title="Point size"
            onMouseDown={(e) => {
              e.preventDefault();
              popupAt(e, SIZES.map((s) => ({ label: s, checked: editing.size === s, run: () => setSize(s) })));
            }}
          >
            {editing.size}
          </div>
          <div
            className="status-cell sb-pop"
            title="Text style"
            onMouseDown={(e) => {
              e.preventDefault();
              popupAt(e, [
                { label: "Bold", checked: editing.bold, run: () => execText("bold") },
                { label: "Italic", checked: editing.italic, run: () => execText("italic") },
                { label: "Underline", checked: editing.underline, run: () => execText("underline") },
                { sep: true },
                { label: "Permanent Pen", checked: editing.permanentPen, run: togglePermanentPen },
                { label: "Normal Text", run: () => execText("removeFormat") },
              ]);
            }}
          >
            {editing.permanentPen ? "Permanent Pen" : [editing.bold && "Bold", editing.italic && "Italic", editing.underline && "Underline"].filter(Boolean).join(", ") || "Plain"}
          </div>
        </>
      )}
      <div
        className="status-cell sb-access"
        title={db ? `You have ${db.access} access to ${db.title}` : "No database"}
        onMouseDown={() => db && void openAccessInfo(db)}
      >
        <Icon name="key" />
        {theme === "notes8" && db && <span>{db.access}</span>}
      </div>
      <div className="status-cell sb-location" title="Location (click to change)" onMouseDown={chooseLocation}>
        <Icon name={LOCATION_ICON[location] ?? "location-office"} />
        <span>{location}</span>
      </div>
      <div
        className={"status-cell sb-mail" + (newMail ? " lit" : "")}
        title={outbox ? `${outbox} memo(s) waiting in Outgoing Mail` : newMail ? "You have new mail" : `${unread} unread`}
        onMouseDown={() => {
          clearNewMail();
          openView("mail");
        }}
      >
        <Icon name={newMail ? "mail-new" : "mail"} />
        {theme === "notes8" && <span>{unread} unread</span>}
        {outbox > 0 && <span className="sb-outbox">({outbox} out)</span>}
      </div>
    </div>
  );
}
