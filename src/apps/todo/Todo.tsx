// ============================================================================
// To Do: the To Do views of the mail file, after the Notes 6 and 7 mail
// template. The navigator switches between By Due Date (Overdue, Today,
// Tomorrow, This Week, Next Week, Later, No Due Date), By Category, By Status
// (Overdue, Current, Future, Complete) and Complete, with the overdue count
// in red. Overdue To Dos are red, completed ones gray with a check. The
// preview pane shows the selected To Do on its form in read mode.
//
// Mark Complete stamps the completion date. Delete marks documents with the
// trash can, and F9 or leaving the view asks to delete them; the store writes
// deletion stubs so replication of the mail file carries the deletes.
//
// Each To Do opens in its own window on the To Do form (TodoDocument): read
// mode shows a status line ("Overdue by 2 days"); Edit, Save and Save & Close
// work through useDocWindow, which asks to save changes on close.
// ============================================================================

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ActionBar } from "../../components/ActionBar";
import type { ActionItem } from "../../components/ActionBar";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { NotesView } from "../../components/NotesView";
import type { ViewColumn } from "../../components/NotesView";
import { notesAsk } from "../../components/dialogs";
import { openContextMenu } from "../../components/menu";
import type { MenuItem } from "../../components/menu";
import { Splitter } from "../../components/Splitter";
import { useTab, useTabCommands } from "../../components/tabs";
import { ChoiceRow, DocMissing, FieldRow, FieldTable, FormPage, useDocWindow } from "../../components/docform";
import { docLinkHtml } from "../../components/RichText";
import { isOnline, useNotes } from "../../data/store";
import { registerCloseGuard, useUI } from "../../data/ui";
import type { TodoTask } from "../../data/types";
import { MAIL_SERVER } from "../../data/directory";
import { fmtDate, startOfDay, toDateInput } from "../../lib/format";
import { textToHtml } from "../../lib/sanitize";
import { openDocumentProperties } from "../../shell/dialogs/Properties";
import { DRAG_DOC } from "../../shell/BookmarkBar";
import {
  NOT_CATEGORIZED,
  PRIORITY_OPTIONS,
  PRIORITY_RANK,
  STATUS_BUCKETS,
  STATUS_OPTIONS,
  allCategories,
  blankTask,
  categoriesOf,
  categoryLabels,
  categoryOrder,
  checkTask,
  compareTasks,
  completionPatch,
  dueBucket,
  dueBucketOrder,
  formFields,
  fromDateInput,
  isComplete,
  isOverdue,
  nextMidnight,
  normalizeTask,
  priorityLabel,
  statusBucket,
  statusBucketOrder,
  statusLine,
  validateTask,
} from "./todoHelpers";
import type { StatusTone } from "./todoHelpers";
import "../../styles/todo.css";

const ui = () => useUI.getState();
const notes = () => useNotes.getState();
const countDocs = (n: number) => `${n} document${n === 1 ? "" : "s"}`;

/** The start of today. Re-renders just after midnight so the date categories move on. */
function useToday(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setTick((n) => n + 1), nextMidnight(Date.now()) - Date.now() + 1000);
    return () => window.clearTimeout(t);
  }, [tick]);
  return startOfDay(Date.now());
}

// ---------------------------------------------------------------------------
// Actions shared by the view, the preview pane and To Do windows
// ---------------------------------------------------------------------------

/** To Dos whose window should open straight into edit mode (see openTodo). */
const editOnOpen = new Set<string>();
const EDIT_EVENT = "lotus:todo-edit";

/** Open a To Do in its own window (in edit mode when asked). */
function openTodo(t: TodoTask, edit = false) {
  if (edit) editOnOpen.add(t.id);
  ui().openDocument({ coll: "todos", id: t.id }, { title: t.subject || "(Untitled)" });
  // A window that is already open picks the request up from the event.
  if (edit) window.dispatchEvent(new Event(EDIT_EVENT));
}

