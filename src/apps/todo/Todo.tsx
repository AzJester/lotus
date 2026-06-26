// ============================================================================
// To Do — the Task database. Three-pane client (view navigator · task list ·
// detail form) modeled after the Mail reference module. Reads and writes the
// shared store, composes the shared UI primitives, and reuses the shared layout
// classes (.app, .action-bar, .app-cols, .nav-pane, .list-pane, .preview-pane).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useNotes, uid } from "../../data/store";
import { useUI } from "../../data/ui";
import type { Priority, TaskStatus, TodoTask } from "../../data/types";
import {
  ActionBar,
  ActionButton,
  ActionSep,
  ActionSpacer,
  Dialog,
  FieldRow,
} from "../../components/ui";
import { fmtListDate, fmtDateLong, toDateInput, startOfDay } from "../../lib/format";
import "../../styles/todo.css";

// A view is either a grouping mode or a quick filter.
type NavKey =
  | "all"
  | "by-category"
  | "by-status"
  | "by-due"
  | "completed"
  | "overdue"
  | "high";

const VIEWS: { key: NavKey; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "🗂️" },
  { key: "by-category", label: "By Category", icon: "🏷️" },
  { key: "by-status", label: "By Status", icon: "📊" },
  { key: "by-due", label: "By Due Date", icon: "📅" },
  { key: "completed", label: "Completed", icon: "✅" },
];

const FILTERS: { key: NavKey; label: string; icon: string }[] = [
  { key: "overdue", label: "Overdue", icon: "⏰" },
  { key: "high", label: "High Priority", icon: "❗" },
];

const STATUS_LABEL: Record<TaskStatus, string> = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  complete: "Complete",
  deferred: "Deferred",
};

const STATUS_ORDER: TaskStatus[] = ["not-started", "in-progress", "deferred", "complete"];
const PRIO_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

// A draft used by both the New dialog and the detail editor.
interface Draft {
  subject: string;
  description: string;
  start: string; // date-input value or ""
  due: string; // date-input value or ""
  priority: Priority;
  status: TaskStatus;
  category: string;
}

function emptyDraft(): Draft {
  return {
    subject: "",
    description: "",
    start: "",
    due: "",
    priority: "normal",
    status: "not-started",
    category: "",
  };
}

function draftFromTask(t: TodoTask): Draft {
  return {
    subject: t.subject,
    description: t.description,
    start: t.start != null ? toDateInput(t.start) : "",
    due: t.due != null ? toDateInput(t.due) : "",
    priority: t.priority,
    status: t.status,
    category: t.category,
  };
}

// Build a stored task from a draft, computing completedDate from status.
function taskFromDraft(id: string, d: Draft, prevCompleted: number | null): TodoTask {
  const complete = d.status === "complete";
  return {
    id,
    subject: d.subject.trim(),
    description: d.description,
    start: dateToMs(d.start),
    due: dateToMs(d.due),
    priority: d.priority,
    status: d.status,
    category: d.category.trim(),
    completedDate: complete ? prevCompleted ?? Date.now() : null,
  };
}

