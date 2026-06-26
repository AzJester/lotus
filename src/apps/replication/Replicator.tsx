// ============================================================================
// Lotus Notes — Replicator
// A modal dialog modeled on the classic Notes Replicator page. It lists each
// document database with its local count and sync status, shows the last
// replication time, and runs a two-way merge against the "server" replica via
// the store's replicateNow action.
// ============================================================================

import { useMemo, useState } from "react";
import { Dialog } from "../../components/ui";
import { useNotes } from "../../data/store";
import { useUI } from "../../data/ui";
import { fmtDateTime } from "../../lib/format";
import type { ReplicaSnapshot } from "../../data/types";
import "../../styles/replication.css";

interface Row {
  key: keyof ReplicaSnapshot;
  label: string;
  icon: string;
}

// The databases shown in the Replicator, in Notes' usual order.
const ROWS: Row[] = [
  { key: "mail", label: "Mail", icon: "✉️" },
  { key: "calendar", label: "Calendar", icon: "📅" },
  { key: "contacts", label: "Contacts", icon: "👤" },
  { key: "todos", label: "To Do", icon: "✅" },
  { key: "journal", label: "Notebook", icon: "📓" },
  { key: "discussion", label: "Discussion", icon: "💬" },
];

/** Count of local docs in a collection not yet matching the server replica. */
function pendingFor(
  local: { id: string }[],
  remote: { id: string }[],
): number {
  const remoteById = new Map<string, unknown>();
  for (const d of remote) remoteById.set(d.id, d);
  let pending = 0;
  for (const doc of local) {
    const match = remoteById.get(doc.id);
    if (!match || JSON.stringify(match) !== JSON.stringify(doc)) pending++;
  }
  return pending;
}

export default function Replicator() {
  const closeReplication = useUI((s) => s.closeReplication);
  const setStatus = useUI((s) => s.setStatus);
  const replicateNow = useNotes((s) => s.replicateNow);

  // Subscribe to the collections + server so the list updates after a sync.
  const mail = useNotes((s) => s.mail);
  const calendar = useNotes((s) => s.calendar);
  const contacts = useNotes((s) => s.contacts);
  const todos = useNotes((s) => s.todos);
  const journal = useNotes((s) => s.journal);
  const discussion = useNotes((s) => s.discussion);
  const server = useNotes((s) => s.server);
  const lastReplicated = useNotes((s) => s.lastReplicated);

  const [busy, setBusy] = useState(false);

  const locals: Record<keyof ReplicaSnapshot, { id: string }[]> = useMemo(
    () => ({ mail, calendar, contacts, todos, journal, discussion }),
    [mail, calendar, contacts, todos, journal, discussion],
  );

  const onReplicate = () => {
    if (busy) return;
    setBusy(true);
    setStatus("Replicating with server...");
    // A short delay so the in-progress state is visible, then merge.
    window.setTimeout(() => {
      const { pulled, pushed } = replicateNow();
      setBusy(false);
      setStatus(`Replication complete: ${pulled} received, ${pushed} sent.`);
    }, 450);
  };

  const footer = (
    <>
      <span className="repl-foot-info">
        Last replicated: {lastReplicated ? fmtDateTime(lastReplicated) : "Never"}
      </span>
      <span className="repl-foot-spacer" />
      <button className="btn primary" onClick={onReplicate} disabled={busy}>
        {busy ? "Replicating…" : "Replicate Now"}
      </button>
      <button className="btn" onClick={closeReplication}>
        Close
      </button>
    </>
  );

  return (
    <Dialog title="Replicator" onClose={closeReplication} footer={footer} width={460}>
      <div className="repl">
        <div className="repl-server">
          <span className="repl-server-ic">🖥️</span>
          <div className="repl-server-meta">
            <div className="repl-server-name">Domino Server (acme/Mail)</div>
            <div className="repl-server-state">
              {busy ? "Replicating…" : "Connected"}
            </div>
          </div>
          <span className={"repl-led" + (busy ? " busy" : "")} aria-hidden />
        </div>

        <div className="repl-list">
          <div className="repl-head">
            <span className="repl-c-db">Database</span>
            <span className="repl-c-count">Documents</span>
            <span className="repl-c-status">Status</span>
          </div>
          {ROWS.map((row) => {
            const local = locals[row.key];
            const remote = server[row.key] as { id: string }[];
            const pending = pendingFor(local, remote);
            return (
              <div key={row.key} className="repl-row">
                <span className="repl-c-db">
                  <span className="repl-row-ic">{row.icon}</span>
                  {row.label}
                </span>
                <span className="repl-c-count">{local.length}</span>
                <span
                  className={"repl-c-status" + (pending > 0 ? " pending" : " synced")}
                >
                  {pending > 0 ? `${pending} pending` : "In sync"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
