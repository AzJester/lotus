// ============================================================================
// Floating windows the shell owns: the new mail notice, the Alarms window,
// and the desktop you see after File > Exit Notes.
// ============================================================================

import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { useNotes } from "../data/store";
import { useUI } from "../data/ui";
import { fmtTime, fmtDate } from "../lib/format";
import { useAlarms } from "./services";

export function NewMailNotice() {
  const newMail = useUI((s) => s.newMail);
  const clear = useUI((s) => s.clearNewMail);
  const openView = useUI((s) => s.openView);
  const theme = useUI((s) => s.theme);
  useEffect(() => {
    if (!newMail) return;
    const t = setTimeout(clear, 15000);
    return () => clearTimeout(t);
  }, [newMail, clear]);
  if (!newMail) return null;
  return (
    <div className={"newmail " + (theme === "r5" ? "newmail-r5" : "newmail-n8")} role="alert">
      <div className="newmail-title">
        <span>New Mail</span>
        <span className="newmail-x" onClick={clear}>
          ✕
        </span>
      </div>
      <div className="newmail-body">
        <Icon name="mail-new" scale={2} />
        <div>
          <b>You have new mail.</b>
          <div className="muted">
            {newMail.count} new document{newMail.count === 1 ? "" : "s"} in your Inbox
          </div>
        </div>
      </div>
      <div className="newmail-foot">
        <button
          className="btn primary"
          onClick={() => {
            clear();
            openView("mail");
          }}
        >
          Open Mail
        </button>
        <button className="btn" onClick={clear}>
          OK
        </button>
      </div>
    </div>
  );
}

const SNOOZE = [5, 10, 15, 30, 60];

export function AlarmsWindow() {
  const due = useAlarms((s) => s.due);
  const ackAlarm = useNotes((s) => s.ackAlarm);
  const openDocument = useUI((s) => s.openDocument);
  const [sel, setSel] = useState(0);
  const [snooze, setSnooze] = useState(5);
  const locked = useUI((s) => s.locked);
  if (!due.length || locked) return null;
  const cur = due[Math.min(sel, due.length - 1)];
  const done = () => ackAlarm(cur.key, -1);
  return (
    <div className="modal-scrim alarm-scrim">
      <div className="modal notes-dialog alarms" role="dialog" aria-label="Alarms">
        <div className="modal-title">
          <Icon name="alarm" />
          <span style={{ flex: 1, marginLeft: 6 }}>Alarms</span>
        </div>
        <div className="modal-body">
          <div className="alarms-list" role="listbox">
            {due.map((a, i) => (
              <div
                key={a.key}
                role="option"
                aria-selected={i === sel}
                className={"alarms-row" + (i === sel ? " active" : "")}
                onMouseDown={() => setSel(i)}
              >
                <Icon name={a.entry.type === "meeting" ? "meeting" : a.entry.type === "reminder" ? "reminder" : "appointment"} />
                <span className="alarms-when">
                  {a.entry.allDay ? fmtDate(a.entry.start) : `${fmtTime(a.entry.start)}`}
                </span>
                <span className="alarms-subj">{a.entry.subject}</span>
              </div>
            ))}
          </div>
          <div className="alarms-detail">
            <div>
              <b>{cur.entry.subject}</b>
            </div>
            <div>
              {fmtDate(cur.entry.start)} {cur.entry.allDay ? "(all day)" : `${fmtTime(cur.entry.start)} - ${fmtTime(cur.entry.end)}`}
            </div>
            {cur.entry.location && <div>Location: {cur.entry.location}</div>}
          </div>
        </div>
        <div className="modal-foot alarms-foot">
          <label>
            Snooze for&nbsp;
            <select value={snooze} onChange={(e) => setSnooze(Number(e.target.value))}>
              {SNOOZE.map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </label>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => ackAlarm(cur.key, Date.now() + snooze * 60000)}>
            Snooze
          </button>
          <button
            className="btn"
            onClick={() => {
              done();
              openDocument({ coll: "calendar", id: cur.masterId }, { title: cur.entry.subject });
            }}
          >
            Open
          </button>
          <button className="btn primary" onClick={done}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function ExitScreen() {
  const restart = useUI((s) => s.restart);
  const [selected, setSelected] = useState(false);
  return (
    <div className="exit-desk" onMouseDown={() => setSelected(false)}>
      <div
        className={"exit-icon" + (selected ? " selected" : "")}
        onMouseDown={(e) => {
          e.stopPropagation();
          setSelected(true);
        }}
        onDoubleClick={restart}
        onKeyDown={(e) => {
          if (e.key === "Enter") restart();
        }}
        tabIndex={0}
        title="Double-click to start Lotus Notes"
      >
        <span className="exit-mark" aria-hidden>
          <i style={{ background: "#e7b416" }} />
          <i style={{ background: "#d33f3f" }} />
          <i style={{ background: "#3f9d3f" }} />
          <i style={{ background: "#2f6fd0" }} />
        </span>
        <span className="exit-label">Lotus Notes</span>
      </div>
      <div className="exit-hint">Notes has been closed. Double-click the icon to start it again.</div>
    </div>
  );
}