// Convert a date-input value ("yyyy-mm-dd" or "") to start-of-day ms or null.
function dateToMs(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

// A due bucket relative to "now" for the By Due Date grouping.
function dueBucket(due: number | null, now: number): string {
  if (due == null) return "No Date";
  const today = startOfDay(now);
  const day = 86400000;
  if (due < today) return "Overdue";
  if (due < today + day) return "Today";
  if (due < today + 7 * day) return "This Week";
  return "Later";
}

const DUE_BUCKET_ORDER = ["Overdue", "Today", "This Week", "Later", "No Date"];

export default function Todo() {
  const { todos, addTodo, updateTodo, deleteTodo } = useNotes();
  const setStatus = useUI((s) => s.setStatus);
  const pendingTodo = useUI((s) => s.pendingTodo);
  const clearPendingTodo = useUI((s) => s.clearPendingTodo);

  const [nav, setNav] = useState<NavKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<Draft | null>(null);
  // The detail editor mirrors the selected task; null until a row is chosen.
  const [edit, setEdit] = useState<Draft | null>(null);

  // Capture "now" once per mount so the memoized views are stable and the
  // overdue boundary doesn't drift mid-render.
  const [now] = useState(() => Date.now());
  const todayStart = startOfDay(now);
  const selected = todos.find((t) => t.id === selectedId) ?? null;

  // Honour a "Copy Into New" handover from another module (e.g. a Mail memo):
  // open the New To Do dialog prefilled with the subject + description. Mirrors
  // how Mail consumes pendingMemo.
  useEffect(() => {
    if (pendingTodo) {
      setCreating({
        ...emptyDraft(),
        subject: pendingTodo.subject,
        description: pendingTodo.description,
      });
      clearPendingTodo();
    }
  }, [pendingTodo, clearPendingTodo]);

  // --- filtered + sorted list for the current view ------------------------
  const visible = useMemo(() => {
    let list = todos;
    if (nav === "completed") list = list.filter((t) => t.status === "complete");
    else if (nav === "overdue")
      list = list.filter((t) => t.due != null && t.due < todayStart && t.status !== "complete");
    else if (nav === "high") list = list.filter((t) => t.priority === "high");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q),
      );
    }
    // Default sort: incomplete first, then priority, then due date, then subject.
    return [...list].sort((a, b) => {
      const ac = a.status === "complete" ? 1 : 0;
      const bc = b.status === "complete" ? 1 : 0;
      if (ac !== bc) return ac - bc;
      if (PRIO_RANK[a.priority] !== PRIO_RANK[b.priority])
        return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
      const ad = a.due ?? Infinity;
      const bd = b.due ?? Infinity;
      if (ad !== bd) return ad - bd;
      return a.subject.localeCompare(b.subject);
    });
  }, [todos, nav, search, now]);

  // --- group the visible list when a "By ..." view is active --------------
  const grouped = useMemo(() => {
    if (nav === "by-category") {
      const map = new Map<string, TodoTask[]>();
      for (const t of visible) {
        const key = t.category.trim() || "(None)";
        const arr = map.get(key) ?? [];
        arr.push(t);
        map.set(key, arr);
      }
      return [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, items]) => ({ label, items }));
    }
    if (nav === "by-status") {
      const map = new Map<TaskStatus, TodoTask[]>();
      for (const t of visible) {
        const arr = map.get(t.status) ?? [];
        arr.push(t);
        map.set(t.status, arr);
      }
      return STATUS_ORDER.filter((s) => map.has(s)).map((s) => ({
        label: STATUS_LABEL[s],
        items: map.get(s)!,
      }));
    }
    if (nav === "by-due") {
      const map = new Map<string, TodoTask[]>();
      for (const t of visible) {
        const key = dueBucket(t.due, now);
        const arr = map.get(key) ?? [];
        arr.push(t);
        map.set(key, arr);
      }
      return DUE_BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({
        label: b,
        items: map.get(b)!,
      }));
    }
    return null; // flat view
  }, [visible, nav, now]);

  // --- selection ----------------------------------------------------------
  function selectTask(t: TodoTask) {
    setSelectedId(t.id);
    setEdit(draftFromTask(t));
  }

  // --- checkbox toggle (complete <-> not-started) -------------------------
  function toggleDone(t: TodoTask) {
    const done = t.status === "complete";
    updateTodo(t.id, {
      status: done ? "not-started" : "complete",
      completedDate: done ? null : Date.now(),
    });
    if (selectedId === t.id) {
      setEdit((d) => (d ? { ...d, status: done ? "not-started" : "complete" } : d));
    }
    setStatus(done ? `Marked "${t.subject}" incomplete.` : `Completed "${t.subject}".`);
  }

  // --- action bar: mark complete / incomplete toggle ----------------------
  function toggleSelectedDone() {
    if (selected) toggleDone(selected);
  }

  // --- delete -------------------------------------------------------------
  function del() {
    if (!selected) return;
    deleteTodo(selected.id);
    setStatus(`Deleted "${selected.subject}".`);
    setSelectedId(null);
    setEdit(null);
  }

  // --- new ----------------------------------------------------------------
  function newTodo() {
    setCreating(emptyDraft());
  }
  function createFromDraft(d: Draft) {
    if (!d.subject.trim()) {
      setStatus("Please enter a subject for the task.");
      return;
    }
    const task = taskFromDraft(uid(), d, null);
    addTodo(task);
    setStatus(`Created task "${task.subject}".`);
    setCreating(null);
    setSelectedId(task.id);
    setEdit(draftFromTask(task));
  }

  // --- save edits from the detail form ------------------------------------
  function saveEdit() {
    if (!selected || !edit) return;
    if (!edit.subject.trim()) {
      setStatus("Please enter a subject for the task.");
      return;
    }
    // Preserve the existing completedDate only if it stays complete; otherwise
    // taskFromDraft will assign a fresh stamp (newly complete) or null.
    const keep = selected.status === "complete" ? selected.completedDate : null;
    const updated = taskFromDraft(selected.id, edit, keep);
    updateTodo(selected.id, {
      subject: updated.subject,
      description: updated.description,
      start: updated.start,
      due: updated.due,
      priority: updated.priority,
      status: updated.status,
      category: updated.category,
      completedDate: updated.completedDate,
    });
    setStatus(`Saved "${updated.subject}".`);
  }

  const selectedDone = selected?.status === "complete";

  // --- render -------------------------------------------------------------
  return (
    <div className="app todo-app">
      <ActionBar>
        <ActionButton icon="🗒️" label="New To Do" onClick={newTodo} />
        <ActionSep />
        <ActionButton
          icon={selectedDone ? "↩️" : "✔️"}
          label={selectedDone ? "Mark Incomplete" : "Mark Complete"}
          onClick={toggleSelectedDone}
          disabled={!selected}
        />
        <ActionButton icon="🗑️" label="Delete" onClick={del} disabled={!selected} />
        <ActionSpacer />
        <div className="action-search">
          <input
            type="search"
            placeholder="Search To Do…"
            className="bevel-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </ActionBar>

      <div className="app-cols">
        {/* Navigator */}
        <div className="nav-pane">
          <div className="nav-title">To Do</div>
          <div className="nav-group">
            {VIEWS.map((v) => {
              const count = navCount(todos, v.key, now);
              return (
                <div
                  key={v.key}
                  className={"nav-item" + (nav === v.key ? " active" : "")}
                  onClick={() => setNav(v.key)}
                >
                  <span className="nav-ic">{v.icon}</span>
                  <span className="nav-label">{v.label}</span>
                  {count > 0 && <span className="nav-count">{count}</span>}
                </div>
              );
            })}
          </div>
          <div className="nav-title todo-nav-sub">Quick Filters</div>
          <div className="nav-group">
            {FILTERS.map((v) => {
              const count = navCount(todos, v.key, now);
              return (
                <div
                  key={v.key}
                  className={"nav-item" + (nav === v.key ? " active" : "")}
                  onClick={() => setNav(v.key)}
                >
                  <span className="nav-ic">{v.icon}</span>
                  <span className="nav-label">{v.label}</span>
                  {count > 0 && <span className="nav-count">{count}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Task list */}
        <div className="list-pane todo-list">
          <div className="view">
            <div className="view-head">
              <div className="col col-c" style={{ flex: "0 0 26px" }} title="Complete">
                ✓
              </div>
              <div className="col col-c" style={{ flex: "0 0 24px" }} title="Priority">
                !
              </div>
              <div className="col" style={{ flex: 1 }}>
                Subject
              </div>
              <div className="col" style={{ flex: "0 0 110px" }}>
                Category
              </div>
              <div className="col" style={{ flex: "0 0 90px" }}>
                Due
              </div>
              <div className="col" style={{ flex: "0 0 96px" }}>
                Status
              </div>
            </div>
            <div className="view-body">
              {visible.length === 0 && (
                <div className="view-empty">No tasks in this view.</div>
              )}
              {grouped
                ? grouped.map((g) => (
                    <div key={g.label}>
                      <div className="todo-group">
                        <span className="todo-group-label">{g.label}</span>
                        <span className="todo-group-count">{g.items.length}</span>
                      </div>
                      {g.items.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          selected={t.id === selectedId}
                          now={now}
                          onSelect={() => selectTask(t)}
                          onToggle={() => toggleDone(t)}
                        />
                      ))}
                    </div>
                  ))
                : visible.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      selected={t.id === selectedId}
                      now={now}
                      onSelect={() => selectTask(t)}
                      onToggle={() => toggleDone(t)}
                    />
                  ))}
            </div>
          </div>
        </div>

        {/* Detail / edit pane */}
        <div className="preview-pane">
          {selected && edit ? (
            <TaskForm
              task={selected}
              draft={edit}
              setDraft={setEdit}
              onSave={saveEdit}
              onDelete={del}
            />
          ) : (
            <div className="preview-empty">Select a task to view or edit it.</div>
          )}
        </div>
      </div>

      {creating && (
        <NewTodoDialog
          draft={creating}
          setDraft={setCreating}
          onCreate={() => createFromDraft(creating)}
          onCancel={() => setCreating(null)}
        />
      )}
    </div>
  );
}

