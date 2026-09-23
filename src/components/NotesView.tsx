// ============================================================================
// <NotesView>: the Notes view, shared by every database.
//
//   - the selection margin: click it (or press Space) to check documents;
//     unread documents show a red star there and marked-for-deletion ones a
//     trash can; unread rows are red
//   - categories and response threads with twisties (+ / - / arrows)
//   - keyboard first: arrows, Home/End, PageUp/PageDown, Enter opens,
//     Insert toggles unread, Delete marks, F9 refreshes, typing opens
//     Quick Search
//   - user-sortable columns (click the header) and resizable columns, both
//     remembered per view; columns never crush below their minimum width,
//     the view scrolls sideways instead
//   - right-click context menu and drag support supplied by the module
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { useUI } from "../data/ui";
import { useTab, useTabCommands } from "./tabs";
import { NotesDialog, openDialog } from "./dialogs";

export interface RowInfo {
  selected: boolean;
  depth: number;
}

export interface ViewColumn<T> {
  id: string;
  title: string;
  headerIcon?: IconName;
  /** Starting width in px (resizable). */
  width?: number;
  /** Takes the remaining space, never narrower than minWidth. */
  flex?: boolean;
  minWidth?: number;
  align?: "left" | "center" | "right";
  /** The user may click the header to sort by this column. */
  sortable?: boolean;
  sortValue?: (d: T) => string | number;
  render: (d: T, info: RowInfo) => ReactNode;
  /** Text Quick Search matches against (defaults to sortValue). */
  text?: (d: T) => string;
  /** A narrow icon column: fixed width, centered, not resizable. */
  icon?: boolean;
  /** Responses are indented in this column. */
  indent?: boolean;
}

export interface NotesViewProps<T> {
  /** Remembers sort, widths and collapsed categories. */
  viewKey: string;
  docs: T[];
  getId: (d: T) => string;
  columns: ViewColumn<T>[];
  defaultSort?: { col: string; dir: 1 | -1 };
  /** Category label(s) for a document; "A\\B" makes a subcategory. */
  categorize?: (d: T) => string | string[];
  categoryOrder?: (a: string, b: string) => number;
  /** Response hierarchy: the document this one responds to. */
  parentOf?: (d: T) => string | null | undefined;
  isUnread?: (d: T) => boolean;
  rowClass?: (d: T) => string | undefined;
  /** Current row key (from onCaret), or a document id to select one. */
  caret: string | null;
  onCaret: (key: string | null, doc: T | null) => void;
  checked: Set<string>;
  onChecked: (next: Set<string>) => void;
  /** Documents marked for deletion (trash can in the margin). */
  marked?: Set<string>;
  onOpen: (d: T) => void;
  onToggleUnread?: (d: T) => void;
  /** Delete key: the checked documents, or the current one. */
  onDelete?: (ids: string[]) => void;
  onRefresh?: () => void;
  onContextMenu?: (e: React.MouseEvent, d: T | null) => void;
  onDragStart?: (e: React.DragEvent, d: T) => void;
  emptyText?: string;
  /** Take keyboard focus when the window comes to the front. */
  autoFocus?: boolean;
  /** Hide the selection margin (rarely wanted). */
  noMargin?: boolean;
  /** Do not put the selection bar on the first document when the view opens. */
  noAutoSelect?: boolean;
}

type Row<T> =
  | { kind: "cat"; key: string; label: string; depth: number; count: number; collapsed: boolean }
  | { kind: "doc"; key: string; id: string; doc: T; depth: number; hasChildren: boolean; collapsed: boolean };

const MARGIN_W = 30;
const ICON_W = 22;

function cmp(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}

