// ============================================================================
// The Replicator page (a bookmark in R5, the last Workspace tab in R4). One
// row per replicated database with a check box, its server, last run and
// pending changes; a "Send outgoing mail" row; the Start button with per-row
// progress; and the replication schedule.
// ============================================================================

import { useState } from "react";
import { ActionBar } from "../../components/ActionBar";
import type { ActionItem } from "../../components/ActionBar";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { useTabCommands } from "../../components/tabs";
import { useNotes, canReachServer } from "../../data/store";
import { useUI } from "../../data/ui";
import { fmtDateTime } from "../../lib/format";
import { REPL_SERVERS, replicationRunning, runReplication } from "../../shell/replicate";
import type { ReplStep } from "../../shell/replicate";
import "../../styles/replication.css";

const DB_ICON: Record<string, IconName> = { mail: "mail", discussion: "discussion" };

function StateCell({ step, pending }: { step?: ReplStep; pending: number }) {
  if (!step) return <span className="rc-state muted">{pending ? "Ready" : "Up to date"}</span>;
  if (step.state === "waiting") return <span className="rc-state muted">Waiting...</span>;
  if (step.state === "running")
    return (
      <span className="rc-state">
        <span className="repl-progress">
          <span className="repl-progress-fill" />
        </span>
      </span>
    );
  return <span className={"rc-state" + (step.state === "error" ? " error" : "")}>{step.detail ?? "Done"}</span>;
}

export default function Replicator() {
  const databases = useNotes((s) => s.databases);
  const settings = useNotes((s) => s.replSettings);
  const setReplSettings = useNotes((s) => s.setReplSettings);
  const replLog = useNotes((s) => s.replLog);
  const outboxCount = useNotes((s) => s.outbox.length);
  const location = useNotes((s) => s.user.location);
  const pendingFor = useNotes((s) => s.pendingFor);
  // Re-render when replicated collections change so pending counts stay live.
  useNotes((s) => s.mail);
  useNotes((s) => s.calendar);
  useNotes((s) => s.todos);
  useNotes((s) => s.discussion);
  useNotes((s) => s.stubs);
  const openView = useUI((s) => s.openView);
  const [steps, setSteps] = useState<ReplStep[]>([]);
  const [busy, setBusy] = useState(false);

  const reachable = canReachServer(location);
  const rows = Object.keys(REPL_SERVERS)
    .map((id) => databases.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d);

  const start = async (only?: string) => {
    if (busy || replicationRunning()) return;
    setBusy(true);
    setSteps([]);
    try {
      await runReplication({
        dbs: only ? (only === "outgoing" ? [] : [only]) : undefined,
        sendOutgoing: only ? only === "outgoing" : undefined,
        onStep: setSteps,
      });
    } finally {
      setBusy(false);
    }
  };

  const stepFor = (id: string) => steps.find((s) => s.id === id);

  const actions: ActionItem[] = [
    { id: "start", label: "Start", icon: "replicator", disabled: busy, run: () => void start() },
    { id: "send", label: "Send Outgoing Mail", icon: "send", disabled: busy, run: () => void start("outgoing") },
    "sep",
    { id: "outbox", label: "Open Outgoing Mail", icon: "outbox", run: () => openView("outbox") },
  ];

  useTabCommands("replicator", { refresh: () => void start() });

  return (
    <div className="app replicator-page">
      <ActionBar actions={actions} />
      <div className="repl-banner">
        <Icon name="db-replicator" />
        <div className="repl-banner-text">
          <div className="repl-banner-title">Replicator</div>
          <div className="repl-banner-sub">
            Location: <b>{location}</b>
            {!reachable && <span className="repl-warn"> Unable to find path to server from this location.</span>}
          </div>
        </div>
      </div>
      <div className="repl-table" role="table">
        <div className="repl-thead" role="row">
          <span className="rc-check" />
          <span className="rc-db">Database</span>
          <span className="rc-server">Server</span>
          <span className="rc-last">Last Run</span>
          <span className="rc-pending">Pending</span>
          <span className="rc-state">Status</span>
        </div>
        <div
          className={"repl-row" + (stepFor("outgoing")?.state === "running" ? " running" : "")}
          role="row"
          onDoubleClick={() => void start("outgoing")}
          title="Double-click to send outgoing mail now"
        >
          <span className="rc-check">
            <input
              type="checkbox"
              checked={settings.sendOutgoing}
              onChange={(e) => setReplSettings({ sendOutgoing: e.target.checked })}
              aria-label="Send outgoing mail"
            />
          </span>
          <span className="rc-db">
            <Icon name="outbox" /> Send outgoing mail
          </span>
          <span className="rc-server">{REPL_SERVERS.mail}</span>
          <span className="rc-last">{replLog.outgoing ? fmtDateTime(replLog.outgoing) : ""}</span>
          <span className="rc-pending">{outboxCount || ""}</span>
          <StateCell step={stepFor("outgoing")} pending={outboxCount} />
        </div>
        {rows.map((db) => {
          const pending = pendingFor(db.id);
          const step = stepFor(db.id);
          return (
            <div
              key={db.id}
              className={"repl-row" + (step?.state === "running" ? " running" : "")}
              role="row"
              onDoubleClick={() => void start(db.id)}
              title={`Double-click to replicate ${db.title} now`}
            >
              <span className="rc-check">
                <input
                  type="checkbox"
                  checked={settings.enabled[db.id] !== false}
                  onChange={(e) => setReplSettings({ enabled: { ...settings.enabled, [db.id]: e.target.checked } })}
                  aria-label={`Replicate ${db.title}`}
                />
              </span>
              <span className="rc-db">
                <Icon name={DB_ICON[db.id] ?? "database"} /> {db.title}
              </span>
              <span className="rc-server">{REPL_SERVERS[db.id]}</span>
              <span className="rc-last">{replLog[db.id] ? fmtDateTime(replLog[db.id]) : "Never"}</span>
              <span className="rc-pending">{pending || ""}</span>
              <StateCell step={step} pending={pending} />
            </div>
          );
        })}
      </div>
      <fieldset className="repl-schedule">
        <legend>Schedule</legend>
        <label>
          <input
            type="checkbox"
            checked={settings.scheduleOn}
            onChange={(e) => setReplSettings({ scheduleOn: e.target.checked })}
          />{" "}
          Replicate on a schedule, every{" "}
          <input
            type="number"
            className="repl-minutes"
            min={5}
            max={240}
            value={settings.everyMinutes}
            onChange={(e) => setReplSettings({ everyMinutes: Math.max(5, Math.min(240, Number(e.target.value) || 60)) })}
            disabled={!settings.scheduleOn}
          />{" "}
          minutes
        </label>
        <div className="repl-note">
          Scheduled replication runs from the Home and Travel locations. At the Office the server delivers mail as it
          arrives; on the Island nothing can reach the server.
        </div>
      </fieldset>
    </div>
  );
}
