// ============================================================================
// Replication, the Notes way. Each side keeps deletion stubs, and every
// document carries an edit sequence number. `base` remembers the sequence
// number both replicas agreed on at the last replication, so a merge can
// tell who changed what:
//   - only one side changed      -> that side's copy wins
//   - both sides changed         -> the copy with more edits wins and the
//                                   other becomes a "[Replication or Save
//                                   Conflict]" response
//   - a stub exists on one side  -> the deletion replicates
// Pure functions; the store applies the results.
// ============================================================================

import type { DocMeta, ID } from "./types";
import { docTime } from "./docs";

type Doc = DocMeta & { id: ID };

export interface MergeInput<T extends Doc> {
  local: T[];
  server: T[];
  base: Record<ID, number>;
  localStubs: Record<ID, number>;
  serverStubs: Record<ID, number>;
  /** Build the losing copy of a conflict (new id, conflictOf = winner). */
  makeConflict: (loser: T, winner: T) => T;
  /** Only local documents passing this filter replicate (others stay local). */
  include?: (doc: T) => boolean;
}

export interface MergeOutput<T extends Doc> {
  local: T[];
  server: T[];
  base: Record<ID, number>;
  stubs: Record<ID, number>;
  received: number;
  sent: number;
  deleted: number;
  conflicts: number;
  /** Ids that arrived on the local side (new documents). */
  arrived: ID[];
}

const seqOf = (d: Doc) => d.seq ?? 1;

/** Content comparison ignoring nothing: two copies are equal only if identical. */
function same(a: Doc, b: Doc): boolean {
  if (seqOf(a) !== seqOf(b) || a.modified !== b.modified) return JSON.stringify(a) === JSON.stringify(b);
  return true;
}

export function mergeCollection<T extends Doc>(input: MergeInput<T>): MergeOutput<T> {
  const include = input.include ?? (() => true);
  const localAll = input.local;
  const local = localAll.filter(include);
  const passthrough = localAll.filter((d) => !include(d));

  const L = new Map(local.map((d) => [d.id, d]));
  const S = new Map(input.server.map((d) => [d.id, d]));
  const base: Record<ID, number> = { ...input.base };
  const stubs: Record<ID, number> = { ...input.serverStubs };
  for (const [id, t] of Object.entries(input.localStubs)) stubs[id] = Math.max(stubs[id] ?? 0, t);

  const order: ID[] = [];
  const seen = new Set<ID>();
  for (const d of [...local, ...input.server]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    order.push(d.id);
  }

  const merged: T[] = [];
  const extras: T[] = [];
  const arrived: ID[] = [];
  let received = 0;
  let sent = 0;
  let deleted = 0;
  let conflicts = 0;

  for (const id of order) {
    const l = L.get(id);
    const r = S.get(id);
    if (l && r) {
      if (same(l, r)) {
        merged.push(l);
        base[id] = seqOf(l);
        continue;
      }
      const b = base[id];
      if (b === undefined) {
        // Never replicated before: keep the newer copy.
        const winner = docTime(r as never) > docTime(l as never) ? r : l;
        if (winner === r) received++;
        else sent++;
        merged.push(winner);
        base[id] = seqOf(winner);
        continue;
      }
      const lChanged = seqOf(l) > b;
      const rChanged = seqOf(r) > b;
      if (lChanged && rChanged) {
        const winner =
          seqOf(l) !== seqOf(r)
            ? seqOf(l) > seqOf(r)
              ? l
              : r
            : (l.modified ?? 0) >= (r.modified ?? 0)
              ? l
              : r;
        const loser = winner === l ? r : l;
        merged.push(winner);
        extras.push(input.makeConflict(loser, winner));
        base[id] = seqOf(winner);
        conflicts++;
      } else if (rChanged) {
        merged.push(r);
        base[id] = seqOf(r);
        received++;
      } else {
        merged.push(l);
        base[id] = seqOf(l);
        sent++;
      }
    } else if (l) {
      const stub = input.serverStubs[id];
      if (stub !== undefined && stub >= (l.modified ?? 0)) {
        deleted++; // deleted on the server
        delete base[id];
      } else {
        // New here, or recreated after the deletion: it replicates (and
        // the stale stub goes away).
        delete stubs[id];
        merged.push(l);
        base[id] = seqOf(l);
        sent++;
      }
    } else if (r) {
      const stub = input.localStubs[id];
      if (stub !== undefined && stub >= (r.modified ?? 0)) {
        deleted++; // deleted locally
        delete base[id];
      } else {
        delete stubs[id];
        merged.push(r);
        base[id] = seqOf(r);
        received++;
        arrived.push(id);
      }
    }
  }

  for (const c of extras) base[c.id] = seqOf(c);
  const replicated = [...merged, ...extras];
  return {
    local: [...replicated, ...passthrough],
    server: replicated,
    base,
    stubs,
    received,
    sent,
    deleted,
    conflicts,
    arrived: [...arrived, ...extras.map((c) => c.id)],
  };
}

/** How many local documents differ from what the server last saw. */
export function pendingCount<T extends Doc>(
  local: T[],
  base: Record<ID, number>,
  localStubs: Record<ID, number>,
  serverIds: Set<ID>,
  include: (d: T) => boolean = () => true,
): number {
  let n = 0;
  for (const d of local) {
    if (!include(d)) continue;
    const b = base[d.id];
    if (b === undefined || seqOf(d) > b) n++;
  }
  for (const id of Object.keys(localStubs)) if (serverIds.has(id)) n++;
  return n;
}