// Count helper for navigator badges.
function navCount(todos: TodoTask[], key: NavKey, now: number): number {
  switch (key) {
    case "all":
      return todos.length;
    case "completed":
      return todos.filter((t) => t.status === "complete").length;
    case "overdue":
      return todos.filter(
        (t) => t.due != null && t.due < startOfDay(now) && t.status !== "complete",
      ).length;
    case "high":
      return todos.filter((t) => t.priority === "high" && t.status !== "complete").length;
    default:
      return 0;
  }
}

// --- One task row -----------------------------------------------------------
function TaskRow({
  task,
  selected,
  now,
  onSelect,
  onToggle,
}: {
  task: TodoTask;
  selected: boolean;
  now: number;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const done = task.status === "complete";
  const overdue = task.due != null && task.due < now && !done;
  return (
    <div
      className={"view-row todo-row" + (selected ? " selected" : "") + (done ? " todo-done" : "")}
      onClick={onSelect}
      onDoubleClick={onSelect}
    >
      <div className="col col-c" style={{ flex: "0 0 26px" }}>
        <input
          type="checkbox"
          checked={done}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggle}
        />
      </div>
      <div className="col col-c" style={{ flex: "0 0 24px" }}>
        {task.priority === "high" ? <span className="prio-high">❗</span> : ""}
      </div>
      <div className="col todo-subject" style={{ flex: 1 }}>
        {task.subject}
      </div>
      <div className="col" style={{ flex: "0 0 110px" }}>
        {task.category ? (
          <span className="tag">{task.category}</span>
        ) : (
          <span className="muted">—</span>
        )}
      </div>
      <div
        className={"col" + (overdue && !selected ? " prio-high" : "")}
        style={{ flex: "0 0 90px" }}
      >
        {task.due != null ? fmtListDate(task.due) : <span className="muted">—</span>}
      </div>
      <div className="col" style={{ flex: "0 0 96px" }}>
        {STATUS_LABEL[task.status]}
      </div>
    </div>
  );
}

