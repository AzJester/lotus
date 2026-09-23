// ============================================================================
// Rich text: the editor used by memos, topics and journal entries, and the
// read-only renderer. The editor reports its state (font, size, bold...) so
// the status bar popups and the Text menu work; Text menu commands run on
// whichever editor last had focus. Supports Permanent Pen, collapsible
// sections, tables and pasting DocLinks (Edit > Copy as Link).
// ============================================================================

import { useEffect, useRef } from "react";
import { useUI } from "../data/ui";
import type { DocColl, DocLinkRef } from "../data/ui";
import { useNotes } from "../data/store";
import { escapeHtml, sanitizeHtml } from "../lib/sanitize";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { notesAlert } from "./dialogs";

// ---------------------------------------------------------------------------
// The active editor and text commands
// ---------------------------------------------------------------------------

let activeEditor: HTMLElement | null = null;
let savedRange: Range | null = null;

export const FONTS = [
  { label: "Default Sans Serif", css: "Arial, Helvetica, sans-serif" },
  { label: "Default Serif", css: '"Times New Roman", Times, serif' },
  { label: "Default Monospace", css: '"Courier New", Courier, monospace' },
];
export const SIZES = ["8", "9", "10", "12", "14", "18", "24"];
/** execCommand fontSize uses 1-7; map Notes point sizes onto it. */
const SIZE_TO_EXEC: Record<string, string> = { "8": "1", "9": "1", "10": "2", "12": "3", "14": "4", "18": "5", "24": "6" };
const EXEC_TO_SIZE: Record<string, string> = { "1": "8", "2": "10", "3": "12", "4": "14", "5": "18", "6": "24", "7": "36" };

export const TEXT_COLORS = [
  { label: "Black", value: "#000000" },
  { label: "Dark Red", value: "#800000" },
  { label: "Red", value: "#d00000" },
  { label: "Blue", value: "#0000c0" },
  { label: "Dark Green", value: "#006000" },
  { label: "Purple", value: "#800080" },
  { label: "Gray", value: "#606060" },
];

function restoreSelection() {
  if (!activeEditor) return false;
  activeEditor.focus();
  if (savedRange) {
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(savedRange);
  }
  return true;
}

function reportState() {
  if (!activeEditor) return;
  const fontName = (document.queryCommandValue("fontName") || "").replace(/"/g, "");
  const font = FONTS.find((f) => f.css.toLowerCase().startsWith(fontName.split(",")[0].toLowerCase()))?.label ?? "Default Sans Serif";
  const size = EXEC_TO_SIZE[document.queryCommandValue("fontSize")] ?? "10";
  const ui = useUI.getState();
  ui.setEditing({
    font,
    size,
    bold: document.queryCommandState("bold"),
    italic: document.queryCommandState("italic"),
    underline: document.queryCommandState("underline"),
    permanentPen: ui.editing?.permanentPen ?? false,
  });
}

function notifyChange() {
  activeEditor?.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Run a formatting command on the active editor. */
export function execText(cmd: string, value?: string): void {
  if (!restoreSelection()) return;
  document.execCommand("styleWithCSS", false, "false");
  document.execCommand(cmd, false, value);
  notifyChange();
  reportState();
}

export function setFont(label: string) {
  const f = FONTS.find((x) => x.label === label);
  if (f) execText("fontName", f.css);
}

export function setSize(pt: string) {
  execText("fontSize", SIZE_TO_EXEC[pt] ?? "2");
}

/** Toggle Permanent Pen: text you type from here on is red. */
export function togglePermanentPen() {
  const ui = useUI.getState();
  const on = !(ui.editing?.permanentPen ?? false);
  if (!restoreSelection()) return;
  document.execCommand("foreColor", false, on ? "#d00000" : "#000000");
  ui.setEditing({ ...(ui.editing ?? { font: "Default Sans Serif", size: "10", bold: false, italic: false, underline: false }), permanentPen: on });
  ui.setStatus(on ? "Permanent Pen on" : "Permanent Pen off");
}

export function insertHtml(html: string) {
  if (!restoreSelection()) return;
  document.execCommand("insertHTML", false, html);
  notifyChange();
}

export function insertSection() {
  insertHtml('<details class="rt-section" open><summary>Section</summary><div>Section text</div></details><div><br></div>');
}

export function insertTable(rows = 2, cols = 2) {
  const cells = Array.from({ length: rows }, () => `<tr>${"<td>&nbsp;</td>".repeat(cols)}</tr>`).join("");
  insertHtml(`<table class="rt-table"><tbody>${cells}</tbody></table><div><br></div>`);
}

export function docLinkHtml(link: DocLinkRef): string {
  const t = escapeHtml(link.title || "Document");
  return `<a class="doclink" data-coll="${link.coll}" data-id="${escapeHtml(link.id)}"${link.db ? ` data-db="${escapeHtml(link.db)}"` : ""} data-title="${t}" href="notes://Mail01/Acme/0/${escapeHtml(link.id)}" title="${t}">${t}</a>&nbsp;`;
}

/** Edit > Copy as Link > Document Link: onto the in-app and system clipboards. */
export function copyDocumentLink(link: DocLinkRef) {
  const ui = useUI.getState();
  ui.setClipboardLink(link);
  try {
    const html = docLinkHtml(link);
    const text = `notes:///${link.db ?? link.coll}/0/${link.id}`;
    if (navigator.clipboard && "write" in navigator.clipboard && typeof ClipboardItem !== "undefined") {
      void navigator.clipboard
        .write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ])
        .catch(() => undefined);
    }
  } catch {
    /* the in-app clipboard still has the link */
  }
  ui.setStatus(`Document link copied: "${link.title}". Paste it into a memo or any rich text field.`);
}

