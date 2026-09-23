// ============================================================================
// To Do helpers: the date buckets the To Do views are categorized by (By Due
// Date, By Status), the status line a To Do shows in read mode, the keyword
// choices of the To Do form, and the rules a save applies (validation, the
// completion date). Everything here is a pure function of a task and "now";
// the dates are compared by calendar day, the way the Notes views do.
// ============================================================================

import type { TaskPriority, TaskStatus, TodoTask } from "../../data/types";
import { fmtDate, startOfDay } from "../../lib/format";

const DAY = 86400000;

/** Whole calendar days from a's day to b's day (safe across DST changes). */
export function daysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
}

/** The start of the next day after `ms` (local midnight). */
export function nextMidnight(ms: number): number {
  const d = new Date(startOfDay(ms));
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

export const isComplete = (t: Pick<TodoTask, "status">) => t.status === "complete";

/** Open and due before today. */
export function isOverdue(t: Pick<TodoTask, "status" | "due">, now: number): boolean {
  return !isComplete(t) && t.due != null && daysBetween(now, t.due) < 0;
}

// ---------------------------------------------------------------------------
// View categories
// ---------------------------------------------------------------------------

/** By Due Date categories, in view order. */
export const DUE_BUCKETS = ["Overdue", "Today", "Tomorrow", "This Week", "Next Week", "Later", "No Due Date"] as const;
export type DueBucket = (typeof DUE_BUCKETS)[number];

/** The By Due Date category of a due date. Weeks run Sunday to Saturday. */
export function dueBucket(due: number | null, now: number): DueBucket {
  if (due == null) return "No Due Date";
  const d = daysBetween(now, due);
  if (d < 0) return "Overdue";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  const leftThisWeek = 6 - new Date(now).getDay();
  if (d <= leftThisWeek) return "This Week";
  if (d <= leftThisWeek + 7) return "Next Week";
  return "Later";
}

/** By Status categories, in view order. */
export const STATUS_BUCKETS = ["Overdue", "Current", "Future", "Complete"] as const;
export type StatusBucket = (typeof STATUS_BUCKETS)[number];

/**
 * The By Status category: Complete, Overdue (due before today), Future
 * (starts after today, or deferred) or Current (everything else).
 */
export function statusBucket(t: Pick<TodoTask, "status" | "due" | "start">, now: number): StatusBucket {
  if (isComplete(t)) return "Complete";
  if (isOverdue(t, now)) return "Overdue";
  if (t.status === "deferred" || (t.start != null && daysBetween(now, t.start) > 0)) return "Future";
  return "Current";
}

/** A categoryOrder comparator that keeps a fixed list order (unknown labels last). */
export function fixedOrder(list: readonly string[]): (a: string, b: string) => number {
  const rank = (x: string) => {
    const i = list.indexOf(x);
    return i === -1 ? list.length : i;
  };
  return (a, b) => rank(a) - rank(b) || a.localeCompare(b);
}

export const dueBucketOrder = fixedOrder(DUE_BUCKETS);
export const statusBucketOrder = fixedOrder(STATUS_BUCKETS);

export const NOT_CATEGORIZED = "(Not Categorized)";

/** Tidy one category: trims each "A\B" level. */
const tidyOne = (c: string) =>
  c
    .split("\\")
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\\");

/** The categories in a Category field (a comma or semicolon separated list). */
export function categoriesOf(category: string): string[] {
  const out: string[] = [];
  for (const raw of category.split(/[,;]/)) {
    const c = tidyOne(raw);
    if (c && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c);
  }
  return out;
}

/** The Category field as saved: "Work, Travel\Hotels". */
export const tidyCategory = (category: string) => categoriesOf(category).join(", ");

/** By Category labels for a task; tasks without one go under (Not Categorized). */
export function categoryLabels(t: Pick<TodoTask, "category">): string[] {
  const cats = categoriesOf(t.category);
  return cats.length ? cats : [NOT_CATEGORIZED];
}

/** Alphabetical, with (Not Categorized) at the end. */
export function categoryOrder(a: string, b: string): number {
  if (a === b) return 0;
  if (a === NOT_CATEGORIZED) return 1;
  if (b === NOT_CATEGORIZED) return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

/** Every category in use (for the Category field's suggestions). */
export function allCategories(tasks: Pick<TodoTask, "category">[]): string[] {
  const seen = new Map<string, string>();
  for (const t of tasks) for (const c of categoriesOf(t.category)) if (!seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
  return [...seen.values()].sort(categoryOrder);
}

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

export const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "normal", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "none", label: "None" },
];

export const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2, none: 3 };

export const priorityLabel = (p: TaskPriority) => PRIORITY_OPTIONS.find((o) => o.value === p)?.label ?? "Medium";

