// ============================================================================
// Address Book dialogs. Groups do not open in a window of their own, so the
// Group dialog edits them: the group name and a check list of your contacts
// to pick the members from. Add to Group files the selected contacts in an
// existing or new group, and Export vCard asks which contacts to write and
// the file name.
// ============================================================================

import { useMemo, useState } from "react";
import { NotesDialog, notesAlert, openDialog } from "../../components/dialogs";
import { useNotes } from "../../data/store";
import type { ContactGroup } from "../../data/types";
import { compareContacts, groupNameProblem, matchesQuery, plural, viewName } from "./pab";

// ---------------------------------------------------------------------------
// Group
// ---------------------------------------------------------------------------

export interface GroupDraft {
  name: string;
  memberIds: string[];
}

/** New Group (no group) or edit a group. Resolves null on Cancel. */
export function groupDialog(opts: { group?: ContactGroup; memberIds?: string[] } = {}): Promise<GroupDraft | null> {
  return openDialog<GroupDraft | null>((close) => (
    <GroupDialog group={opts.group} initial={opts.memberIds ?? opts.group?.memberIds ?? []} close={close} />
  ));
}

function GroupDialog({
  group,
  initial,
  close,
}: {
  group?: ContactGroup;
  initial: string[];
  close: (v: GroupDraft | null) => void;
}) {
  const contacts = useNotes((s) => s.contacts);
  const groups = useNotes((s) => s.contactGroups);
  const [name, setName] = useState(group?.name ?? "");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initial));
  const [find, setFind] = useState("");
  const sorted = useMemo(() => [...contacts].sort(compareContacts), [contacts]);
  const shown = sorted.filter((c) => matchesQuery(c, find));
  const count = sorted.filter((c) => picked.has(c.id)).length;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ok = async () => {
    const problem = groupNameProblem(name, groups, group?.id);
    if (problem) {
      await notesAlert(problem, { icon: "warning" });
      return;
    }
    // Members keep their order; newly picked ones follow in view order.
    const live = new Set(contacts.map((c) => c.id));
    const keep = (group?.memberIds ?? []).filter((id) => picked.has(id) && live.has(id));
    const added = sorted.filter((c) => picked.has(c.id) && !keep.includes(c.id)).map((c) => c.id);
    close({ name: name.trim(), memberIds: [...keep, ...added] });
  };

  return (
    <NotesDialog
      title={group ? "Edit Group" : "New Group"}
      onClose={() => close(null)}
      width={460}
      className="pab-dialog"
      footer={
        <>
          <button className="btn primary" onClick={() => void ok()}>
            OK
          </button>
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
        </>
      }
    >
      <div className="pab-dlg">
        <label className="pab-dlg-row">
          <span className="pab-dlg-label">Group name:</span>
          <input
            type="text"
            className="pab-dlg-input"
            value={name}
            data-autofocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void ok();
              }
            }}
          />
        </label>
        <div className="pab-dlg-row">
          <span className="pab-dlg-label">Members:</span>
          <span className="pab-dlg-count">
            {count} of {plural(sorted.length, "contact")} selected
          </span>
        </div>
        <div className="pab-picklist" role="group" aria-label="Members">
          {shown.map((c) => (
            <label key={c.id} className={"pab-pick" + (picked.has(c.id) ? " on" : "")}>
              <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
              <span className="pab-pick-name">{viewName(c)}</span>
              <span className="pab-pick-mail">{c.email || c.company}</span>
            </label>
          ))}
          {!shown.length && (
            <div className="pab-pick-empty">{sorted.length ? "No contacts match." : "Your Address Book has no contacts yet."}</div>
          )}
        </div>
        <div className="pab-dlg-tools">
          <label className="pab-dlg-find">
            Find:
            <input type="text" value={find} onChange={(e) => setFind(e.target.value)} />
          </label>
          <button
            className="btn"
            onClick={() =>
              setPicked((prev) => {
                const next = new Set(prev);
                for (const c of shown) next.add(c.id);
                return next;
              })
            }
          >
            Select All
          </button>
          <button
            className="btn"
            onClick={() =>
              setPicked((prev) => {
                const next = new Set(prev);
                for (const c of shown) next.delete(c.id);
                return next;
              })
            }
          >
            Clear
          </button>
        </div>
      </div>
    </NotesDialog>
  );
}

// ---------------------------------------------------------------------------
// Add to Group
// ---------------------------------------------------------------------------

export type AddToGroupChoice = { groupId: string } | { newName: string };

export function addToGroupDialog(count: number): Promise<AddToGroupChoice | null> {
  return openDialog<AddToGroupChoice | null>((close) => <AddToGroup count={count} close={close} />);
}