export function NotesView<T>(props: NotesViewProps<T>) {
  const {
    viewKey,
    docs,
    getId,
    columns,
    categorize,
    parentOf,
    isUnread,
    caret,
    onCaret,
    checked,
    onChecked,
    marked,
    onOpen,
  } = props;
  const { tab, active } = useTab();
  const prefs = useUI((s) => s.viewPrefs[viewKey]);
  const setViewPrefs = useUI((s) => s.setViewPrefs);
  const [dragWidths, setDragWidths] = useState<Record<string, number> | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const sort = prefs?.sort ?? props.defaultSort;
  const collapsed = useMemo(() => new Set(prefs?.collapsed ?? []), [prefs?.collapsed]);
  const widths = dragWidths ?? prefs?.widths ?? {};

  const setCollapsed = (next: Set<string>) => setViewPrefs(viewKey, { collapsed: [...next] });

  // ---- build rows ---------------------------------------------------------
  const rows = useMemo<Row<T>[]>(() => {
    const sortCol = sort ? columns.find((c) => c.id === sort.col) : undefined;
    const sorted = [...docs];
    if (sortCol?.sortValue) {
      const sv = sortCol.sortValue;
      const dir = sort!.dir;
      sorted.sort((a, b) => cmp(sv(a), sv(b)) * dir);
    }

    const ids = new Set(docs.map(getId));
    const children = new Map<string, T[]>();
    const roots: T[] = [];
    for (const d of sorted) {
      const p = parentOf?.(d);
      if (p && ids.has(p) && p !== getId(d)) {
        const list = children.get(p) ?? [];
        list.push(d);
        children.set(p, list);
      } else roots.push(d);
    }

    const out: Row<T>[] = [];
    const pushDoc = (d: T, depth: number, keyPrefix: string) => {
      const id = getId(d);
      const kids = children.get(id) ?? [];
      const key = keyPrefix + id;
      const isCollapsed = collapsed.has(key);
      out.push({ kind: "doc", key, id, doc: d, depth, hasChildren: kids.length > 0, collapsed: isCollapsed });
      if (!isCollapsed) for (const k of kids) pushDoc(k, depth + 1, keyPrefix);
    };

    if (!categorize) {
      for (const d of roots) pushDoc(d, 0, "");
      return out;
    }

    // Category tree (two levels via "\\").
    interface Node {
      label: string;
      path: string;
      docs: T[];
      subs: Map<string, Node>;
    }
    const top = new Map<string, Node>();
    for (const d of roots) {
      const raw = categorize(d);
      const labels = (Array.isArray(raw) ? raw : [raw]).map((l) => l || "(Not Categorized)");
      for (const label of new Set(labels)) {
        const [a, b] = label.split("\\");
        let node = top.get(a);
        if (!node) top.set(a, (node = { label: a, path: a, docs: [], subs: new Map() }));
        if (b) {
          let sub = node.subs.get(b);
          if (!sub) node.subs.set(b, (sub = { label: b, path: `${a}\\${b}`, docs: [], subs: new Map() }));
          sub.docs.push(d);
        } else node.docs.push(d);
      }
    }
    const order = props.categoryOrder ?? ((x: string, y: string) => cmp(x, y));
    const count = (n: Node): number => n.docs.length + [...n.subs.values()].reduce((s, x) => s + count(x), 0);
    const emit = (n: Node, depth: number) => {
      const key = "cat:" + n.path;
      const isCollapsed = collapsed.has(key);
      out.push({ kind: "cat", key, label: n.label, depth, count: count(n), collapsed: isCollapsed });
      if (isCollapsed) return;
      for (const s of [...n.subs.values()].sort((x, y) => order(x.label, y.label))) emit(s, depth + 1);
      for (const d of n.docs) pushDoc(d, depth + 1, n.path + "|");
    };
    for (const n of [...top.values()].sort((x, y) => order(x.label, y.label))) emit(n, 0);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, columns, sort?.col, sort?.dir, collapsed, categorize, parentOf, getId, props.categoryOrder]);

  let caretIndex = rows.findIndex((r) => r.key === caret || (r.kind === "doc" && r.id === caret));
  // The current document moved to another category (Mark Complete, Categorize):
  // follow it by its id, the part of the row key after the last "|".
  if (caretIndex < 0 && caret?.includes("|")) {
    const id = caret.slice(caret.lastIndexOf("|") + 1);
    caretIndex = rows.findIndex((r) => r.kind === "doc" && r.id === id);
  }
  const caretRow = caretIndex >= 0 ? rows[caretIndex] : null;
  const docRows = rows.filter((r): r is Extract<Row<T>, { kind: "doc" }> => r.kind === "doc");

  const moveTo = (i: number) => {
    if (!rows.length) return;
    const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
    onCaret(r.key, r.kind === "doc" ? r.doc : null);
  };

  const toggleKey = (key: string, open?: boolean) => {
    const next = new Set(collapsed);
    const isOpen = !next.has(key);
    const want = open ?? !isOpen;
    if (want) next.delete(key);
    else next.add(key);
    setCollapsed(next);
  };

  const allCollapsibleKeys = () => rows.filter((r) => r.kind === "cat" || r.hasChildren).map((r) => r.key);

  const toggleCheck = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChecked(next);
  };

  const selection = () =>
    checked.size ? [...checked] : caretRow && caretRow.kind === "doc" ? [caretRow.id] : [];

  // A Notes view always has a current document: it opens with the selection
  // bar on the first one, and moves there when the current one leaves the
  // view (deleted, filed, or another folder chosen).
  useEffect(() => {
    if (caretRow) {
      // Found by id under a new category: tell the owner its new row key.
      if (caret !== caretRow.key && !(caretRow.kind === "doc" && caret === caretRow.id))
        onCaret(caretRow.key, caretRow.kind === "doc" ? caretRow.doc : null);
      return;
    }
    if (!docRows.length || props.noAutoSelect) return;
    onCaret(docRows[0].key, docRows[0].doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caretRow, docRows.length, caret]);

  // Scroll the current row into view.
  useEffect(() => {
    if (!caret || !bodyRef.current) return;
    const key = caretRow?.key ?? caret;
    const sel = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(key) : key.replace(/["\\]/g, "\\$&");
    const el = bodyRef.current.querySelector<HTMLElement>(`[data-rowkey="${sel}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [caret, caretRow?.key]);

  // Take focus when this window comes to the front.
  useEffect(() => {
    if (!props.autoFocus || !active) return;
    const ae = document.activeElement;
    if (!ae || ae === document.body || !(ae as HTMLElement).closest?.(".notes-window")) {
      bodyRef.current?.focus({ preventScroll: true });
    }
  }, [active, props.autoFocus]);

  useTabCommands("view:" + viewKey, {
    expandAll: () => setCollapsed(new Set()),
    collapseAll: () => setCollapsed(new Set(allCollapsibleKeys().concat(rows.filter((r) => r.kind === "cat").map((r) => r.key)))),
    selectAll: () => onChecked(new Set(docRows.map((r) => r.id))),
    deselectAll: () => onChecked(new Set()),
  });

  const quickSearch = async (initial: string) => {
    const sortCol = columns.find((c) => c.id === sort?.col) ?? columns.find((c) => c.flex) ?? columns[0];
    const textOf = (d: T) => String(sortCol.text?.(d) ?? sortCol.sortValue?.(d) ?? "");
    const q = await openDialog<string | null>((close) => <QuickSearch initial={initial} close={close} />);
    if (!q) return;
    const needle = q.toLowerCase();
    const hit = docRows.find((r) => textOf(r.doc).toLowerCase().startsWith(needle));
    if (hit) onCaret(hit.key, hit.doc);
    else useUI.getState().setStatus(`No document starts with "${q}".`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented) return;
    // Alt combinations belong to the menus (Alt+Enter is Document Properties).
    if (e.altKey) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const i = caretIndex;
    switch (e.key) {
      case "ArrowDown":
        moveTo(i < 0 ? 0 : i + 1);
        break;
      case "ArrowUp":
        moveTo(i < 0 ? 0 : i - 1);
        break;
      case "Home":
        moveTo(0);
        break;
      case "End":
        moveTo(rows.length - 1);
        break;
      case "PageDown":
        moveTo(i + 12);
        break;
      case "PageUp":
        moveTo(i - 12);
        break;
      case "ArrowRight":
        if (caretRow && (caretRow.kind === "cat" || caretRow.hasChildren) && caretRow.collapsed) toggleKey(caretRow.key, true);
        else moveTo(i + 1);
        break;
      case "ArrowLeft":
        if (caretRow && (caretRow.kind === "cat" || caretRow.hasChildren) && !caretRow.collapsed) toggleKey(caretRow.key, false);
        else if (caretRow) {
          // Jump to the enclosing category / parent.
          for (let j = i - 1; j >= 0; j--) if (rows[j].depth < caretRow.depth) return moveTo(j);
        }
        break;
      case "+":
      case "=":
        if (caretRow && (caretRow.kind === "cat" || caretRow.hasChildren)) toggleKey(caretRow.key, true);
        break;
      case "-":
      case "_":
        if (caretRow && (caretRow.kind === "cat" || caretRow.hasChildren)) toggleKey(caretRow.key, false);
        break;
      case "*":
        setCollapsed(new Set());
        break;
      case "Enter":
        if (caretRow?.kind === "doc") onOpen(caretRow.doc);
        else if (caretRow) toggleKey(caretRow.key);
        break;
      case " ":
        if (caretRow?.kind === "doc") toggleCheck(caretRow.id);
        break;
      case "Insert":
        if (caretRow?.kind === "doc") props.onToggleUnread?.(caretRow.doc);
        break;
      case "Delete":
        if (props.onDelete && selection().length) props.onDelete(selection());
        break;
      case "F9":
        // Without its own refresh, let View > Refresh (the window's) handle it.
        if (!props.onRefresh) return;
        props.onRefresh();
        break;
      default:
        if (ctrl && e.key.toLowerCase() === "a") {
          onChecked(new Set(docRows.map((r) => r.id)));
          break;
        }
        if (!ctrl && !e.altKey && e.key.length === 1 && /\S/.test(e.key)) {
          e.preventDefault();
          void quickSearch(e.key);
          return;
        }
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  // ---- columns & widths ---------------------------------------------------
  const colWidth = (c: ViewColumn<T>) => (c.icon ? ICON_W : widths[c.id] ?? c.width ?? 110);
  const fixedTotal = columns.reduce((s, c) => s + (c.flex ? 0 : colWidth(c)), 0) + (props.noMargin ? 0 : MARGIN_W);
  const flexMin = columns.reduce((s, c) => s + (c.flex ? c.minWidth ?? 140 : 0), 0);
  const minRowWidth = fixedTotal + flexMin;

  const startResize = (c: ViewColumn<T>, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidth(c);
    let current = { ...widths };
    const move = (ev: MouseEvent) => {
      current = { ...current, [c.id]: Math.max(36, startW + ev.clientX - startX) };
      setDragWidths(current);
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      setViewPrefs(viewKey, { widths: current });
      setDragWidths(null);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  const clickHeader = (c: ViewColumn<T>) => {
    if (!c.sortable) return;
    const dir: 1 | -1 = sort?.col === c.id ? (sort.dir === 1 ? -1 : 1) : c.id === props.defaultSort?.col ? props.defaultSort.dir : 1;
    setViewPrefs(viewKey, { sort: { col: c.id, dir } });
  };

  const cellStyle = (c: ViewColumn<T>): React.CSSProperties =>
    c.flex ? { flex: `1 0 ${c.minWidth ?? 140}px` } : { flex: `0 0 ${colWidth(c)}px` };

  const lastShift = useRef<number>(-1);

  return (
    <div
      className="nview"
      ref={bodyRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget) props.onContextMenu?.(e, null);
      }}
      data-tab={tab.id}
    >
      <div className="nview-inner" style={{ minWidth: minRowWidth }}>
        <div className="nview-head">
          {!props.noMargin && <div className="nview-margin-head" style={{ flex: `0 0 ${MARGIN_W}px` }} />}
          {columns.map((c) => (
            <div
              key={c.id}
              className={
                "nview-hcell" +
                (c.sortable ? " sortable" : "") +
                (sort?.col === c.id ? " sorted" : "") +
                (c.align ? " al-" + c.align : c.icon ? " al-center" : "")
              }
              style={cellStyle(c)}
              title={c.sortable ? `Click to sort by ${c.title || c.id}` : c.title}
              onClick={() => clickHeader(c)}
            >
              {c.headerIcon ? <Icon name={c.headerIcon} /> : <span className="nview-htext">{c.title}</span>}
              {c.sortable && (
                <span className={"nview-sort" + (sort?.col === c.id ? " on" : "")}>
                  {sort?.col === c.id ? (sort.dir === 1 ? "▲" : "▼") : "▵"}
                </span>
              )}
              {!c.icon && !c.flex && <span className="nview-resize" onMouseDown={(e) => startResize(c, e)} />}
            </div>
          ))}
        </div>

        <div className="nview-body">
          {rows.length === 0 && <div className="view-empty">{props.emptyText ?? "No documents found"}</div>}
          {rows.map((r, idx) => {
            const isCaret = idx === caretIndex;
            if (r.kind === "cat") {
              return (
                <div
                  key={r.key}
                  data-rowkey={r.key}
                  className={"nview-row nview-cat" + (isCaret ? " caret" : "")}
                  onMouseDown={() => onCaret(r.key, null)}
                  onDoubleClick={() => toggleKey(r.key)}
                >
                  {!props.noMargin && <div className="nview-margin" style={{ flex: `0 0 ${MARGIN_W}px` }} />}
                  <div className="nview-catcell" style={{ paddingLeft: 4 + r.depth * 16 }}>
                    <span
                      className="nview-twistie"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        onCaret(r.key, null);
                        toggleKey(r.key);
                      }}
                    >
                      <Icon name={r.collapsed ? "twistie-right" : "twistie-down"} />
                    </span>
                    <span className="nview-catlabel">{r.label}</span>
                    <span className="nview-catcount">({r.count})</span>
                  </div>
                </div>
              );
            }
            const d = r.doc;
            const selected = isCaret;
            const isChecked = checked.has(r.id);
            const isMarked = marked?.has(r.id) ?? false;
            const unread = isUnread?.(d) ?? false;
            return (
              <div
                key={r.key}
                data-rowkey={r.key}
                className={
                  "nview-row" +
                  (selected ? " caret" : "") +
                  (isChecked ? " checked" : "") +
                  (unread ? " unread" : "") +
                  (isMarked ? " marked" : "") +
                  (props.rowClass?.(d) ? " " + props.rowClass(d) : "")
                }
                draggable={!!props.onDragStart}
                onDragStart={props.onDragStart ? (e) => props.onDragStart!(e, d) : undefined}
                onMouseDown={(e) => {
                  if (e.button === 2) {
                    if (!isChecked) onCaret(r.key, d);
                    return;
                  }
                  if (e.shiftKey && caretIndex >= 0) {
                    const [a, b] = [Math.min(caretIndex, idx), Math.max(caretIndex, idx)];
                    const next = new Set(checked);
                    for (let j = a; j <= b; j++) {
                      const rr = rows[j];
                      if (rr.kind === "doc") next.add(rr.id);
                    }
                    onChecked(next);
                    lastShift.current = idx;
                    return;
                  }
                  if (e.ctrlKey || e.metaKey) {
                    toggleCheck(r.id);
                    return;
                  }
                  onCaret(r.key, d);
                }}
                onDoubleClick={() => onOpen(d)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  props.onContextMenu?.(e, d);
                }}
              >
                {!props.noMargin && (
                  <div
                    className="nview-margin"
                    style={{ flex: `0 0 ${MARGIN_W}px` }}
                    title="Click to select"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      toggleCheck(r.id);
                    }}
                  >
                    <span className="nview-mark">
                      {isMarked ? <Icon name="trash" /> : isChecked ? <Icon name="check" /> : null}
                    </span>
                    <span className="nview-star">{unread ? <Icon name="unread-star" /> : null}</span>
                  </div>
                )}
                {columns.map((c) => (
                  <div
                    key={c.id}
                    className={"nview-cell" + (c.align ? " al-" + c.align : c.icon ? " al-center" : "")}
                    style={cellStyle(c)}
                  >
                    {c.indent && r.depth > 0 && <span className="nview-indent" style={{ width: r.depth * 16 }} />}
                    {c.indent && (
                      <span
                        className={"nview-twistie" + (r.hasChildren ? "" : " leaf")}
                        onMouseDown={(e) => {
                          if (!r.hasChildren) return;
                          e.stopPropagation();
                          toggleKey(r.key);
                        }}
                      >
                        {r.hasChildren ? <Icon name={r.collapsed ? "twistie-right" : "twistie-down"} /> : null}
                      </span>
                    )}
                    {c.render(d, { selected, depth: r.depth })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QuickSearch({ initial, close }: { initial: string; close: (v: string | null) => void }) {
  const [q, setQ] = useState(initial);
  return (
    <NotesDialog
      title="Quick Search"
      onClose={() => close(null)}
      width={320}
      footer={
        <>
          <button className="btn primary" onClick={() => close(q)}>
            OK
          </button>
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
        </>
      }
    >
      <label className="prompt-label">
        Find the first document that starts with:
        <input
          type="text"
          className="prompt-input"
          value={q}
          data-autofocus
          onChange={(e) => setQ(e.target.value)}
          onFocus={(e) => {
            const len = e.target.value.length;
            e.target.setSelectionRange(len, len);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              close(q);
            }
          }}
        />
      </label>
    </NotesDialog>
  );
}
