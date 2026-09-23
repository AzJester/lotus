// ============================================================================
// Categories: the keyword field of the Journal Entry and Main Topic forms
// (values separated by commas, "A\B" for a subcategory) and its dialogs:
// Categorize (the action on selected documents) and Select Keywords (the
// helper button beside the field). Both dialogs list the categories the
// database already uses with check marks and take new ones typed below.
// ============================================================================

import { useState } from "react";
import { FieldRow } from "../../components/docform";
import { NotesDialog, openDialog } from "../../components/dialogs";
import { Icon } from "../../components/Icon";
import { joinCategories, splitCategories } from "./journalHelpers";
import "../../styles/notebook.css";

export interface KeywordsOptions {
  title: string;
  /** The line above the list, e.g. "Categorize 2 selected documents as:". */
  prompt: string;
  /** Keywords already in use. */
  options: string[];
  /** Keywords checked when the dialog opens. */
  selected: string[];
  newLabel?: string;
}

function KeywordsBox({ opts, close }: { opts: KeywordsOptions; close: (v: string[] | null) => void }) {
  const [on, setOn] = useState<Set<string>>(() => new Set(opts.selected.map((s) => s.toLowerCase())));
  const [typed, setTyped] = useState("");
  // Checked keywords that are not in the list yet still show (and can be unchecked).
  const options = [...opts.options];
  for (const s of opts.selected) if (!options.some((o) => o.toLowerCase() === s.toLowerCase())) options.push(s);

  const toggle = (o: string) =>
    setOn((prev) => {
      const next = new Set(prev);
      const k = o.toLowerCase();
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const ok = () => close(splitCategories([...options.filter((o) => on.has(o.toLowerCase())), typed].join(",")));

  return (
    <NotesDialog
      title={opts.title}
      onClose={() => close(null)}
      width={360}
      footer={
        <>
          <button className="btn primary" onClick={ok}>
            OK
          </button>
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
        </>
      }
    >
      <div className="nb-kw">
        <div className="nb-kw-prompt">{opts.prompt}</div>
        <div className="nb-kw-list" role="listbox" aria-multiselectable>
          {options.length === 0 && <div className="nb-kw-empty">(No categories yet)</div>}
          {options.map((o) => {
            const checked = on.has(o.toLowerCase());
            return (
              <div
                key={o}
                role="option"
                aria-selected={checked}
                tabIndex={0}
                className={"nb-kw-item" + (checked ? " on" : "")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggle(o)}
                onKeyDown={(e) => {
                  if (e.key === " ") {
                    e.preventDefault();
                    toggle(o);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    ok();
                  }
                }}
              >
                <span className="nb-kw-check">{checked && <Icon name="check" />}</span>
                <span className="nb-kw-label">{o}</span>
              </div>
            );
          })}
        </div>
        <label className="nb-kw-new">
          <span>{opts.newLabel ?? "New categories:"}</span>
          <input
            type="text"
            value={typed}
            data-autofocus
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                ok();
              }
            }}
          />
        </label>
        <div className="nb-kw-hint">Separate several categories with commas. Use a backslash for a subcategory (Work\Clients).</div>
      </div>
    </NotesDialog>
  );
}

/** Resolves with the chosen keywords, or null on Cancel. */
export function keywordsDialog(opts: KeywordsOptions): Promise<string[] | null> {
  return openDialog<string[] | null>((close) => <KeywordsBox opts={opts} close={close} />);
}

/** A Categories field: type values separated by commas, or pick them with the helper button. */
export function CategoriesRow({
  label = "Category",
  value,
  editing,
  options,
  onChange,
}: {
  label?: string;
  value: string;
  editing: boolean;
  options: string[];
  onChange: (v: string) => void;
}) {
  const pick = async () => {
    const chosen = await keywordsDialog({
      title: "Select Keywords",
      prompt: "Choose one or more categories:",
      options,
      selected: splitCategories(value),
    });
    if (chosen) onChange(joinCategories(chosen));
  };
  return (
    <FieldRow label={label} editing={editing} read={splitCategories(value).join(", ")}>
      <input type="text" className="nf-input" value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="nb-kw-btn" title="Select categories" onClick={() => void pick()}>
        ▾
      </button>
    </FieldRow>
  );
}
