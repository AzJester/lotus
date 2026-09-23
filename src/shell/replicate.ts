// ============================================================================
// Replication with the client around it: the lightning bolt in the status
// bar, status messages, the new mail notice, and the Island error. Used by
// the Replicator page, the menus, the toolbar and the schedule.
// ============================================================================

import { useNotes, canReachServer } from "../data/store";
import { useUI } from "../data/ui";
import { MAIL_SERVER, APPS_SERVER } from "../data/directory";
import { notesAlert } from "../components/dialogs";
import type { ReplResult } from "../data/types";

export const REPL_SERVERS: Record<string, string> = { mail: MAIL_SERVER, discussion: APPS_SERVER };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ReplStep {
  /** "outgoing" or a database id. */
  id: string;
  state: "waiting" | "running" | "done" | "error";
  detail?: string;
}

export function announceNewMail(count: number) {
  if (count <= 0) return;
  const ui = useUI.getState();
  ui.setStatus(count === 1 ? "You have new mail." : `You have new mail (${count} new documents).`);
  if (useNotes.getState().prefs.newMailNotify) ui.notifyNewMail(count);
}

let running = false;
export const replicationRunning = () => running;

/**
 * Replicate the chosen databases one by one (so the Replicator page can show
 * progress), with Send outgoing mail first. `quiet` keeps errors in the
 * status bar instead of a dialog (scheduled runs).
 */
export async function runReplication(
  opts: { dbs?: string[]; sendOutgoing?: boolean; quiet?: boolean; onStep?: (steps: ReplStep[]) => void } = {},
): Promise<ReplResult | null> {
  if (running) return null;
  const notes = useNotes.getState();
  const ui = useUI.getState();
  const settings = notes.replSettings;
  const dbs = opts.dbs ?? Object.keys(REPL_SERVERS).filter((id) => settings.enabled[id] !== false);
  const sendOutgoing = opts.sendOutgoing ?? settings.sendOutgoing;

  if (!canReachServer(notes.user.location)) {
    const msg = "Unable to find path to server.";
    ui.setStatus(`Replication failed: ${msg} (Location: ${notes.user.location})`);
    if (!opts.quiet) await notesAlert(msg, { icon: "error" });
    return { ok: false, error: msg, dbs: [], mailSent: 0, newMail: 0 };
  }

  running = true;
  ui.networkStart();
  const steps: ReplStep[] = [
    ...(sendOutgoing ? [{ id: "outgoing", state: "waiting" as const }] : []),
    ...dbs.map((id) => ({ id, state: "waiting" as const })),
  ];
  const report = () => opts.onStep?.(steps.map((s) => ({ ...s })));
  report();
  const total: ReplResult = { ok: true, dbs: [], mailSent: 0, newMail: 0 };
  try {
    for (const step of steps) {
      step.state = "running";
      report();
      if (step.id === "outgoing") {
        ui.setStatus("Sending outgoing mail...");
        await sleep(350);
        total.mailSent = useNotes.getState().sendOutgoing();
        step.detail = total.mailSent ? `${total.mailSent} sent` : "No mail waiting";
      } else {
        const title = useNotes.getState().databases.find((d) => d.id === step.id)?.title ?? step.id;
        ui.setStatus(`Replicating ${title} with ${REPL_SERVERS[step.id]}...`);
        await sleep(450);
        const r = useNotes.getState().replicate({ dbs: [step.id], sendOutgoing: false });
        if (!r.ok) {
          step.state = "error";
          step.detail = r.error;
          total.ok = false;
          total.error = r.error;
          continue;
        }
        const d = r.dbs[0];
        total.dbs.push(d);
        total.newMail += r.newMail;
        step.detail =
          `${d.received} received, ${d.sent} sent` +
          (d.deleted ? `, ${d.deleted} deleted` : "") +
          (d.conflicts ? `, ${d.conflicts} conflict${d.conflicts === 1 ? "" : "s"}` : "");
      }
      step.state = step.state === "running" ? "done" : step.state;
      report();
    }
  } finally {
    ui.networkEnd();
    running = false;
  }
  const received = total.dbs.reduce((n, d) => n + d.received, 0);
  const sent = total.dbs.reduce((n, d) => n + d.sent, 0);
  const conflicts = total.dbs.reduce((n, d) => n + d.conflicts, 0);
  ui.setStatus(
    `Replication complete: ${received} received, ${sent} sent` +
      (total.mailSent ? `, ${total.mailSent} mail sent` : "") +
      (conflicts ? `, ${conflicts} replication conflict${conflicts === 1 ? "" : "s"}` : "") +
      ".",
  );
  announceNewMail(total.newMail);
  return total;
}