function newTodo(init: Record<string, unknown> = {}) {
  ui().newDocument("todos", init, { title: "New To Do" });
}

/** Mark To Dos complete (stamping the date) or incomplete. */
function markTodos(ids: string[], done: boolean) {
  const s = notes();
  const now = Date.now();
  let n = 0;
  for (const id of ids) {
    const t = s.todos.find((x) => x.id === id);
    if (!t || isComplete(t) === done) continue;
    s.updateTodo(id, completionPatch(done, now));
    n++;
  }
  ui().setStatus(`${countDocs(n)} marked ${done ? "complete" : "incomplete"}.`);
}

function copyInto(t: TodoTask, target: "memo" | "calendar") {
  if (target === "calendar") {
    ui().copyToCalendar({ subject: t.subject, description: t.description });
    return;
  }
  ui().newDocument("mail", { to: "", subject: t.subject, bodyHtml: t.description ? textToHtml(t.description) : "" }, { title: "New Memo" });
  ui().setStatus("Copied into a new memo.");
}

function copyIntoAction(t: TodoTask | null): ActionItem {
  return {
    id: "copyinto",
    label: "Copy Into New",
    icon: "copy-into",
    disabled: !t,
    children: [
      { id: "ci-memo", label: "Memo", icon: "new-memo", run: () => t && copyInto(t, "memo") },
      { id: "ci-cal", label: "Calendar Entry", icon: "cal-new", run: () => t && copyInto(t, "calendar") },
    ],
  };
}

/** Edit > Copy as Link > Document Link. */
function copyTodoLink(t: TodoTask) {
  const link = { coll: "todos" as const, id: t.id, title: t.subject };
  ui().setClipboardLink(link);
  try {
    const file = (notes().databases.find((d) => d.id === "mail")?.filePath ?? "mail\\srivera.nsf").replace(/\\/g, "/");
    if (navigator.clipboard && "write" in navigator.clipboard && typeof ClipboardItem !== "undefined") {
      void navigator.clipboard
        .write([
          new ClipboardItem({
            "text/html": new Blob([docLinkHtml(link)], { type: "text/html" }),
            "text/plain": new Blob([`notes://${MAIL_SERVER}/${file}/0/${t.id}`], { type: "text/plain" }),
          }),
        ])
        .catch(() => undefined);
    }
  } catch {
    /* the in-app clipboard still has the link */
  }
  ui().setStatus(`Document link copied: "${t.subject}". Paste it into a memo.`);
}

// ---------------------------------------------------------------------------
// The To Do form (document windows and the preview pane)
// ---------------------------------------------------------------------------

const TONE_ICON: Record<StatusTone, IconName> = {
  overdue: "overdue",
  complete: "complete",
  due: "due-date",
  future: "due-date",
  none: "todo",
};

/** A date field. It keeps what is typed, so a year half typed is not rewritten. */
function DateInput({ field, value, onChange }: { field: string; value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value != null ? toDateInput(value) : "");
  const mine = useRef(value);
  useEffect(() => {
    // Follow changes made elsewhere (a reverted draft), not our own.
    if (value === mine.current) return;
    mine.current = value;
    setText(value != null ? toDateInput(value) : "");
  }, [value]);
  return (
    <input
      type="date"
      className="nf-input todo-date"
      data-field={field}
      value={text}
      onChange={(e) => {
        const next = fromDateInput(e.target.value, value);
        mine.current = next;
        setText(e.target.value);
        onChange(next);
      }}
    />
  );
}

function DateRow({
  label,
  field,
  value,
  editing,
  onChange,
}: {
  label: string;
  field: string;
  value: number | null;
  editing: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <FieldRow label={label} editing={editing} read={value != null ? fmtDate(value) : ""}>
      <DateInput field={field} value={value} onChange={onChange} />
    </FieldRow>
  );
}

