import { describe, expect, it } from "vitest";
import { mergeCollection } from "./replication";

interface D {
  id: string;
  seq?: number;
  modified?: number;
  body: string;
  conflictOf?: string;
}

const conflict = (loser: D, winner: D): D => ({ ...loser, id: winner.id + "~c", conflictOf: winner.id, seq: 1 });

describe("mergeCollection", () => {
  it("pushes new local documents and pulls new server documents", () => {
    const out = mergeCollection<D>({
      local: [{ id: "a", seq: 1, modified: 1, body: "a" }],
      server: [{ id: "b", seq: 1, modified: 1, body: "b" }],
      base: {},
      localStubs: {},
      serverStubs: {},
      makeConflict: conflict,
    });
    expect(out.local.map((d) => d.id).sort()).toEqual(["a", "b"]);
    expect(out.server.map((d) => d.id).sort()).toEqual(["a", "b"]);
    expect(out.sent).toBe(1);
    expect(out.received).toBe(1);
    expect(out.arrived).toEqual(["b"]);
  });

  it("carries a local deletion to the server instead of resurrecting the document", () => {
    const out = mergeCollection<D>({
      local: [],
      server: [{ id: "a", seq: 1, modified: 5, body: "a" }],
      base: { a: 1 },
      localStubs: { a: 10 },
      serverStubs: {},
      makeConflict: conflict,
    });
    expect(out.local).toEqual([]);
    expect(out.server).toEqual([]);
    expect(out.deleted).toBe(1);
    expect(out.stubs.a).toBe(10);
  });

  it("carries a server deletion to the local replica", () => {
    const out = mergeCollection<D>({
      local: [{ id: "a", seq: 1, modified: 5, body: "a" }],
      server: [],
      base: { a: 1 },
      localStubs: {},
      serverStubs: { a: 10 },
      makeConflict: conflict,
    });
    expect(out.local).toEqual([]);
    expect(out.deleted).toBe(1);
  });

  it("takes the side that changed since the last replication", () => {
    const out = mergeCollection<D>({
      local: [{ id: "a", seq: 1, modified: 1, body: "old" }],
      server: [{ id: "a", seq: 2, modified: 2, body: "edited on server" }],
      base: { a: 1 },
      localStubs: {},
      serverStubs: {},
      makeConflict: conflict,
    });
    expect(out.local[0].body).toBe("edited on server");
    expect(out.received).toBe(1);
    expect(out.base.a).toBe(2);
  });

  it("turns edits on both sides into a replication conflict", () => {
    const out = mergeCollection<D>({
      local: [{ id: "a", seq: 3, modified: 30, body: "mine (two edits)" }],
      server: [{ id: "a", seq: 2, modified: 40, body: "theirs (one edit)" }],
      base: { a: 1 },
      localStubs: {},
      serverStubs: {},
      makeConflict: conflict,
    });
    expect(out.conflicts).toBe(1);
    const winner = out.local.find((d) => d.id === "a")!;
    const loser = out.local.find((d) => d.conflictOf === "a")!;
    expect(winner.body).toBe("mine (two edits)"); // more edits wins
    expect(loser.body).toBe("theirs (one edit)");
    expect(out.server).toHaveLength(2);
  });

  it("leaves documents outside the include filter alone", () => {
    const out = mergeCollection<D>({
      local: [
        { id: "a", body: "replicated" },
        { id: "x", body: "local only" },
      ],
      server: [],
      base: {},
      localStubs: {},
      serverStubs: {},
      makeConflict: conflict,
      include: (d) => d.id !== "x",
    });
    expect(out.server.map((d) => d.id)).toEqual(["a"]);
    expect(out.local.map((d) => d.id)).toContain("x");
  });

  it("lets a document recreated after its deletion replicate again", () => {
    const out = mergeCollection<D>({
      local: [{ id: "a", seq: 1, modified: 50, body: "back" }],
      server: [],
      base: {},
      localStubs: {},
      serverStubs: { a: 10 },
      makeConflict: conflict,
    });
    expect(out.server.map((d) => d.id)).toEqual(["a"]);
    expect(out.stubs.a).toBeUndefined();
  });
});
