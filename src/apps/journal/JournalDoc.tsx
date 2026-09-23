// ============================================================================
// A Personal Journal page in its own window: the Journal Entry form (Subject,
// Categories, Date created and the rich text body) with the Notes document
// behavior of useDocWindow: saved pages open in read mode, Ctrl+E or a
// double-click switches to edit mode, Ctrl+S saves, and closing a changed
// page asks to save it. The preview pane shows the same form in read mode.
// ============================================================================

import { useMemo } from "react";
import { ActionBar } from "../../components/ActionBar";
import type { ActionItem } from "../../components/ActionBar";
import { DocMissing, FieldRow, FieldTable, FormPage, TextRow, useDocWindow } from "../../components/docform";
import { notesAsk } from "../../components/dialogs";
import { RichTextEditor, RichTextView } from "../../components/RichText";
import { useTab } from "../../components/tabs";
import { useNotes } from "../../data/store";
import { useUI } from "../../data/ui";
import type { JournalEntry } from "../../data/types";
import { textToHtml } from "../../lib/sanitize";
import { fmtDateTime } from "../../lib/format";
import { CategoriesRow } from "./Categories";
import { useEditRequests } from "./openInEdit";
import {
  allCategories,
  blankEntry,
  entrySaveFields,
  entryTitle,
  inJournalDb,
  journalDb,
} from "./journalHelpers";
import "../../styles/notebook.css";

/** Edit > Copy as Link > Document Link. */
export function copyJournalLink(e: JournalEntry) {
  const ui = useUI.getState();
  ui.setClipboardLink({ coll: "journal", id: e.id, db: journalDb(e.db), title: entryTitle(e) });
  ui.setStatus("Document link copied to the clipboard. Paste it into a rich text field.");
}

/** The Journal Entry form, in read or edit mode. */
export function JournalForm({
  entry,
  editing,
  set,
  onEdit,
  categories,
  compact,
}: {
  entry: JournalEntry;
  editing: boolean;
  set?: (patch: Partial<JournalEntry>) => void;
  onEdit?: () => void;
  categories: string[];
  compact?: boolean;
}) {
  return (
    <FormPage
      form="Journal Entry"
      icon="note"
      editing={editing}
      onEdit={onEdit}
      className={"nb-form" + (compact ? " compact" : "")}
    >
      <FieldTable>
        <TextRow
          label="Subject"
          value={entry.subject}
          editing={editing}
          autoFocus={editing && !entry.subject}
          onChange={(v) => set?.({ subject: v })}
        />
        <CategoriesRow value={entry.category} editing={editing} options={categories} onChange={(v) => set?.({ category: v })} />
        <FieldRow label="Date created" editing={false} read={fmtDateTime(entry.created)}>
          {null}
        </FieldRow>
      </FieldTable>
      {editing ? (
        <RichTextEditor
          className="nb-editor"
          html={entry.bodyHtml ?? textToHtml(entry.body)}
          placeholder="Write your journal entry here."
          onChange={(html) => set?.({ bodyHtml: html })}
        />
      ) : (
        <RichTextView className="nb-body" html={entry.bodyHtml} text={entry.bodyHtml ? undefined : entry.body} />
      )}
    </FormPage>
  );
}

export function JournalDocument() {
  const { tab } = useTab();
  const id = tab.doc?.id ?? "";
  const doc = useNotes((s) => (tab.isNew ? undefined : s.journal.find((j) => j.id === id)));
  const journal = useNotes((s) => s.journal);
  const addJournal = useNotes((s) => s.addJournal);
  const updateJournal = useNotes((s) => s.updateJournal);
  const deleteJournal = useNotes((s) => s.deleteJournal);
  const db = journalDb(doc?.db ?? tab.db);
  const categories = useMemo(() => allCategories(journal.filter((j) => inJournalDb(j, db))), [journal, db]);

  const w = useDocWindow<JournalEntry>({
    coll: "journal",
    doc,
    blank: (init, newId) => blankEntry(init, newId, tab.db),
    title: (d) => (d.subject.trim() ? d.subject.trim() : tab.isNew ? "New Journal Entry" : entryTitle(d)),
    persist: (d, isNew) => {
      if (isNew) addJournal({ ...d, ...entrySaveFields(d) });
      else updateJournal(d.id, entrySaveFields(d));
      useUI.getState().setStatus("Document saved.");
    },
    commands: {
      copyAsLink: doc ? () => copyJournalLink(doc) : undefined,
    },
  });

  useEditRequests("journal", doc?.id, w.beginEdit, !!doc);

  if (w.missing) return <DocMissing />;

  const remove = async () => {
    if (!doc) return;
    if (!(await notesAsk(`Delete the journal entry "${entryTitle(doc)}"?`, { title: "Delete Document" }))) return;
    deleteJournal(doc.id);
    useUI.getState().setStatus("Document deleted.");
    w.closeNow();
  };

  const actions: ActionItem[] = w.editing
    ? [
        { id: "saveclose", label: "Save & Close", icon: "save", run: () => void w.saveAndClose() },
        { id: "save", label: "Save", icon: "save", run: () => void w.save(), accel: "Ctrl+S" },
        !w.isNew && "sep",
        !w.isNew && { id: "delete", label: "Delete", icon: "trash", run: () => void remove() },
      ]
    : [
        { id: "edit", label: "Edit", icon: "edit", run: w.beginEdit, accel: "Ctrl+E" },
        "sep",
        { id: "delete", label: "Delete", icon: "trash", run: () => void remove() },
      ];

  return (
    <div className="app nb-window">
      <ActionBar actions={actions} />
      <JournalForm entry={w.draft} editing={w.editing} set={w.set} onEdit={w.beginEdit} categories={categories} />
    </div>
  );
}
