// ============================================================================
// User Preferences (File > Preferences / File > Tools > User Preferences)
// and the Out of Office dialog.
// ============================================================================

import { useState } from "react";
import { NotesDialog, openDialog } from "../../components/dialogs";
import { useNotes } from "../../data/store";
import { useUI } from "../../data/ui";
import type { Theme } from "../../data/ui";
import { outOfOfficeText } from "../../data/router";
import { fmtDate, startOfDay, toDateInput } from "../../lib/format";

function PreferencesDialog({ close }: { close: () => void }) {
  const ui = useUI.getState();
  const notes = useNotes.getState();
  const [theme, setTheme] = useState<Theme>(ui.theme);
  const [textured, setTextured] = useState(ui.uiPrefs.texturedWorkspace);
  const [sidebar, setSidebar] = useState(ui.uiPrefs.sidebar);
  const [save, setSave] = useState(notes.prefs.saveSentMail);
  const [notify, setNotify] = useState(notes.prefs.newMailNotify);
  const [scheduleOn, setScheduleOn] = useState(notes.replSettings.scheduleOn);
  const [every, setEvery] = useState(notes.replSettings.everyMinutes);
  const [section, setSection] = useState<"basics" | "mail" | "replication">("basics");

  const apply = () => {
    if (theme !== ui.theme) ui.setTheme(theme);
    ui.setUiPrefs({ texturedWorkspace: textured, sidebar });
    notes.setPrefs({ saveSentMail: save, newMailNotify: notify });
    notes.setReplSettings({ scheduleOn, everyMinutes: Math.max(1, every) });
    ui.setStatus("Preferences saved.");
    close();
  };

  return (
    <NotesDialog
      title="User Preferences"
      onClose={close}
      width={520}
      footer={
        <>
          <button className="btn primary" onClick={apply}>
            OK
          </button>
          <button className="btn" onClick={close}>
            Cancel
          </button>
        </>
      }
    >
      <div className="prefs">
        <div className="prefs-nav">
          {(
            [
              ["basics", "Basics"],
              ["mail", "Mail"],
              ["replication", "Replication"],
            ] as const
          ).map(([id, label]) => (
            <div key={id} className={"prefs-navitem" + (section === id ? " active" : "")} onMouseDown={() => setSection(id)}>
              {label}
            </div>
          ))}
        </div>
        <div className="prefs-page">
          {section === "basics" && (
            <>
              <fieldset>
                <legend>Look</legend>
                <label className="prefs-line">
                  <input type="radio" checked={theme === "notes8"} onChange={() => setTheme("notes8")} /> Notes 8 (Windows XP)
                </label>
                <label className="prefs-line">
                  <input type="radio" checked={theme === "r5"} onChange={() => setTheme("r5")} /> Classic R5 (Windows 98)
                </label>
              </fieldset>
              <fieldset>
                <legend>Workspace</legend>
                <label className="prefs-line">
                  <input type="checkbox" checked={textured} onChange={(e) => setTextured(e.target.checked)} /> Textured workspace
                </label>
                <label className="prefs-line">
                  <input type="checkbox" checked={sidebar} onChange={(e) => setSidebar(e.target.checked)} /> Show the sidebar
                  (Notes 8)
                </label>
              </fieldset>
            </>
          )}
          {section === "mail" && (
            <>
              <fieldset>
                <legend>Sending</legend>
                <label className="prefs-line">
                  Save sent mail:&nbsp;
                  <select value={save} onChange={(e) => setSave(e.target.value as typeof save)}>
                    <option value="always">Always keep a copy</option>
                    <option value="never">Don't keep a copy</option>
                    <option value="prompt">Always prompt</option>
                  </select>
                </label>
              </fieldset>
              <fieldset>
                <legend>Receiving</legend>
                <label className="prefs-line">
                  <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Show the new mail
                  notice when mail arrives
                </label>
              </fieldset>
            </>
          )}
          {section === "replication" && (
            <fieldset>
              <legend>Schedule</legend>
              <label className="prefs-line">
                <input type="checkbox" checked={scheduleOn} onChange={(e) => setScheduleOn(e.target.checked)} /> Replicate on a
                schedule
              </label>
              <label className="prefs-line">
                Replicate every&nbsp;
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={every}
                  style={{ width: 56 }}
                  onChange={(e) => setEvery(parseInt(e.target.value, 10) || 1)}
                />
                &nbsp;minutes
              </label>
            </fieldset>
          )}
        </div>
      </div>
    </NotesDialog>
  );
}

export function openPreferences() {
  return openDialog<void>((close) => <PreferencesDialog close={() => close()} />);
}

// ---------------------------------------------------------------------------
// Out of Office
// ---------------------------------------------------------------------------

function OutOfOfficeDialog({ close }: { close: () => void }) {
  const notes = useNotes.getState();
  const cur = notes.ooo;
  const [leaving, setLeaving] = useState(toDateInput(cur.leaving));
  const [returning, setReturning] = useState(toDateInput(cur.returning));
  const [message, setMessage] = useState(cur.message);
  const [on, setOn] = useState(cur.enabled);
  const toMs = (v: string) => {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  const l = leaving ? toMs(leaving) : startOfDay(Date.now());
  const r = returning ? toMs(returning) : l + 7 * 86400000;
  const bad = r <= l;

  const ok = () => {
    if (bad) return;
    notes.setOutOfOffice({ enabled: on, leaving: l, returning: r, message });
    useUI
      .getState()
      .setStatus(on ? `Out of Office is on until ${fmtDate(r)}.` : "Out of Office is off.");
    close();
  };

  return (
    <NotesDialog
      title="Out of Office"
      onClose={close}
      width={500}
      footer={
        <>
          <button className="btn primary" onClick={ok} disabled={bad}>
            OK
          </button>
          <button className="btn" onClick={close}>
            Cancel
          </button>
        </>
      }
    >
      <div className="ooo">
        <div className="ooo-state">
          <label>
            <input type="radio" checked={!on} onChange={() => setOn(false)} /> Out of Office is <b>off</b>
          </label>
          <label>
            <input type="radio" checked={on} onChange={() => setOn(true)} /> Out of Office is <b>on</b>
          </label>
        </div>
        <div className="ooo-dates">
          <label>
            Leaving:&nbsp;
            <input type="date" value={leaving} onChange={(e) => setLeaving(e.target.value)} />
          </label>
          <label>
            Returning:&nbsp;
            <input type="date" value={returning} onChange={(e) => setReturning(e.target.value)} />
          </label>
        </div>
        {bad && <div className="prio-high">The return date must be after the leaving date.</div>}
        <label className="ooo-label">Additional message (optional):</label>
        <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="ooo-preview-label">People who write to you will receive:</div>
        <div className="ooo-preview">
          <b>{notes.user.name} is out of the office.</b>
          <br />
          {outOfOfficeText(l, r, message)
            .split("\n")
            .map((line, i) => (
              <span key={i}>
                {line}
                <br />
              </span>
            ))}
        </div>
      </div>
    </NotesDialog>
  );
}

export function openOutOfOffice() {
  return openDialog<void>((close) => <OutOfOfficeDialog close={() => close()} />);
}