export function pasteDocLink(): boolean {
  const link = useUI.getState().clipboardLink;
  if (!link || !activeEditor) return false;
  insertHtml(docLinkHtml(link));
  return true;
}

export const hasActiveEditor = () => !!activeEditor && document.contains(activeEditor);

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const TOOLS: { icon: IconName; title: string; run: () => void }[] = [
  { icon: "fmt-bold", title: "Bold (Ctrl+B)", run: () => execText("bold") },
  { icon: "fmt-italic", title: "Italic (Ctrl+I)", run: () => execText("italic") },
  { icon: "fmt-underline", title: "Underline (Ctrl+U)", run: () => execText("underline") },
  { icon: "fmt-strike", title: "Strikethrough", run: () => execText("strikeThrough") },
  { icon: "fmt-color", title: "Red text", run: () => execText("foreColor", "#d00000") },
  { icon: "permanent-pen", title: "Permanent Pen", run: togglePermanentPen },
  { icon: "fmt-bullets", title: "Bullets", run: () => execText("insertUnorderedList") },
  { icon: "fmt-numbers", title: "Numbers", run: () => execText("insertOrderedList") },
  { icon: "fmt-outdent", title: "Outdent", run: () => execText("outdent") },
  { icon: "fmt-indent", title: "Indent", run: () => execText("indent") },
  { icon: "fmt-left", title: "Align left", run: () => execText("justifyLeft") },
  { icon: "fmt-center", title: "Center", run: () => execText("justifyCenter") },
  { icon: "fmt-right", title: "Align right", run: () => execText("justifyRight") },
  { icon: "section", title: "Create Section", run: insertSection },
  { icon: "table", title: "Create Table", run: () => insertTable() },
];