/** A keyword field shown as radio buttons (no field brackets, as in Notes). */
function RadioRow<V extends string>({
  label,
  value,
  options,
  editing,
  onChange,
}: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  editing: boolean;
  onChange: (v: V) => void;
}) {
  const name = useId();
  if (!editing) {
    return (
      <FieldRow label={label} editing={false} read={options.find((o) => o.value === value)?.label ?? value}>
        {null}
      </FieldRow>
    );
  }
  return (
    <tr className="frow">
      <th>{label}</th>
      <td>
        <span className="todo-radios" role="radiogroup" aria-label={label}>
          {options.map((o) => (
            <label key={o.value} className="todo-radio">
              <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
              {o.label}
            </label>
          ))}
        </span>
      </td>
    </tr>
  );
}

function TodoForm({
  task,
  editing,
  today,
  set = () => undefined,
  onEdit,
  categories = [],
}: {
  task: TodoTask;
  editing: boolean;
  today: number;
  set?: (patch: Partial<TodoTask>) => void;
  /** Double-click in read mode. */
  onEdit?: () => void;
  /** Suggestions for the Category field. */
  categories?: string[];
}) {
  const listId = useId();
  const line = editing ? null : statusLine(task, today);
  return (
    <FormPage form="To Do" icon="todo" editing={editing} onEdit={onEdit} className="todo-form">
      {line && (
        <div className={"todo-status-line tone-" + line.tone}>
          <Icon name={TONE_ICON[line.tone]} />
          <span>{line.text}</span>
        </div>
      )}
      <FieldTable>
        <FieldRow
          label="Subject"
          editing={editing}
          read={
            <span className="todo-read-subject">
              {task.priority === "high" && <Icon name="importance" title="High priority" />}
              {task.subject || "(Untitled)"}
            </span>
          }
        >
          <input
            type="text"
            className="nf-input"
            data-field="subject"
            value={task.subject}
            autoFocus
            onChange={(e) => set({ subject: e.target.value })}
          />
        </FieldRow>
        <DateRow label="Due date" field="due" value={task.due} editing={editing} onChange={(due) => set({ due })} />
        <DateRow label="Start date" field="start" value={task.start} editing={editing} onChange={(start) => set({ start })} />
        <RadioRow
          label="Priority"
          value={task.priority}
          options={PRIORITY_OPTIONS}
          editing={editing}
          onChange={(priority) => set({ priority })}
        />
        <FieldRow label="Category" editing={editing} read={categoriesOf(task.category).join(", ")}>
          <input
            type="text"
            className="nf-input"
            list={listId}
            value={task.category}
            onChange={(e) => set({ category: e.target.value })}
          />
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </FieldRow>
        <ChoiceRow
          label="Status"
          value={task.status}
          options={STATUS_OPTIONS}
          editing={editing}
          onChange={(status) =>
            set({ status, completedDate: status === "complete" ? task.completedDate ?? Date.now() : null })
          }
        />
        <FieldRow label="Description" wide editing={editing} read={task.description}>
          <textarea
            className="nf-input todo-desc"
            value={task.description}
            rows={8}
            onChange={(e) => set({ description: e.target.value })}
          />
        </FieldRow>
      </FieldTable>
    </FormPage>
  );
}

// ---------------------------------------------------------------------------
// The document window
// ---------------------------------------------------------------------------