function AddToGroup({ count, close }: { count: number; close: (v: AddToGroupChoice | null) => void }) {
  const groups = useNotes((s) => s.contactGroups);
  const sorted = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [groups],
  );
  const [mode, setMode] = useState<"existing" | "new">(sorted.length ? "existing" : "new");
  const [groupId, setGroupId] = useState(sorted[0]?.id ?? "");
  const [newName, setNewName] = useState("");

  const ok = async () => {
    if (mode === "existing" && groupId) {
      close({ groupId });
      return;
    }
    const problem = groupNameProblem(newName, groups);
    if (problem) {
      await notesAlert(problem, { icon: "warning" });
      return;
    }
    close({ newName: newName.trim() });
  };

  return (
    <NotesDialog
      title="Add to Group"
      onClose={() => close(null)}
      width={380}
      className="pab-dialog"
      footer={
        <>
          <button className="btn primary" onClick={() => void ok()}>
            OK
          </button>
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
        </>
      }
    >
      <div className="pab-dlg">
        <div className="pab-dlg-lead">Add the {count === 1 ? "selected contact" : `${count} selected contacts`} to:</div>
        <label className="pab-dlg-choice">
          <input
            type="radio"
            name="pab-add-mode"
            checked={mode === "existing"}
            disabled={!sorted.length}
            onChange={() => setMode("existing")}
          />
          <span className="pab-dlg-label">Group:</span>
          <select
            value={groupId}
            disabled={!sorted.length}
            data-autofocus={sorted.length ? true : undefined}
            onChange={(e) => {
              setGroupId(e.target.value);
              setMode("existing");
            }}
          >
            {sorted.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.memberIds.length})
              </option>
            ))}
            {!sorted.length && <option value="">(no groups)</option>}
          </select>
        </label>
        <label className="pab-dlg-choice">
          <input type="radio" name="pab-add-mode" checked={mode === "new"} onChange={() => setMode("new")} />
          <span className="pab-dlg-label">New group:</span>
          <input
            type="text"
            value={newName}
            placeholder="Group name"
            data-autofocus={sorted.length ? undefined : true}
            onFocus={() => setMode("new")}
            onChange={(e) => {
              setNewName(e.target.value);
              setMode("new");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void ok();
              }
            }}
          />
        </label>
      </div>
    </NotesDialog>
  );
}

// ---------------------------------------------------------------------------
// Export vCard
// ---------------------------------------------------------------------------

export interface ExportChoice {
  scope: "selected" | "all";
  fileName: string;
}

export interface ExportOptions {
  /** How many contacts are selected (0 disables the choice). */
  selected: number;
  all: number;
  /** Label for the selected choice ("Selected contacts", "Members of the selected groups"). */
  selectedLabel: string;
  selectedFile: string;
  allFile: string;
}

export function exportDialog(opts: ExportOptions): Promise<ExportChoice | null> {
  return openDialog<ExportChoice | null>((close) => <ExportVCard opts={opts} close={close} />);
}

function ExportVCard({ opts, close }: { opts: ExportOptions; close: (v: ExportChoice | null) => void }) {
  const [scope, setScope] = useState<"selected" | "all">(opts.selected ? "selected" : "all");
  const [fileName, setFileName] = useState(opts.selected ? opts.selectedFile : opts.allFile);
  const [edited, setEdited] = useState(false);
  const pick = (s: "selected" | "all") => {
    setScope(s);
    if (!edited) setFileName(s === "selected" ? opts.selectedFile : opts.allFile);
  };
  const ok = () => {
    const count = scope === "selected" ? opts.selected : opts.all;
    if (!count) return;
    close({ scope, fileName: fileName.trim() || "contacts.vcf" });
  };
  return (
    <NotesDialog
      title="Export vCard"
      onClose={() => close(null)}
      width={400}
      className="pab-dialog"
      footer={
        <>
          <button className="btn primary" disabled={!(scope === "selected" ? opts.selected : opts.all)} onClick={ok}>
            Export
          </button>
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
        </>
      }
    >
      <div className="pab-dlg">
        <fieldset className="pab-dlg-set">
          <legend>Export</legend>
          <label className="pab-dlg-choice">
            <input
              type="radio"
              name="pab-export"
              checked={scope === "selected"}
              disabled={!opts.selected}
              data-autofocus={opts.selected ? true : undefined}
              onChange={() => pick("selected")}
            />
            {opts.selectedLabel} ({opts.selected})
          </label>
          <label className="pab-dlg-choice">
            <input
              type="radio"
              name="pab-export"
              checked={scope === "all"}
              data-autofocus={opts.selected ? undefined : true}
              onChange={() => pick("all")}
            />
            All contacts ({opts.all})
          </label>
        </fieldset>
        <label className="pab-dlg-row">
          <span className="pab-dlg-label">File name:</span>
          <input
            type="text"
            className="pab-dlg-input"
            value={fileName}
            onChange={(e) => {
              setFileName(e.target.value);
              setEdited(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                ok();
              }
            }}
          />
        </label>
        <div className="pab-dlg-row">
          <span className="pab-dlg-label">Format:</span>
          <span>vCard 3.0 (*.vcf)</span>
        </div>
      </div>
    </NotesDialog>
  );
}