export function RichTextEditor({
  html,
  onChange,
  placeholder,
  className,
  toolbar = true,
  extraTools,
}: {
  /** Initial HTML (the editor is uncontrolled after mount). */
  html: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  toolbar?: boolean;
  extraTools?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = sanitizeHtml(html);
    // Seed once; the editor owns its content afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (!ref.current || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (ref.current.contains(range.commonAncestorContainer)) {
        savedRange = range.cloneRange();
        if (activeEditor === ref.current) reportState();
      }
    };
    document.addEventListener("selectionchange", onSel);
    return () => {
      document.removeEventListener("selectionchange", onSel);
      if (activeEditor === ref.current) {
        activeEditor = null;
        useUI.getState().setEditing(null);
      }
    };
  }, []);

  return (
    <div className={"rt-editor" + (className ? " " + className : "")}>
      {toolbar && (
        <div className="rt-toolbar" onMouseDown={(e) => e.preventDefault()}>
          <select
            className="rt-font"
            title="Font"
            defaultValue="Default Sans Serif"
            onChange={(e) => setFont(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {FONTS.map((f) => (
              <option key={f.label}>{f.label}</option>
            ))}
          </select>
          <select
            className="rt-size"
            title="Size"
            defaultValue="10"
            onChange={(e) => setSize(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <span className="rt-sep" />
          {TOOLS.map((t, i) => (
            <button key={i} type="button" className="rt-btn" title={t.title} onClick={t.run}>
              <Icon name={t.icon} />
            </button>
          ))}
          {extraTools}
        </div>
      )}
      <div
        ref={ref}
        className="rt-body"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder={placeholder}
        onFocus={() => {
          activeEditor = ref.current;
          reportState();
        }}
        onBlur={() => {
          // Keep the editor "active" for menu commands; the status bar
          // popups hide once another control takes focus.
          setTimeout(() => {
            const ae = document.activeElement;
            if (ae && ae !== ref.current && !(ae as HTMLElement).closest?.(".rt-toolbar, .statusbar, .menubar, .menu-popup")) {
              useUI.getState().setEditing(null);
            }
          }, 0);
        }}
        onInput={(e) => latest.current((e.target as HTMLDivElement).innerHTML)}
        onKeyDown={(e) => {
          const ctrl = e.ctrlKey || e.metaKey;
          if (ctrl && e.key.toLowerCase() === "b") (e.preventDefault(), execText("bold"));
          else if (ctrl && e.key.toLowerCase() === "i") (e.preventDefault(), execText("italic"));
          else if (ctrl && e.key.toLowerCase() === "u") (e.preventDefault(), execText("underline"));
        }}
        onPaste={(e) => {
          const htmlData = e.clipboardData.getData("text/html");
          const text = e.clipboardData.getData("text/plain");
          if (htmlData && htmlData.includes('class="doclink"')) {
            e.preventDefault();
            insertHtml(sanitizeHtml(htmlData));
            return;
          }
          const link = useUI.getState().clipboardLink;
          if (link && (!text || text.startsWith("notes://"))) {
            e.preventDefault();
            pasteDocLink();
            return;
          }
          if (htmlData) {
            e.preventDefault();
            insertHtml(sanitizeHtml(htmlData));
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read mode
// ---------------------------------------------------------------------------

/** Open the document a DocLink points to (or say it is gone). */
export async function followDocLink(coll: DocColl, id: string, db?: string) {
  const s = useNotes.getState();
  const lists: Record<DocColl, { id: string }[]> = {
    mail: s.mail,
    calendar: s.calendar,
    contacts: s.contacts,
    todos: s.todos,
    journal: s.journal,
    discussion: s.discussion,
    help: [],
  };
  const exists = coll === "help" || (lists[coll] ?? []).some((d) => d.id === id);
  if (!exists) {
    await notesAlert("Document has been deleted.", { icon: "warning" });
    return;
  }
  useUI.getState().openDocument({ coll, id }, { db });
}

export function RichTextView({ html, text, className }: { html?: string; text?: string; className?: string }) {
  const clean = html ? sanitizeHtml(html) : undefined;
  return (
    <div
      className={"rt-view" + (clean === undefined ? " plain" : "") + (className ? " " + className : "")}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest?.("a.doclink") as HTMLAnchorElement | null;
        if (!a) return;
        e.preventDefault();
        void followDocLink(a.dataset.coll as DocColl, a.dataset.id ?? "", a.dataset.db);
      }}
      {...(clean !== undefined ? { dangerouslySetInnerHTML: { __html: clean } } : { children: text })}
    />
  );
}
