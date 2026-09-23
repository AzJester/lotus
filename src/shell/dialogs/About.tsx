// ============================================================================
// Help > About IBM Lotus Notes, and the access-level box behind the key in
// the status bar.
// ============================================================================

import { NotesDialog, openDialog } from "../../components/dialogs";
import type { NotesDatabase } from "../../data/types";

export function openAboutNotes() {
  return openDialog<void>((close) => (
    <NotesDialog
      title="About IBM Lotus Notes"
      onClose={() => close()}
      width={460}
      footer={
        <button className="btn primary" onClick={() => close()}>
          OK
        </button>
      }
    >
      <div className="about-box">
        <span className="tb-appicon about-icon" aria-hidden>
          <span className="tb-appicon-mark">❋</span>
        </span>
        <div className="about-text">
          <div className="about-title">IBM Lotus Notes, Web Edition</div>
          <p>
            Resurrected by <b>Dr. Shane Turner</b> for Gen X and Boomers everywhere.
          </p>
          <p>
            No Domino servers were harmed in the making of this app. Side effects may include flashbacks to dial-up,
            fondness for the SmartIcons toolbar, and the sudden urge to replicate.
          </p>
          <div className="about-version">
            Release 8.5 (web recreation) · Built with React · Your data stays in this browser.
          </div>
        </div>
      </div>
    </NotesDialog>
  ));
}

const PRIVILEGES: Record<NotesDatabase["access"], string[]> = {
  Manager: ["Create documents", "Delete documents", "Create private agents", "Create personal folders/views", "Create shared folders/views", "Create LotusScript/Java agents", "Read public documents", "Write public documents", "Replicate or copy documents"],
  Designer: ["Create documents", "Delete documents", "Create shared folders/views", "Read public documents", "Write public documents", "Replicate or copy documents"],
  Editor: ["Create documents", "Delete documents", "Create personal folders/views", "Read public documents", "Write public documents", "Replicate or copy documents"],
  Author: ["Create documents", "Delete documents", "Read public documents", "Replicate or copy documents"],
  Reader: ["Read public documents", "Replicate or copy documents"],
};

export function openAccessInfo(db: NotesDatabase) {
  return openDialog<void>((close) => (
    <NotesDialog
      title="Groups and Roles"
      onClose={() => close()}
      width={380}
      footer={
        <button className="btn primary" onClick={() => close()}>
          Close
        </button>
      }
    >
      <div className="access">
        <div>
          You have <b>{db.access}</b> access to <b>{db.title}</b>.
        </div>
        <div className="access-label">Access privileges:</div>
        <ul className="access-list">
          {PRIVILEGES[db.access].map((p) => (
            <li key={p}>✓ {p}</li>
          ))}
        </ul>
      </div>
    </NotesDialog>
  ));
}
