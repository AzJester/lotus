// ============================================================================
// Document windows. useDocWindow gives every form the same Notes behavior:
// new documents open in edit mode and saved ones in read mode, Ctrl+E (or a
// double-click on the form) switches to edit mode, Ctrl+S saves, and closing
// a changed document asks "Do you want to save your changes?". The field
// components render a form the Notes way: labels on the left, fields framed
// by corner brackets in edit mode (Classic theme) or plain text when read.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { notesAlert, notesConfirm } from "./dialogs";
import { useTab, useTabCommands } from "./tabs";
import type { TabCommands } from "./tabs";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { registerCloseGuard, useUI } from "../data/ui";
import type { DocColl } from "../data/ui";
import { openDocumentProperties } from "../shell/dialogs/Properties";
import { copyDocumentLink } from "./RichText";

export interface DocWindowOptions<T> {
  coll: DocColl;
  /** The saved document, or undefined for a new one (or one deleted meanwhile). */
  doc: T | undefined;
  /** The starting draft for a new document (tab.init is passed in). */
  blank: (init: Record<string, unknown>, id: string) => T;
  /** Window title for the tab. */
  title: (d: T) => string;
  /** Write the draft to the store. */
  persist: (draft: T, isNew: boolean) => void;
  /** Return a message to refuse the save (e.g. a required field is empty). */
  validate?: (draft: T) => string | null;
  /** Documents you may not edit (e.g. someone else's post). */
  readOnly?: (d: T) => string | null;
  /** Extra commands for the menus. */
  commands?: TabCommands;
}

export interface DocWindow<T> {
  draft: T;
  set: (patch: Partial<T>) => void;
  editing: boolean;
  /** Switch modes (asks to save when leaving edit mode with changes). */
  toggleEdit: () => Promise<void>;
  beginEdit: () => void;
  dirty: boolean;
  isNew: boolean;
  /** Save; resolves false when validation refused it. */
  save: () => Promise<boolean>;
  saveAndClose: () => Promise<void>;
  /** Close without asking. */
  closeNow: () => void;
  missing: boolean;
}