// --- Detail / edit form (right pane) ----------------------------------------
function TaskForm({
  task,
  draft,
  setDraft,
  onSave,
  onDelete,
}: {
  task: TodoTask;
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  return (
    <div className="form todo-form">
      <div className="form-header">
        <div className="form-title">
          {draft.priority === "high" && <span className="prio-high">❗ </span>}
          {draft.subject || "(Untitled task)"}
        </div>
        {task.status === "complete" && task.completedDate != null && (
          <div className="muted todo-completed-line">
            Completed {fmtDateLong(task.completedDate)}
          </div>
        )}
      </div>
      <DraftFields draft={draft} set={set} />
      <div className="todo-form-foot">
        <button className="btn primary" onClick={onSave}>
          💾 Save
        </button>
        <button className="btn" onClick={onDelete}>
          🗑️ Delete
        </button>
      </div>
    </div>
  );
}

// --- New To Do dialog (shared Dialog) ---------------------------------------
function NewTodoDialog({
  draft,
  setDraft,
  onCreate,
  onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  return (
    <Dialog
      title="New To Do"
      onClose={onCancel}
      width={460}
      footer={
        <>
          <button className="btn primary" onClick={onCreate}>
            OK
          </button>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        </>
      }
    >
      <DraftFields draft={draft} set={set} autoFocus />
    </Dialog>
  );
}

// --- Shared editable field block (used by detail form + dialog) -------------
function DraftFields({
  draft,
  set,
  autoFocus,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="todo-fields">
      <FieldRow label="Subject">
        <input
          type="text"
          value={draft.subject}
          autoFocus={autoFocus}
          onChange={(e) => set({ subject: e.target.value })}
        />
      </FieldRow>
      <FieldRow label="Priority">
        <select
          value={draft.priority}
          onChange={(e) => set({ priority: e.target.value as Priority })}
        >
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </FieldRow>
      <FieldRow label="Status">
        <select
          value={draft.status}
          onChange={(e) => set({ status: e.target.value as TaskStatus })}
        >
          <option value="not-started">Not Started</option>
          <option value="in-progress">In Progress</option>
          <option value="complete">Complete</option>
          <option value="deferred">Deferred</option>
        </select>
      </FieldRow>
      <FieldRow label="Start">
        <input
          type="date"
          value={draft.start}
          onChange={(e) => set({ start: e.target.value })}
        />
      </FieldRow>
      <FieldRow label="Due">
        <input type="date" value={draft.due} onChange={(e) => set({ due: e.target.value })} />
      </FieldRow>
      <FieldRow label="Category">
        <input
          type="text"
          value={draft.category}
          placeholder="e.g. Work, Personal"
          onChange={(e) => set({ category: e.target.value })}
        />
      </FieldRow>
      <FieldRow label="Description">
        <textarea
          className="todo-desc"
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Notes about this task…"
        />
      </FieldRow>
    </div>
  );
}