export function TodoDocument() {
  const { tab } = useTab();
  const id = tab.doc?.id ?? "";
  const doc = useNotes((s) => (tab.isNew ? undefined : s.todos.find((t) => t.id === id)));
  const todos = useNotes((s) => s.todos);
  const categories = useMemo(() => allCategories(todos), [todos]);
  const today = useToday();

  const w = useDocWindow<TodoTask>({
    coll: "todos",
    doc,
    blank: blankTask,
    title: (d) => d.subject.trim() || (tab.isNew ? "New To Do" : "(Untitled)"),
    validate: validateTask,
    persist: (d, isNew) => {
      const t = normalizeTask(d, Date.now());
      if (isNew) notes().addTodo(t);
      else notes().updateTodo(t.id, formFields(t));
      ui().setStatus(`To Do "${t.subject}" saved.`);
    },
    commands: {
      save: () => void save(false),
      copyAsLink: doc ? () => copyTodoLink(doc) : undefined,
    },
  });

  // A refused save puts the cursor back in the field it complained about.
  const root = useRef<HTMLDivElement>(null);
  const save = async (close: boolean) => {
    if (await w.save()) {
      if (close) w.closeNow();
      return;
    }
    const bad = checkTask(w.draft);
    if (bad) root.current?.querySelector<HTMLElement>(`[data-field="${bad.field}"]`)?.focus();
  };

  // Double-clicking the preview pane opens the window in edit mode.
  const beginEdit = useRef(w.beginEdit);
  beginEdit.current = w.beginEdit;
  useEffect(() => {
    if (tab.isNew) return;
    const take = () => {
      if (editOnOpen.delete(id)) beginEdit.current();
    };
    take();
    window.addEventListener(EDIT_EVENT, take);
    return () => window.removeEventListener(EDIT_EVENT, take);
  }, [id, tab.isNew]);

  if (w.missing) return <DocMissing />;

  const done = isComplete(w.draft);
  const mark = (complete: boolean) => {
    const patch = completionPatch(complete, Date.now());
    if (w.editing) {
      w.set(patch);
      ui().setStatus(`Marked ${complete ? "complete" : "incomplete"}. Save the To Do to keep the change.`);
    } else if (doc) {
      notes().updateTodo(doc.id, patch);
      ui().setStatus(`Marked ${complete ? "complete" : "incomplete"}.`);
    }
  };
  const remove = async () => {
    if (!doc) return;
    if (!(await notesAsk("Do you want to delete this To Do?"))) return;
    w.closeNow();
    notes().deleteTodo(doc.id);
    ui().setStatus("Document deleted.");
  };

  const markAction: ActionItem = done
    ? { id: "incomplete", label: "Mark Incomplete", icon: "incomplete", run: () => mark(false) }
    : { id: "complete", label: "Mark Complete", icon: "complete", run: () => mark(true) };
  const deleteAction: ActionItem = { id: "delete", label: "Delete", icon: "trash", run: () => void remove() };
  const actions: ActionItem[] = w.editing
    ? [
        { id: "saveclose", label: "Save & Close", icon: "save", run: () => void save(true) },
        { id: "save", label: "Save", accel: "Ctrl+S", run: () => void save(false) },
        "sep",
        markAction,
        !w.isNew && "sep",
        !w.isNew && deleteAction,
      ]
    : [
        { id: "edit", label: "Edit", icon: "edit", accel: "Ctrl+E", run: w.beginEdit },
        "sep",
        markAction,
        copyIntoAction(w.draft),
        "sep",
        deleteAction,
      ];

  return (
    <div className="app todo-window" ref={root}>
      <ActionBar actions={actions} />
      <TodoForm
        task={w.draft}
        editing={w.editing}
        today={today}
        set={w.set}
        onEdit={w.beginEdit}
        categories={categories}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

type NavKey = "due" | "category" | "status" | "complete";

const NAV: { key: NavKey; label: string; icon: IconName }[] = [
  { key: "due", label: "By Due Date", icon: "due-date" },
  { key: "category", label: "By Category", icon: "tag" },
  { key: "status", label: "By Status", icon: "by-status" },
  { key: "complete", label: "Complete", icon: "complete" },
];

const getId = (t: TodoTask) => t.id;
const parentOf = (t: TodoTask) => t.conflictOf;

export default function Todo() {
  const { tab } = useTab();
  const todos = useNotes((s) => s.todos);
  const user = useNotes((s) => s.user);
  const setStatus = useUI((s) => s.setStatus);
  const openView = useUI((s) => s.openView);
  const preview = useUI((s) => s.uiPrefs.preview);
  const today = useToday();

  const [nav, setNav] = useState<NavKey>("due");
  const [caret, setCaret] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");

  const inView = useMemo(() => {
    let list = todos;
    if (nav === "due") list = list.filter((t) => !isComplete(t));
    else if (nav === "complete") list = list.filter(isComplete);
    if (applied) {
      const q = applied.toLowerCase();
      list = list.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q),
      );
    }
    return [...list].sort(compareTasks);
  }, [todos, nav, applied]);

  const overdue = useMemo(() => todos.filter((t) => isOverdue(t, today)).length, [todos, today]);
  const selected = inView.find((t) => t.id === selectedId) ?? null;
  const selection = useCallback(
    () => (checked.size ? [...checked] : selected ? [selected.id] : []),
    [checked, selected],
  );

  // ---- deletion marks ------------------------------------------------------
  const markForDeletion = (ids: string[]) => {
    if (!ids.length) return;
    const next = new Set(marked);
    const allMarked = ids.every((id) => next.has(id));
    for (const id of ids) {
      if (allMarked) next.delete(id);
      else next.add(id);
    }
    setMarked(next);
    setChecked(new Set());
    setStatus(allMarked ? "Deletion mark removed." : `${countDocs(ids.length)} marked for deletion. Press F9 to delete.`);
  };

  /** F9 / leaving the view: ask, then delete what is marked. True when something was deleted. */
  const processDeletions = async (): Promise<boolean> => {
    const ids = [...marked].filter((id) => notes().todos.some((t) => t.id === id));
    if (!ids.length) {
      if (marked.size) setMarked(new Set());
      return false;
    }
    const ok = await notesAsk(`Delete ${countDocs(ids.length)} marked for deletion?`, { title: "Delete Documents" });
    setMarked(new Set());
    if (!ok) return false;
    for (const id of ids) notes().deleteTodo(id);
    setStatus(`${countDocs(ids.length)} deleted.`);
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    return true;
  };

  const refresh = () => {
    void processDeletions().then((deleted) => {
      if (!deleted) setStatus("View refreshed.");
    });
  };

  const goNav = async (key: NavKey) => {
    if (key === nav) return;
    await processDeletions();
    setNav(key);
    setCaret(null);
    setSelectedId(null);
    setChecked(new Set());
  };

  // Closing the To Do window with marked documents asks first, too.
  useEffect(() =>
    registerCloseGuard(tab.id, {
      isDirty: () => false,
      confirmClose: async () => {
        await processDeletions();
        return true;
      },
    }),
  );

  const mark = (ids: string[], done: boolean) => {
    markTodos(ids, done);
    setChecked(new Set());
  };

  /** New To Do; in By Category it starts in the category at the current row. */
  const newInView = () => {
    let cat = "";
    if (nav === "category" && caret) {
      if (caret.startsWith("cat:")) cat = caret.slice(4);
      else if (caret.includes("|")) cat = caret.slice(0, caret.lastIndexOf("|"));
    }
    newTodo(cat && cat !== NOT_CATEGORIZED ? { category: cat } : {});
  };

  useTabCommands("todo", {
    refresh,
    deleteSelected: () => markForDeletion(selection()),
    properties: selected ? () => void openDocumentProperties("todos", selected.id) : undefined,
    copyAsLink: selected ? () => copyTodoLink(selected) : undefined,
    searchBar: () => setSearchOpen((o) => !o),
    newDocument: newInView,
  });

  // ---- columns and categories ---------------------------------------------
  const columns: ViewColumn<TodoTask>[] = useMemo(() => {
    const state: ViewColumn<TodoTask> = {
      id: "state",
      title: "Status",
      headerIcon: "complete",
      icon: true,
      sortable: true,
      sortValue: (t) => STATUS_BUCKETS.indexOf(statusBucket(t, today)),
      render: (t) =>
        isComplete(t) ? (
          <Icon name="complete" title="Complete" />
        ) : isOverdue(t, today) ? (
          <Icon name="overdue" title="Overdue" />
        ) : null,
    };
    const subject: ViewColumn<TodoTask> = {
      id: "subject",
      title: "Subject",
      flex: true,
      minWidth: 200,
      sortable: true,
      sortValue: (t) => t.subject.toLowerCase(),
      text: (t) => t.subject,
      render: (t) => (
        <span className="todo-subject">{t.conflictOf ? "[Replication or Save Conflict]" : t.subject || "(Untitled)"}</span>
      ),
    };
    const date = (id: "due" | "completedDate", title: string): ViewColumn<TodoTask> => ({
      id: id === "due" ? "due" : "completed",
      title,
      width: 88,
      sortable: true,
      sortValue: (t) => t[id] ?? Number.MAX_SAFE_INTEGER,
      text: (t) => (t[id] != null ? fmtDate(t[id]!) : ""),
      render: (t) => (t[id] != null ? fmtDate(t[id]!) : ""),
    });
    const priority: ViewColumn<TodoTask> = {
      id: "priority",
      title: "Priority",
      width: 76,
      sortable: true,
      sortValue: (t) => PRIORITY_RANK[t.priority],
      text: (t) => priorityLabel(t.priority),
      render: (t) =>
        t.priority === "none" ? null : (
          <span className="todo-prio">
            {t.priority === "high" && <Icon name="importance" />}
            {priorityLabel(t.priority)}
          </span>
        ),
    };
    const category: ViewColumn<TodoTask> = {
      id: "category",
      title: "Category",
      width: 130,
      sortable: true,
      sortValue: (t) => t.category.toLowerCase(),
      text: (t) => t.category,
      render: (t) => categoriesOf(t.category).join(", "),
    };
    return nav === "complete"
      ? [state, subject, date("completedDate", "Completed"), priority, category]
      : [state, subject, date("due", "Due"), priority, category];
  }, [nav, today]);

  const categorize = useMemo(() => {
    if (nav === "due") return (t: TodoTask) => dueBucket(t.due, today);
    if (nav === "category") return categoryLabels;
    if (nav === "status") return (t: TodoTask) => statusBucket(t, today);
    return undefined;
  }, [nav, today]);
  const order = nav === "due" ? dueBucketOrder : nav === "category" ? categoryOrder : nav === "status" ? statusBucketOrder : undefined;

  const rowMenu = (t: TodoTask | null): MenuItem[] => {
    if (!t) return [{ label: "&New To Do", run: newInView }];
    const ids = checked.has(t.id) ? [...checked] : [t.id];
    const allDone = ids.every((id) => {
      const x = todos.find((y) => y.id === id);
      return !x || isComplete(x);
    });
    return [
      { label: "&Open", run: () => openTodo(t) },
      { label: "&Edit", run: () => openTodo(t, true) },
      { sep: true },
      allDone
        ? { label: "Mark &Incomplete", icon: "incomplete", run: () => mark(ids, false) }
        : { label: "Mark &Complete", icon: "complete", run: () => mark(ids, true) },
      {
        label: "Copy Into &New",
        children: [
          { label: "&Memo", run: () => copyInto(t, "memo") },
          { label: "&Calendar Entry", run: () => copyInto(t, "calendar") },
        ],
      },
      { label: "Copy as &Link", children: [{ label: "&Document Link", run: () => copyTodoLink(t) }] },
      { sep: true },
      { label: "&Delete", accel: "Del", run: () => markForDeletion(ids) },
      { label: "Document &Properties...", accel: "Alt+Enter", run: () => void openDocumentProperties("todos", t.id) },
    ];
  };

  const ids = selection();
  const selTasks = ids.map((id) => todos.find((t) => t.id === id)).filter((t): t is TodoTask => !!t);
  const allDone = selTasks.length > 0 && selTasks.every(isComplete);
  const actions: ActionItem[] = [
    { id: "new", label: "New To Do", icon: "todo-new", run: newInView },
    "sep",
    allDone
      ? { id: "incomplete", label: "Mark Incomplete", icon: "incomplete", run: () => mark(ids, false) }
      : { id: "complete", label: "Mark Complete", icon: "complete", disabled: !selTasks.length, run: () => mark(ids, true) },
    { id: "delete", label: "Delete", icon: "trash", disabled: !ids.length, accel: "Del", run: () => markForDeletion(ids) },
    "sep",
    copyIntoAction(selected),
  ];

  const view = (
    <div className="list-pane todo-list">
      {searchOpen && (
        <div className="search-bar">
          <label>Search for:</label>
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setApplied(query.trim());
              if (e.key === "Escape") {
                e.stopPropagation();
                e.preventDefault();
                setSearchOpen(false);
              }
            }}
          />
          <button className="btn" onClick={() => setApplied(query.trim())}>
            Search
          </button>
          <button
            className="btn"
            onClick={() => {
              setQuery("");
              setApplied("");
            }}
          >
            Clear
          </button>
          {applied && <span className="search-result">{countDocs(inView.length)} found</span>}
        </div>
      )}
      <NotesView
        viewKey={"todo-" + nav}
        docs={inView}
        getId={getId}
        columns={columns}
        defaultSort={nav === "complete" ? { col: "completed", dir: -1 } : { col: "due", dir: 1 }}
        categorize={categorize}
        categoryOrder={order}
        parentOf={parentOf}
        rowClass={(t) => (isComplete(t) ? "todo-done" : isOverdue(t, today) ? "todo-overdue" : undefined)}
        caret={caret}
        onCaret={(key, t) => {
          setCaret(key);
          setSelectedId(t ? t.id : null);
        }}
        checked={checked}
        onChecked={setChecked}
        marked={marked}
        onOpen={(t) => openTodo(t)}
        onDelete={markForDeletion}
        onRefresh={refresh}
        onContextMenu={(e, t) => openContextMenu(e, rowMenu(t))}
        onDragStart={(e, t) => {
          e.dataTransfer.setData("text/plain", t.id);
          e.dataTransfer.setData(DRAG_DOC, JSON.stringify({ coll: "todos", id: t.id, title: t.subject }));
          e.dataTransfer.effectAllowed = "copyMove";
        }}
        emptyText="There are no documents in this view."
        autoFocus
      />
    </div>
  );

  return (
    <div className="app todo-app">
      <ActionBar actions={actions} />
      <div className="app-cols">
        <div className="nav-pane todo-nav">
          <div className="nav-title">
            <span>To Do</span>
            <span className="nav-sub-label">
              {user.name} on {isOnline(user.location) ? MAIL_SERVER : "Local"}
            </span>
          </div>
          <div className="nav-group">
            {NAV.map((n) => (
              <div
                key={n.key}
                className={"nav-item" + (nav === n.key ? " active" : "")}
                onClick={() => void goNav(n.key)}
              >
                <span className="nav-ic">
                  <Icon name={n.icon} />
                </span>
                <span className="nav-label">{n.label}</span>
                {n.key === "due" && overdue > 0 && (
                  <span className="todo-overdue-count" title={`${overdue} To Do${overdue === 1 ? " is" : "s are"} overdue`}>
                    {overdue} overdue
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="nav-group todo-nav-links">
            <div className="nav-item" onClick={() => openView("mail")}>
              <span className="nav-ic">
                <Icon name="mail" />
              </span>
              <span className="nav-label">Mail</span>
            </div>
            <div className="nav-item" onClick={() => openView("calendar")}>
              <span className="nav-ic">
                <Icon name="calendar" />
              </span>
              <span className="nav-label">Calendar</span>
            </div>
          </div>
        </div>

        <Splitter />

        <div className={"todo-stack preview-" + preview}>
          {view}
          {preview !== "off" && (
            <>
              <Splitter vertical={preview === "bottom"} />
              <div className="preview-pane todo-preview">
                {selected ? (
                  <TodoForm task={selected} editing={false} today={today} onEdit={() => openTodo(selected, true)} />
                ) : (
                  <div className="preview-empty">Select a To Do to preview it.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
