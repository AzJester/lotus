// ============================================================================
// Background services the client runs while open: the simulated Domino
// server (mail arrives, colleagues answer), scheduled replication, the alarm
// daemon, and the browser's leave-page prompt for unsaved documents.
// ============================================================================

import { useEffect } from "react";
import { create } from "zustand";
import { useNotes, canReachServer } from "../data/store";
import { anyDirtyWindows, useUI } from "../data/ui";
import { expandEntry } from "../data/calendarUtil";
import type { CalendarEntry } from "../data/types";
import { announceNewMail, replicationRunning, runReplication } from "./replicate";

export function useDominoServer() {
  useEffect(() => {
    let lastScheduled = Date.now();
    const tick = () => {
      const notes = useNotes.getState();
      const r = notes.serverTick();
      if (r.newMail > 0) announceNewMail(r.newMail);
      const { scheduleOn, everyMinutes } = notes.replSettings;
      const now = Date.now();
      if (
        scheduleOn &&
        everyMinutes > 0 &&
        now - lastScheduled >= everyMinutes * 60000 &&
        canReachServer(notes.user.location) &&
        !replicationRunning()
      ) {
        lastScheduled = now;
        void runReplication({ quiet: true });
      }
    };
    const id = window.setInterval(tick, 5000);
    const first = window.setTimeout(tick, 1500);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(first);
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------

export interface AlarmItem {
  key: string;
  entry: CalendarEntry;
  /** Master id (for opening the entry). */
  masterId: string;
  fireAt: number;
}

export const useAlarms = create<{ due: AlarmItem[] }>(() => ({ due: [] }));

/** Alarms that should be showing now, given acknowledgements. */
export function dueAlarms(calendar: CalendarEntry[], acks: Record<string, number>, now: number): AlarmItem[] {
  const out: AlarmItem[] = [];
  for (const master of calendar) {
    if (!master.alarm) continue;
    const minutes = master.alarmMinutes ?? 15;
    for (const occ of expandEntry(master)) {
      const fireAt = occ.start - minutes * 60000;
      if (fireAt > now || occ.start < now - 30 * 60000) continue;
      const key = `${occ.id}@${occ.start}`;
      const ack = acks[key];
      if (ack === -1 || (ack !== undefined && ack > now)) continue;
      out.push({ key, entry: occ, masterId: master.id, fireAt });
    }
  }
  return out.sort((a, b) => a.entry.start - b.entry.start);
}

export function useAlarmDaemon() {
  useEffect(() => {
    const notified = new Set<string>();
    const check = () => {
      const s = useNotes.getState();
      const due = dueAlarms(s.calendar, s.alarmAcks, Date.now());
      const prev = useAlarms.getState().due;
      if (due.map((d) => d.key).join() !== prev.map((d) => d.key).join()) useAlarms.setState({ due });
      for (const a of due) {
        if (notified.has(a.key)) continue;
        notified.add(a.key);
        useUI.getState().setStatus(`Alarm: ${a.entry.subject}`);
        if (typeof Notification !== "undefined") {
          if (Notification.permission === "granted") {
            try {
              new Notification(a.entry.subject, { body: a.entry.location || "Lotus Notes alarm" });
            } catch {
              /* some browsers block construction */
            }
          } else if (Notification.permission === "default") void Notification.requestPermission();
        }
      }
    };
    check();
    const id = window.setInterval(check, 15000);
    const unsub = useNotes.subscribe((s, p) => {
      if (s.calendar !== p.calendar || s.alarmAcks !== p.alarmAcks) check();
    });
    return () => {
      window.clearInterval(id);
      unsub();
    };
  }, []);
}

export function useLeaveGuard() {
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (!anyDirtyWindows()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, []);
}