export const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "not-started", label: "Not Started" },
  { value: "in-progress", label: "In Progress" },
  { value: "deferred", label: "Deferred" },
  { value: "complete", label: "Complete" },
];

export const statusLabel = (s: TaskStatus) => STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;

/** Default order inside a category: due date (none last), priority, subject. */
export function compareTasks(a: TodoTask, b: TodoTask): number {
  const ad = a.due ?? Number.MAX_SAFE_INTEGER;
  const bd = b.due ?? Number.MAX_SAFE_INTEGER;
  if (ad !== bd) return ad - bd;
  const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (pr) return pr;
  return a.subject.localeCompare(b.subject);
}

// ---------------------------------------------------------------------------
// The read-mode status line
// ---------------------------------------------------------------------------

export type StatusTone = "overdue" | "complete" | "due" | "future" | "none";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Overdue by 2 days", "Due tomorrow", "Completed on 09/21/2026"... */
export function statusLine(t: TodoTask, now: number): { text: string; tone: StatusTone } {
  if (isComplete(t)) {
    return { text: t.completedDate != null ? `Completed on ${fmtDate(t.completedDate)}` : "Completed", tone: "complete" };
  }
  if (t.due != null) {
    const d = daysBetween(now, t.due);
    if (d < 0) return { text: `Overdue by ${plural(-d, "day")}`, tone: "overdue" };
    if (d === 0) return { text: "Due today", tone: "due" };
    if (d === 1) return { text: "Due tomorrow", tone: "due" };
    return { text: `Due in ${plural(d, "day")}`, tone: "due" };
  }
  if (t.start != null && daysBetween(now, t.start) > 0) return { text: `Starts on ${fmtDate(t.start)}`, tone: "future" };
  return { text: "No due date", tone: "none" };
}

// ---------------------------------------------------------------------------
// Editing and saving
// ---------------------------------------------------------------------------

/**
 * A date field value ("yyyy-mm-dd") as epoch ms. The time of day of the
 * previous value is kept (seeded and copied To Dos can carry one), so an
 * unchanged date saves unchanged. Empty input, a year still being typed
 * ("0002-09-25") or an impossible date gives null.
 */
export function fromDateInput(value: string, prev: number | null): number | null {
  const m = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  if (y < 1000) return null;
  const keep = prev != null ? new Date(prev) : null;
  const out = new Date(2000, 0, 1, keep?.getHours() ?? 0, keep?.getMinutes() ?? 0);
  out.setFullYear(y, mo, d);
  if (out.getFullYear() !== y || out.getMonth() !== mo || out.getDate() !== d) return null;
  return out.getTime();
}

/** Why a draft cannot be saved (and the field to put the cursor in), or null. */
export function checkTask(t: Pick<TodoTask, "subject" | "start" | "due">): { field: "subject" | "start"; message: string } | null {
  if (!t.subject.trim()) return { field: "subject", message: "Please enter a Subject for this To Do." };
  if (t.start != null && t.due != null && daysBetween(t.due, t.start) > 0) {
    return { field: "start", message: "The Start date cannot be after the Due date." };
  }
  return null;
}

export const validateTask = (t: Pick<TodoTask, "subject" | "start" | "due">): string | null => checkTask(t)?.message ?? null;

/** What Mark Complete / Mark Incomplete change. */
export function completionPatch(done: boolean, now: number): Pick<TodoTask, "status" | "completedDate"> {
  return done ? { status: "complete", completedDate: now } : { status: "not-started", completedDate: null };
}

/** The draft as it is saved: tidy text, and the completion date in step with the status. */
export function normalizeTask(t: TodoTask, now: number): TodoTask {
  return {
    ...t,
    subject: t.subject.trim(),
    category: tidyCategory(t.category),
    completedDate: isComplete(t) ? t.completedDate ?? now : null,
  };
}

/** The fields the To Do form edits (the patch a save writes). */
export function formFields(t: TodoTask): Partial<TodoTask> {
  const { subject, description, start, due, priority, status, category, completedDate } = t;
  return { subject, description, start, due, priority, status, category, completedDate };
}

const PRIORITIES = PRIORITY_OPTIONS.map((o) => o.value);
const STATUSES = STATUS_OPTIONS.map((o) => o.value);

/**
 * A new To Do. `init` comes from the window (Copy Into New passes subject and
 * description; New To Do in By Category passes the category).
 */
export function blankTask(init: Record<string, unknown>, id: string): TodoTask {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const date = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const priority = PRIORITIES.find((p) => p === init.priority) ?? "normal";
  const status = STATUSES.find((s) => s === init.status) ?? "not-started";
  return {
    id,
    subject: str(init.subject),
    description: str(init.description),
    start: date(init.start),
    due: date(init.due),
    priority,
    status,
    category: str(init.category),
    completedDate: null,
  };
}
