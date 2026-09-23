// ============================================================================
// To Do helper tests: the By Due Date and By Status categories (including the
// week boundaries), the read-mode status line, categories, date fields,
// validation and the completion date. "Now" is fixed so nothing depends on
// the day the tests run.
// ============================================================================

import { describe, expect, it } from "vitest";
import type { TodoTask } from "../../data/types";
import { toDateInput } from "../../lib/format";
import {
  DUE_BUCKETS,
  NOT_CATEGORIZED,
  STATUS_BUCKETS,
  allCategories,
  blankTask,
  categoriesOf,
  categoryLabels,
  categoryOrder,
  checkTask,
  compareTasks,
  completionPatch,
  daysBetween,
  dueBucket,
  dueBucketOrder,
  formFields,
  fromDateInput,
  isOverdue,
  nextMidnight,
  normalizeTask,
  priorityLabel,
  statusBucket,
  statusBucketOrder,
  statusLine,
  tidyCategory,
  validateTask,
} from "./todoHelpers";

// Months are 0-based (8 = September). September 23, 2026 is a Wednesday.
const at = (month: number, date: number, hour = 12, minute = 0) => new Date(2026, month, date, hour, minute).getTime();
const NOW = at(8, 23, 15);

function task(p: Partial<TodoTask> = {}): TodoTask {
  return {
    id: "t",
    subject: "Task",
    description: "",
    start: null,
    due: null,
    priority: "normal",
    status: "not-started",
    category: "",
    completedDate: null,
    ...p,
  };
}

describe("days", () => {
  it("counts calendar days, whatever the time of day", () => {
    expect(daysBetween(NOW, at(8, 23, 0, 1))).toBe(0);
    expect(daysBetween(NOW, at(8, 24, 0, 0))).toBe(1);
    expect(daysBetween(NOW, at(8, 22, 23, 59))).toBe(-1);
    expect(daysBetween(at(8, 1), at(9, 1))).toBe(30);
  });

  it("finds the next midnight", () => {
    expect(nextMidnight(NOW)).toBe(at(8, 24, 0, 0));
    expect(nextMidnight(at(11, 31, 23, 59))).toBe(new Date(2027, 0, 1).getTime());
  });
});

describe("By Due Date", () => {
  it("puts due dates in their categories", () => {
    expect(dueBucket(null, NOW)).toBe("No Due Date");
    expect(dueBucket(at(8, 22, 23, 59), NOW)).toBe("Overdue");
    expect(dueBucket(at(8, 23, 9), NOW)).toBe("Today"); // earlier today is not overdue yet
    expect(dueBucket(at(8, 24), NOW)).toBe("Tomorrow");
    expect(dueBucket(at(8, 25), NOW)).toBe("This Week");
    expect(dueBucket(at(8, 26), NOW)).toBe("This Week"); // Saturday ends the week
    expect(dueBucket(at(8, 27), NOW)).toBe("Next Week"); // Sunday starts the next one
    expect(dueBucket(at(9, 3), NOW)).toBe("Next Week");
    expect(dueBucket(at(9, 4), NOW)).toBe("Later");
  });

  it("lets Tomorrow win at the end of a week", () => {
    const saturday = at(8, 26, 10);
    expect(dueBucket(at(8, 27), saturday)).toBe("Tomorrow");
    expect(dueBucket(at(8, 28), saturday)).toBe("Next Week");
    expect(dueBucket(at(9, 3), saturday)).toBe("Next Week");
    expect(dueBucket(at(9, 4), saturday)).toBe("Later");
  });

  it("orders the categories as the view lists them", () => {
    const shuffled = ["Later", "No Due Date", "Today", "Overdue", "Next Week", "Tomorrow", "This Week"];
    expect([...shuffled].sort(dueBucketOrder)).toEqual([...DUE_BUCKETS]);
  });

  it("only counts open To Dos as overdue", () => {
    expect(isOverdue(task({ due: at(8, 22) }), NOW)).toBe(true);
    expect(isOverdue(task({ due: at(8, 22), status: "complete" }), NOW)).toBe(false);
    expect(isOverdue(task({ due: at(8, 23, 8) }), NOW)).toBe(false);
    expect(isOverdue(task(), NOW)).toBe(false);
  });
});