export function useDocWindow<T extends { id: string }>(opts: DocWindowOptions<T>): DocWindow<T> {
  const { tab } = useTab();
  const isNew = !!tab.isNew;
  const makeDraft = () => (opts.doc && !isNew ? opts.doc : opts.blank(tab.init ?? {}, tab.doc?.id ?? tab.id));
  const [draft, setDraft] = useState<T>(makeDraft);
  const [editing, setEditing] = useState<boolean>(isNew);
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  /** Fields changed in this window since the last save. */
  const touched = useRef(new Set<string>());
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const setTabTitle = useUI((s) => s.setTabTitle);

  const setDirty = (v: boolean) => {
    dirtyRef.current = v;
    setDirtyState(v);
  };

  // Until you type something, follow the stored document (replication, Mark
  // Complete in the view, a drag in the calendar), in read or edit mode.
  useEffect(() => {
    if (opts.doc && !dirtyRef.current) setDraft(opts.doc);
  }, [opts.doc]);

  useEffect(() => {
    setTabTitle(tab.id, opts.title(draft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, tab.id]);

  const set = (patch: Partial<T>) => {
    for (const k of Object.keys(patch)) touched.current.add(k);
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const save = async (): Promise<boolean> => {
    const o = optsRef.current;
    const wasNew = !!useUI.getState().tabs.find((t) => t.id === tab.id)?.isNew;
    let d = draftRef.current;
    if (!wasNew && o.doc) {
      // Nothing typed: nothing to save.
      if (!dirtyRef.current) return true;
      // Apply only the fields changed here to the latest stored copy, so
      // edits made elsewhere meanwhile are kept.
      const changes: Record<string, unknown> = {};
      for (const k of touched.current) changes[k] = (d as Record<string, unknown>)[k];
      d = { ...o.doc, ...changes } as T;
    }
    const problem = o.validate?.(d);
    if (problem) {
      await notesAlert(problem, { icon: "warning" });
      return false;
    }
    o.persist(d, wasNew);
    if (wasNew) useUI.getState().retargetTab(tab.id, { coll: o.coll, id: d.id });
    touched.current.clear();
    setDraft(d);
    setDirty(false);
    return true;
  };

  const closeNow = () => {
    setDirty(false);
    useUI.getState().closeTab(tab.id);
  };

  const saveAndClose = async () => {
    if (await save()) closeNow();
  };

  /** Yes / No / Cancel. Resolves true when it is fine to go on. */
  const askToSave = async (): Promise<boolean> => {
    if (!dirtyRef.current) return true;
    const b = await notesConfirm("Do you want to save your changes?", { buttons: ["Yes", "No", "Cancel"] });
    if (b === "Cancel") return false;
    if (b === "Yes") return save();
    setDirty(false);
    touched.current.clear();
    const saved = optsRef.current.doc;
    if (saved) setDraft(saved);
    return true;
  };

  const beginEdit = () => {
    const o = optsRef.current;
    const reason = opts.doc ? o.readOnly?.(opts.doc) : null;
    if (reason) {
      useUI.getState().setStatus(reason);
      return;
    }
    setEditing(true);
  };

  const toggleEdit = async () => {
    if (!editing) return beginEdit();
    if (useUI.getState().tabs.find((t) => t.id === tab.id)?.isNew) {
      useUI.getState().setStatus("Save the document before you leave edit mode.");
      return;
    }
    if (await askToSave()) setEditing(false);
  };

  useEffect(
    () =>
      registerCloseGuard(tab.id, {
        isDirty: () => dirtyRef.current,
        confirmClose: askToSave,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab.id],
  );

  const saved = !isNew && opts.doc ? opts.doc : undefined;
  useTabCommands("doc", {
    save: () => void save(),
    toggleEdit: () => void toggleEdit(),
    properties: saved ? () => void openDocumentProperties(opts.coll, saved.id) : undefined,
    copyAsLink: saved ? () => copyDocumentLink({ coll: opts.coll, id: saved.id, title: opts.title(saved), db: tab.db }) : undefined,
    ...opts.commands,
  });

  return {
    draft,
    set,
    editing,
    toggleEdit,
    beginEdit,
    dirty,
    isNew,
    save,
    saveAndClose,
    closeNow,
    missing: !isNew && !opts.doc,
  };
}

// ---------------------------------------------------------------------------
// Form building blocks
// ---------------------------------------------------------------------------

/** The page a form is drawn on, with its title band. */
export function FormPage({
  form,
  icon,
  editing,
  onEdit,
  children,
  className,
}: {
  form: string;
  icon?: IconName;
  editing: boolean;
  /** Double-click in read mode switches to edit mode. */
  onEdit?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="doc-scroll">
      <div
        className={"doc-form" + (editing ? " editing" : " reading") + (className ? " " + className : "")}
        onDoubleClick={(e) => {
          if (editing || !onEdit) return;
          if ((e.target as HTMLElement).closest("a, button, input, select, textarea")) return;
          onEdit();
        }}
      >
        <div className="form-band">
          {icon && <Icon name={icon} />}
          <span className="form-name">{form}</span>
          {!editing && onEdit && <span className="form-hint">Double-click to edit</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function FieldTable({ children }: { children: ReactNode }) {
  return (
    <table className="field-table">
      <tbody>{children}</tbody>
    </table>
  );
}

/** One labeled row. `children` is the edit-mode control; `read` the read-mode text. */
export function FieldRow({
  label,
  editing,
  read,
  children,
  wide,
}: {
  label: string;
  editing: boolean;
  read: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <tr className={"frow" + (wide ? " wide" : "")}>
      <th>{label}</th>
      <td>{editing ? <span className="nf-field">{children}</span> : <span className="field-read">{read || " "}</span>}</td>
    </tr>
  );
}

/** A text field row. */
export function TextRow({
  label,
  value,
  editing,
  onChange,
  placeholder,
  autoFocus,
  type = "text",
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  type?: "text" | "email" | "tel" | "url";
}) {
  return (
    <FieldRow label={label} editing={editing} read={value}>
      <input
        type={type}
        className="nf-input"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldRow>
  );
}

/** A keyword field (dialog list) row. */
export function ChoiceRow<V extends string>({
  label,
  value,
  editing,
  options,
  onChange,
}: {
  label: string;
  value: V;
  editing: boolean;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <FieldRow label={label} editing={editing} read={options.find((o) => o.value === value)?.label ?? value}>
      <select className="nf-input" value={value} onChange={(e) => onChange(e.target.value as V)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

/** A tabbed table (Notes R5 forms group fields on tabs). */
export function FormTabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div className="form-tabs">
      <div className="form-tabs-row" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === current?.id}
            className={"form-tab" + (t.id === current?.id ? " active" : "")}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="form-tabs-body" role="tabpanel">
        {current?.content}
      </div>
    </div>
  );
}

/** A collapsible section with a twistie. */
export function FormSection({ title, children, open: initial = true }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className={"form-section" + (open ? " open" : "")}>
      <div className="form-section-title" onClick={() => setOpen((o) => !o)}>
        <Icon name={open ? "twistie-down" : "twistie-right"} /> {title}
      </div>
      {open && <div className="form-section-body">{children}</div>}
    </div>
  );
}

/** Shown when a document window's document was deleted (or never existed). */
export function DocMissing() {
  return (
    <div className="app">
      <div className="view-empty">The document could not be found. It may have been deleted.</div>
    </div>
  );
}
