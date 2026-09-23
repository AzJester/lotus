/* @jsxRuntime automatic */
// ============================================================================
// NotesView: categories with twisties and counts, the selection margin, the
// view keyboard (arrows, Enter, Space, Insert, Delete), and the rule that a
// view always has a current document.
// ============================================================================

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NotesView } from "./NotesView";
import type { ViewColumn } from "./NotesView";
import { useUI } from "../data/ui";

afterEach(() => {
  cleanup();
  useUI.setState({ viewPrefs: {} });
});

interface Doc {
  id: string;
  title: string;
  cat: string;
  unread?: boolean;
  parent?: string;
}

const DOCS: Doc[] = [
  { id: "a", title: "Alpha", cat: "Work", unread: true },
  { id: "b", title: "Bravo", cat: "Work" },
  { id: "c", title: "Charlie", cat: "Home" },
];

const COLUMNS: ViewColumn<Doc>[] = [
  { id: "title", title: "Title", flex: true, sortable: true, sortValue: (d) => d.title, render: (d) => d.title },
];

function Harness(props: {
  docs?: Doc[];
  categorized?: boolean;
  onOpen?: (d: Doc) => void;
  onDelete?: (ids: string[]) => void;
  onToggleUnread?: (d: Doc) => void;
  onCaretSpy?: (key: string | null) => void;
  parents?: boolean;
}) {
  const [caret, setCaret] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  return (
    <div>
      <div data-testid="checked">{[...checked].sort().join(",")}</div>
      <div data-testid="caret">{caret ?? ""}</div>
      <NotesView<Doc>
        viewKey="test"
        docs={props.docs ?? DOCS}
        getId={(d) => d.id}
        columns={COLUMNS}
        defaultSort={{ col: "title", dir: 1 }}
        categorize={props.categorized ? (d) => d.cat : undefined}
        parentOf={props.parents ? (d) => d.parent : undefined}
        isUnread={(d) => !!d.unread}
        caret={caret}
        onCaret={(k) => {
          setCaret(k);
          props.onCaretSpy?.(k);
        }}
        checked={checked}
        onChecked={setChecked}
        onOpen={props.onOpen ?? (() => undefined)}
        onDelete={props.onDelete}
        onToggleUnread={props.onToggleUnread}
      />
    </div>
  );
}

const view = () => document.querySelector(".nview") as HTMLElement;
const rowLabels = () =>
  Array.from(document.querySelectorAll(".nview-row")).map((r) =>
    r.classList.contains("nview-cat") ? `[${r.querySelector(".nview-catlabel")?.textContent}]` : r.textContent?.trim(),
  );

describe("NotesView", () => {
  it("groups documents under twistie categories with counts, and collapses them", () => {
    render(<Harness categorized />);
    expect(rowLabels()).toEqual(["[Home]", "Charlie", "[Work]", "Alpha", "Bravo"]);
    expect(screen.getByText("(2)")).toBeTruthy();
    const work = document.querySelectorAll(".nview-cat")[1];
    fireEvent.mouseDown(work.querySelector(".nview-twistie")!);
    expect(rowLabels()).toEqual(["[Home]", "Charlie", "[Work]"]);
  });

  it("puts the selection bar on the first document when it opens", () => {
    render(<Harness />);
    expect(screen.getByTestId("caret").textContent).toBe("a");
    expect(document.querySelector(".nview-row.caret")?.textContent).toContain("Alpha");
  });

  it("marks unread documents red with a star in the margin", () => {
    render(<Harness />);
    const alpha = document.querySelector('.nview-row[data-rowkey="a"]')!;
    expect(alpha.classList.contains("unread")).toBe(true);
    expect(alpha.querySelector(".nview-star svg")).toBeTruthy();
  });

  it("moves with the arrows, opens with Enter and checks with Space", () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    fireEvent.keyDown(view(), { key: "ArrowDown" });
    expect(screen.getByTestId("caret").textContent).toBe("b");
    fireEvent.keyDown(view(), { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
    fireEvent.keyDown(view(), { key: " " });
    expect(screen.getByTestId("checked").textContent).toBe("b");
  });

  it("leaves Alt+Enter to the menus (Document Properties)", () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    fireEvent.keyDown(view(), { key: "Enter", altKey: true });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("deletes the checked documents, or the current one", () => {
    const onDelete = vi.fn();
    render(<Harness onDelete={onDelete} />);
    fireEvent.keyDown(view(), { key: "Delete" });
    expect(onDelete).toHaveBeenLastCalledWith(["a"]);
    fireEvent.mouseDown(document.querySelector('.nview-row[data-rowkey="c"] .nview-margin')!, { button: 0 });
    fireEvent.keyDown(view(), { key: "Delete" });
    expect(onDelete).toHaveBeenLastCalledWith(["c"]);
  });

  it("toggles unread with Insert", () => {
    const onToggleUnread = vi.fn();
    render(<Harness onToggleUnread={onToggleUnread} />);
    fireEvent.keyDown(view(), { key: "Insert" });
    expect(onToggleUnread).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });

  it("indents responses under their main document", () => {
    const docs: Doc[] = [
      { id: "t", title: "Topic", cat: "" },
      { id: "r", title: "Response", cat: "", parent: "t" },
    ];
    render(<Harness docs={docs} parents />);
    const response = document.querySelector('.nview-row[data-rowkey="r"] .nview-indent') as HTMLElement | null;
    expect(response).toBeNull(); // no indent column declared
    expect(rowLabels()).toEqual(["Topic", "Response"]);
  });

  it("moves to the first document when the current one leaves the view", () => {
    const { rerender } = render(<Harness />);
    expect(screen.getByTestId("caret").textContent).toBe("a");
    rerender(<Harness docs={DOCS.filter((d) => d.id !== "a")} />);
    expect(screen.getByTestId("caret").textContent).toBe("b");
  });
});