describe("By Status", () => {
  it("sorts To Dos into Overdue, Current, Future and Complete", () => {
    expect(statusBucket(task({ status: "complete", due: at(8, 1) }), NOW)).toBe("Complete");
    expect(statusBucket(task({ due: at(8, 22) }), NOW)).toBe("Overdue");
    expect(statusBucket(task({ status: "deferred", due: at(8, 22) }), NOW)).toBe("Overdue");
    expect(statusBucket(task({ start: at(8, 25) }), NOW)).toBe("Future");
    expect(statusBucket(task({ status: "deferred" }), NOW)).toBe("Future");
    expect(statusBucket(task({ start: at(8, 23, 20), due: at(8, 30) }), NOW)).toBe("Current");
    expect(statusBucket(task(), NOW)).toBe("Current");
  });

  it("orders the categories as the view lists them", () => {
    expect(["Complete", "Future", "Overdue", "Current"].sort(statusBucketOrder)).toEqual([...STATUS_BUCKETS]);
  });
});

describe("status line", () => {
  it("says how the To Do stands", () => {
    expect(statusLine(task({ due: at(8, 21) }), NOW)).toEqual({ text: "Overdue by 2 days", tone: "overdue" });
    expect(statusLine(task({ due: at(8, 22, 18) }), NOW).text).toBe("Overdue by 1 day");
    expect(statusLine(task({ due: at(8, 23, 9) }), NOW).text).toBe("Due today");
    expect(statusLine(task({ due: at(8, 24) }), NOW).text).toBe("Due tomorrow");
    expect(statusLine(task({ due: at(8, 26) }), NOW).text).toBe("Due in 3 days");
    expect(statusLine(task({ start: at(8, 28) }), NOW)).toEqual({ text: "Starts on 09/28/2026", tone: "future" });
    expect(statusLine(task(), NOW)).toEqual({ text: "No due date", tone: "none" });
  });

  it("shows the completion date of a finished To Do", () => {
    expect(statusLine(task({ status: "complete", due: at(8, 1), completedDate: at(8, 21) }), NOW)).toEqual({
      text: "Completed on 09/21/2026",
      tone: "complete",
    });
    expect(statusLine(task({ status: "complete" }), NOW).text).toBe("Completed");
  });
});

describe("categories", () => {
  it("reads a comma or semicolon separated list and tidies subcategories", () => {
    expect(categoriesOf(" Work ;travel \\ Hotels, work,")).toEqual(["Work", "travel\\Hotels"]);
    expect(categoriesOf("")).toEqual([]);
    expect(tidyCategory("a , b\\ c;")).toBe("a, b\\c");
  });

  it("files To Dos without a category under (Not Categorized), listed last", () => {
    expect(categoryLabels(task())).toEqual([NOT_CATEGORIZED]);
    expect(categoryLabels(task({ category: "Admin, Travel" }))).toEqual(["Admin", "Travel"]);
    expect(["Travel", NOT_CATEGORIZED, "admin", "Finance"].sort(categoryOrder)).toEqual([
      "admin",
      "Finance",
      "Travel",
      NOT_CATEGORIZED,
    ]);
  });

  it("collects every category in use once", () => {
    const list = [task({ category: "Travel, Admin" }), task({ category: "admin" }), task({ category: "" })];
    expect(allCategories(list)).toEqual(["Admin", "Travel"]);
  });
});

describe("date fields", () => {
  it("reads a date field as local midnight", () => {
    expect(fromDateInput("2026-09-25", null)).toBe(new Date(2026, 8, 25).getTime());
    expect(toDateInput(fromDateInput("2026-12-31", null)!)).toBe("2026-12-31");
  });

  it("keeps the time of day of the previous value", () => {
    expect(fromDateInput("2026-09-24", at(8, 24, 17, 30))).toBe(at(8, 24, 17, 30));
    expect(fromDateInput("2026-09-25", at(8, 24, 17, 30))).toBe(at(8, 25, 17, 30));
  });

  it("clears the date for empty, half typed or impossible input", () => {
    expect(fromDateInput("", at(8, 24))).toBeNull();
    expect(fromDateInput("0002-09-25", null)).toBeNull();
    expect(fromDateInput("2026-02-30", null)).toBeNull();
  });
});

describe("saving", () => {
  it("requires a subject and a start date on or before the due date", () => {
    expect(validateTask(task({ subject: "  " }))).toMatch(/Subject/);
    expect(validateTask(task({ start: at(8, 26), due: at(8, 25) }))).toMatch(/Start date/);
    expect(validateTask(task({ start: at(8, 25, 18), due: at(8, 25, 9) }))).toBeNull();
    expect(validateTask(task({ start: at(8, 25) }))).toBeNull();
    expect(validateTask(task({ due: at(8, 25) }))).toBeNull();
  });

  it("names the field to put the cursor in", () => {
    expect(checkTask(task({ subject: "" }))?.field).toBe("subject");
    expect(checkTask(task({ start: at(8, 26), due: at(8, 25) }))?.field).toBe("start");
    expect(checkTask(task())).toBeNull();
  });

  it("keeps the completion date in step with the status", () => {
    const done = normalizeTask(task({ status: "complete", subject: " Call Marcus ", category: "a ,b" }), NOW);
    expect(done).toMatchObject({ subject: "Call Marcus", category: "a, b", completedDate: NOW });
    expect(normalizeTask(task({ status: "complete", completedDate: at(8, 1) }), NOW).completedDate).toBe(at(8, 1));
    expect(normalizeTask(task({ status: "in-progress", completedDate: at(8, 1) }), NOW).completedDate).toBeNull();
  });

  it("marks complete and incomplete", () => {
    expect(completionPatch(true, NOW)).toEqual({ status: "complete", completedDate: NOW });
    expect(completionPatch(false, NOW)).toEqual({ status: "not-started", completedDate: null });
  });

  it("saves only the form's fields", () => {
    const patch = formFields({ ...task({ subject: "S" }), seq: 4, updatedBy: "Sam Rivera/Acme" });
    expect(Object.keys(patch).sort()).toEqual(
      ["category", "completedDate", "description", "due", "priority", "start", "status", "subject"].sort(),
    );
  });
});

describe("new To Dos", () => {
  it("starts from the window's initial values, ignoring bad ones", () => {
    const t = blankTask({ subject: "From mail", description: "Body text", priority: "urgent", category: 7 }, "new-1");
    expect(t).toEqual({
      id: "new-1",
      subject: "From mail",
      description: "Body text",
      start: null,
      due: null,
      priority: "normal",
      status: "not-started",
      category: "",
      completedDate: null,
    });
    expect(blankTask({ priority: "none", due: at(8, 30), category: "Travel" }, "x")).toMatchObject({
      priority: "none",
      due: at(8, 30),
      category: "Travel",
    });
  });

  it("labels priorities the way the form does", () => {
    expect(["high", "normal", "low", "none"].map((p) => priorityLabel(p as TodoTask["priority"]))).toEqual([
      "High",
      "Medium",
      "Low",
      "None",
    ]);
  });

  it("orders a category by due date, then priority, then subject", () => {
    const list = [
      task({ id: "c", due: null }),
      task({ id: "b", due: at(8, 25), priority: "low" }),
      task({ id: "a", due: at(8, 25), priority: "high" }),
      task({ id: "e", due: at(8, 25), priority: "high", subject: "Also" }),
      task({ id: "d", due: at(8, 24) }),
    ];
    expect(list.sort(compareTasks).map((t) => t.id)).toEqual(["d", "e", "a", "b", "c"]);
  });
});
