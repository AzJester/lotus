// ============================================================================
// Mail — the Memo database. Three-pane client (folder navigator · message list
// · reading pane) plus a full memo compose/reply/forward form. This module is
// the reference pattern the other applications follow: it reads/writes the
// shared store, composes the shared UI primitives, and uses the shared layout
// classes (.app, .action-bar, .app-cols, .nav-pane, .list-pane, .preview-pane).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useNotes, uid } from "../../data/store";
import { useUI } from "../../data/ui";
import type {
  Attachment,
  CustomFolder,
  FlagColor,
  MailFolder,
  MailMessage,
  MailRule,
  Person,
  Priority,
} from "../../data/types";
import {
  ActionBar,
  ActionButton,
  ActionSep,
  ActionSpacer,
  Dialog,
} from "../../components/ui";
import { fmtListDate, fmtDateTime, initials } from "../../lib/format";
import { Splitter } from "../../components/Splitter";
import "../../styles/mail.css";

// A custom-folder selection is encoded as `label:<folderId>`.
type NavKey = MailFolder | "followup" | "all" | "junk" | "chat" | `label:${string}`;

const FLAG_COLORS: FlagColor[] = ["red", "yellow", "green", "blue", "purple", "orange"];

interface Compose {
  draftId: string | null; // existing draft being edited, if any
  to: string;
  cc: string;
  subject: string;
  body: string; // plain-text fallback (for search/snippets)
  bodyHtml: string; // rich-text HTML
  attachments: Attachment[];
  priority: Priority;
}

const FOLDERS: { key: NavKey; label: string; icon: string }[] = [
  { key: "inbox", label: "Inbox", icon: "📥" },
  { key: "drafts", label: "Drafts", icon: "📄" },
  { key: "sent", label: "Sent", icon: "📤" },
  { key: "followup", label: "Follow Up", icon: "🚩" },
  { key: "all", label: "All Documents", icon: "🗎" },
  { key: "junk", label: "Junk", icon: "🚫" },
  { key: "trash", label: "Trash", icon: "🗑️" },
  { key: "chat", label: "Chat History", icon: "💬" },
];

// Decorative navigator entries — real Notes views not modeled in this demo.
// (The "Folders"/"Catalog" placeholders were replaced by the real Folders
// section below; Views/Archive/Tools/Other Mail stay decorative.)
const EXTRA_NAV: { label: string; icon: string; twistie?: boolean }[] = [
  { label: "Views", icon: "🔎", twistie: true },
  { label: "Archive", icon: "🗄️" },
  { label: "Tools", icon: "🔧" },
  { label: "Other Mail", icon: "✉️" },
];

function parsePeople(raw: string): Person[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      if (token.includes("@")) {
        const name = token.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        return { name, email: token };
      }
      const email = token.toLowerCase().replace(/\s+/g, ".") + "@acme.example.com";
      return { name: token, email };
    });
}

const peopleStr = (ppl: Person[]) => ppl.map((p) => p.name || p.email).join(", ");

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textToHtml = (s: string) => escapeHtml(s).replace(/\n/g, "<br>");
function htmlToText(html: string): string {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent || "";
}
const hasAttach = (m: MailMessage) => !!(m.hasAttachment || (m.attachments && m.attachments.length));
const fmtBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

// A plausible document "size" for the Size column (attachments dominate it).
function rawBytes(m: MailMessage): number {
  const text = m.subject.length + m.body.length + peopleStr(m.to).length + peopleStr(m.cc).length;
  return text * 9 + 700 + (m.hasAttachment ? 470000 : 0);
}
function sizeOf(m: MailMessage): string {
  const bytes = rawBytes(m);
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  return `${Math.max(1, Math.round(bytes / 1024))}K`;
}

const prioRank = (m: MailMessage) => (m.priority === "high" ? 0 : m.priority === "normal" ? 1 : 2);

type SortKey = "who" | "subject" | "date" | "size" | "importance";

// Notes-style date category for grouped views.
function dateGroup(ms: number): string {
  const d0 = new Date();
  d0.setHours(0, 0, 0, 0);
  const today = d0.getTime();
  const day = 86400000;
  if (ms >= today) return "Today";
  if (ms >= today - day) return "Yesterday";
  if (ms >= today - 7 * day) return "This Week";
  if (ms >= today - 14 * day) return "Last Week";
  return "Older";
}

export default function Mail() {
  const {
    mail,
    user,
    sendMail,
    addMail,
    updateMail,
    deleteMail,
    markRead,
    emptyTrash,
    customFolders,
    addFolder,
    renameFolder,
    deleteFolder,
    setMailFolderLabel,
    mailRules,
    addRule,
    deleteRule,
    applyRules,
  } = useNotes();
  const setStatus = useUI((s) => s.setStatus);
  const pendingMemo = useUI((s) => s.pendingMemo);
  const clearMemo = useUI((s) => s.clearMemo);
  const copyToCalendar = useUI((s) => s.copyToCalendar);
  const copyToTodo = useUI((s) => s.copyToTodo);
  const cmd = useUI((s) => s.cmd);
  const lastCmd = useRef<number>(useUI.getState().cmd?.n ?? 0);

  const [nav, setNav] = useState<NavKey>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState<Compose | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [colW, setColW] = useState({ who: 150, date: 112, size: 56 });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [copyOpen, setCopyOpen] = useState(false);
  const copyRef = useRef<HTMLDivElement>(null);
  const [fileOpen, setFileOpen] = useState(false);
  const fileRef = useRef<HTMLDivElement>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Respond to global keyboard commands while Mail is the active view.
  useEffect(() => {
    if (!cmd || cmd.n === lastCmd.current) return;
    lastCmd.current = cmd.n;
    if (cmd.name === "delete") del();
    else if (cmd.name === "new") newMemo();
    else if (cmd.name === "reply") reply(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd]);

  // Honour a "Write Memo" request handed over from another module (e.g. Contacts).
  useEffect(() => {
    if (pendingMemo) {
      setCompose({
        draftId: null,
        to: pendingMemo.to,
        cc: "",
        subject: pendingMemo.subject,
        body: "",
        bodyHtml: "",
        attachments: [],
        priority: "normal",
      });
      clearMemo();
    }
  }, [pendingMemo, clearMemo]);

  // Close the "Copy Into" dropdown when clicking outside it.
  useEffect(() => {
    if (!copyOpen) return;
    const close = (e: MouseEvent) => {
      if (copyRef.current && !copyRef.current.contains(e.target as Node)) setCopyOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [copyOpen]);

  // Close the "Move To Folder" dropdown when clicking outside it.
  useEffect(() => {
    if (!fileOpen) return;
    const close = (e: MouseEvent) => {
      if (fileRef.current && !fileRef.current.contains(e.target as Node)) setFileOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [fileOpen]);

  const showsSender = nav === "sent" || nav === "drafts";

  const messages = useMemo(() => {
    let list: MailMessage[];
    if (nav === "followup") list = mail.filter((m) => m.flagged && m.folder !== "trash");
    else if (nav === "all") list = mail.filter((m) => m.folder !== "trash");
    else if (nav === "junk" || nav === "chat") list = [];
    else if (nav.startsWith("label:")) {
      const folderId = nav.slice("label:".length);
      list = mail.filter((m) => m.folder !== "trash" && (m.labels?.includes(folderId) ?? false));
    } else list = mail.filter((m) => m.folder === nav);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.subject.toLowerCase().includes(q) ||
          m.body.toLowerCase().includes(q) ||
          m.from.name.toLowerCase().includes(q),
      );
    }
    const who = (m: MailMessage) => (showsSender ? peopleStr(m.to) : m.from.name).toLowerCase();
    const cmp = (a: MailMessage, b: MailMessage) => {
      let r = 0;
      if (sortKey === "who") r = who(a).localeCompare(who(b));
      else if (sortKey === "subject") r = a.subject.localeCompare(b.subject);
      else if (sortKey === "size") r = rawBytes(a) - rawBytes(b);
      else if (sortKey === "importance") r = prioRank(a) - prioRank(b);
      else r = a.date - b.date;
      return r * sortDir || b.date - a.date;
    };
    return [...list].sort(cmp);
  }, [mail, nav, search, sortKey, sortDir, showsSender]);

  // When sorted by date, present Notes-style collapsible date categories.
  const groups = useMemo(() => {
    if (sortKey !== "date") return null;
    const out: { label: string; items: MailMessage[] }[] = [];
    for (const m of messages) {
      const g = dateGroup(m.date);
      const last = out[out.length - 1];
      if (!last || last.label !== g) out.push({ label: g, items: [m] });
      else last.items.push(m);
    }
    return out;
  }, [messages, sortKey]);

  const selected = mail.find((m) => m.id === selectedId) ?? null;
  const inboxUnread = mail.filter((m) => m.folder === "inbox" && !m.read).length;
  const draftCount = mail.filter((m) => m.folder === "drafts").length;
  const flagCount = mail.filter((m) => m.flagged && m.folder !== "trash").length;

  // Message count per custom folder (memos filed under it, excluding trash).
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of customFolders) counts[f.id] = 0;
    for (const m of mail) {
      if (m.folder === "trash" || !m.labels) continue;
      for (const id of m.labels) {
        if (id in counts) counts[id] += 1;
      }
    }
    return counts;
  }, [mail, customFolders]);

  function sortBy(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === "date" ? -1 : 1);
    }
  }
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : "");

  function startResize(col: "who" | "date" | "size", e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colW[col];
    const onMove = (ev: MouseEvent) =>
      setColW((w) => ({ ...w, [col]: Math.max(44, startW + (ev.clientX - startX)) }));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function toggleGroup(label: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const renderRow = (m: MailMessage) => {
    const who = showsSender ? peopleStr(m.to) || "—" : m.from.name;
    const unread = !m.read && m.folder === "inbox";
    return (
      <div
        key={m.id}
        className={
          "view-row" +
          (m.id === selectedId ? " selected" : "") +
          (unread ? " unread" : "") +
          (m.flagged ? " row-" + (m.flagColor ?? "yellow") : "")
        }
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", m.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => selectMessage(m)}
        onDoubleClick={() => (m.folder === "drafts" ? editDraft(m) : selectMessage(m))}
      >
        <div className="col col-c" style={{ flex: "0 0 20px" }}>
          {m.priority === "high" ? <span className="prio-high">!</span> : ""}
        </div>
        <div className="col" style={{ flex: `0 0 ${colW.who}px` }}>{who}</div>
        <div className="col" style={{ flex: 1 }}>{m.subject}</div>
        <div className="col" style={{ flex: `0 0 ${colW.date}px` }}>{fmtListDate(m.date)}</div>
        <div className="col col-r" style={{ flex: `0 0 ${colW.size}px` }}>{sizeOf(m)}</div>
        <div className="col col-c" style={{ flex: "0 0 20px" }}>
          {unread ? <span className="unread-dot" /> : <span className="read-ring" />}
        </div>
        <div className="col col-c" style={{ flex: "0 0 20px" }}>{hasAttach(m) ? "📎" : ""}</div>
        <div className="col col-c" style={{ flex: "0 0 20px" }}>
          {m.flagged ? <span className={"flagmark " + (m.flagColor ?? "yellow")}>⚑</span> : ""}
        </div>
      </div>
    );
  };

  function selectMessage(m: MailMessage) {
    setSelectedId(m.id);
    if (!m.read) markRead(m.id, true);
  }

  // --- compose helpers ----------------------------------------------------
  function newMemo() {
    setCompose({ draftId: null, to: "", cc: "", subject: "", body: "", bodyHtml: "", attachments: [], priority: "normal" });
  }
  function editDraft(m: MailMessage) {
    setCompose({
      draftId: m.id,
      to: peopleStr(m.to),
      cc: peopleStr(m.cc),
      subject: m.subject,
      body: m.body,
      bodyHtml: m.bodyHtml ?? textToHtml(m.body),
      attachments: m.attachments ?? [],
      priority: m.priority,
    });
  }
  function quote(kind: "Original" | "Forwarded"): { body: string; html: string } {
    const m = selected!;
    const head = `----- ${kind} Message -----\nFrom: ${m.from.name}\nDate: ${fmtDateTime(m.date)}\nSubject: ${m.subject}`;
    const body = `\n\n${head}\n\n${m.body}`;
    const html = `<br><br><div class="memo-quote">${textToHtml(head)}<br><br>${m.bodyHtml ?? textToHtml(m.body)}</div>`;
    return { body, html };
  }
  function reply(all: boolean) {
    if (!selected) return;
    // Reply All carries every other primary + cc recipient (minus me and the sender).
    const cc = all
      ? peopleStr(
          [...selected.to, ...selected.cc].filter(
            (p) => p.email !== user.email && p.email !== selected.from.email,
          ),
        )
      : "";
    const q = quote("Original");
    setCompose({
      draftId: null,
      to: peopleStr([selected.from]),
      cc,
      subject: /^re:/i.test(selected.subject) ? selected.subject : `RE: ${selected.subject}`,
      body: q.body,
      bodyHtml: q.html,
      attachments: [],
      priority: "normal",
    });
  }
  function forward() {
    if (!selected) return;
    const q = quote("Forwarded");
    setCompose({
      draftId: null,
      to: "",
      cc: "",
      subject: /^fw:/i.test(selected.subject) ? selected.subject : `Fw: ${selected.subject}`,
      body: q.body,
      bodyHtml: q.html,
      attachments: selected.attachments ?? [],
      priority: "normal",
    });
  }

  function buildMessage(c: Compose, folder: MailFolder): MailMessage {
    const plain = c.bodyHtml ? htmlToText(c.bodyHtml) : c.body;
    return {
      id: c.draftId ?? uid(),
      folder,
      from: { name: user.name, email: user.email },
      to: parsePeople(c.to),
      cc: parsePeople(c.cc),
      subject: c.subject || "(No subject)",
      body: plain,
      bodyHtml: c.bodyHtml || undefined,
      attachments: c.attachments.length ? c.attachments : undefined,
      hasAttachment: c.attachments.length > 0,
      date: Date.now(),
      read: true,
      flagged: false,
      priority: c.priority,
    };
  }

  function doSend() {
    if (!compose) return;
    if (!compose.to.trim()) {
      setStatus("Please specify at least one recipient.");
      return;
    }
    if (compose.draftId) {
      // Promote the existing draft document into a Sent memo in place, so it
      // never lingers in Drafts or transits through Trash.
      const msg = buildMessage(compose, "sent");
      updateMail(compose.draftId, { ...msg, id: compose.draftId });
    } else {
      sendMail(buildMessage({ ...compose, draftId: null }, "sent"));
    }
    setStatus(`Memo sent to ${parsePeople(compose.to).length} recipient(s).`);
    setCompose(null);
  }
  function doSaveDraft() {
    if (!compose) return;
    const msg = buildMessage(compose, "drafts");
    if (compose.draftId) updateMail(compose.draftId, msg);
    else addMail(msg);
    setStatus("Saved to Drafts.");
    setCompose(null);
  }

  // --- delete / flag ------------------------------------------------------
  function del() {
    if (!selected) return;
    const wasTrash = selected.folder === "trash";
    deleteMail(selected.id);
    setStatus(wasTrash ? "Document deleted." : "Moved to Trash.");
    setSelectedId(null);
  }
  function toggleFlag() {
    if (!selected) return;
    const on = !selected.flagged;
    updateMail(selected.id, { flagged: on, flagColor: on ? selected.flagColor ?? "yellow" : undefined });
  }
  function toggleRead() {
    if (!selected) return;
    markRead(selected.id, !selected.read);
  }

  // --- Copy Into New (cross-app handover) ---------------------------------
  function copyInto(target: "calendar" | "todo") {
    if (!selected) return;
    const payload = { subject: selected.subject, description: selected.body };
    if (target === "calendar") copyToCalendar(payload);
    else copyToTodo(payload);
    setCopyOpen(false);
  }

  // --- Custom folders -----------------------------------------------------
  function newFolder() {
    const name = window.prompt("New folder name:", "");
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = addFolder(trimmed);
    setStatus(`Folder "${trimmed}" created.`);
    setNav(`label:${id}`);
    setSelectedId(null);
  }
  function renameFolderPrompt(id: string, current: string) {
    const name = window.prompt("Rename folder:", current);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === current) return;
    renameFolder(id, trimmed);
    setStatus(`Folder renamed to "${trimmed}".`);
  }
  function removeFolder(id: string, name: string) {
    if (!window.confirm(`Remove folder "${name}"? Filed memos stay in their mail folders.`)) return;
    deleteFolder(id);
    if (nav === `label:${id}`) {
      setNav("inbox");
      setSelectedId(null);
    }
    setStatus(`Folder "${name}" removed.`);
  }

  // --- Filing (Move To Folder + drag and drop) ----------------------------
  function toggleFile(folderId: string) {
    if (!selected) return;
    const on = !(selected.labels?.includes(folderId) ?? false);
    setMailFolderLabel(selected.id, folderId, on);
    const fname = customFolders.find((f) => f.id === folderId)?.name ?? "folder";
    setStatus(on ? `Filed in "${fname}".` : `Removed from "${fname}".`);
  }
  function dropOnFolder(folderId: string, msgId: string) {
    setMailFolderLabel(msgId, folderId, true);
    const fname = customFolders.find((f) => f.id === folderId)?.name ?? "folder";
    const subj = mail.find((m) => m.id === msgId)?.subject ?? "Memo";
    setStatus(`Filed "${subj}" in "${fname}".`);
  }

  // --- render -------------------------------------------------------------
  return (
    <div className="app mail-app">
      <ActionBar>
        <ActionButton icon="📝" label="New Memo" onClick={newMemo} />
        <ActionSep />
        <ActionButton icon="↩️" label="Reply" caret onClick={() => reply(false)} disabled={!selected} />
        <ActionButton icon="↪️" label="Reply All" onClick={() => reply(true)} disabled={!selected} />
        <ActionButton icon="➡️" label="Forward" onClick={forward} disabled={!selected} />
        <ActionSep />
        <ActionButton icon="🚩" label="Follow Up" onClick={toggleFlag} disabled={!selected} />
        <ActionButton
          icon="✉️"
          label={selected && selected.read ? "Mark Unread" : "Mark Read"}
          onClick={toggleRead}
          disabled={!selected}
        />
        <ActionButton icon="🗑️" label="Delete" onClick={del} disabled={!selected} />
        <ActionSep />
        <div className="copy-into" ref={copyRef} style={{ position: "relative" }}>
          <ActionButton
            icon="📋"
            label="Copy Into"
            caret
            onClick={() => selected && setCopyOpen((o) => !o)}
            disabled={!selected}
          />
          {copyOpen && selected && (
            <div className="open-menu" style={{ top: "100%", left: 0 }}>
              <div className="open-row" onMouseDown={() => copyInto("calendar")}>
                <span className="open-row-ic">📅</span>
                Calendar Entry
              </div>
              <div className="open-row" onMouseDown={() => copyInto("todo")}>
                <span className="open-row-ic">✅</span>
                To Do
              </div>
            </div>
          )}
        </div>
        <div className="copy-into" ref={fileRef} style={{ position: "relative" }}>
          <ActionButton
            icon="📁"
            label="Move To Folder"
            caret
            onClick={() => selected && setFileOpen((o) => !o)}
            disabled={!selected}
          />
          {fileOpen && selected && (
            <div className="open-menu" style={{ top: "100%", left: 0 }}>
              {customFolders.length === 0 && (
                <div className="open-row open-row-empty">No folders yet</div>
              )}
              {customFolders.map((f) => {
                const filed = selected.labels?.includes(f.id) ?? false;
                return (
                  <div key={f.id} className="open-row" onMouseDown={() => toggleFile(f.id)}>
                    <span className="open-row-ic">{filed ? "☑" : "☐"}</span>
                    {f.name}
                  </div>
                );
              })}
              <div className="open-row open-row-sep" onMouseDown={newFolder}>
                <span className="open-row-ic">➕</span>
                New Folder…
              </div>
            </div>
          )}
        </div>
        <ActionSep />
        <ActionButton icon="⚙️" label="Rules" caret onClick={() => setRulesOpen(true)} />
        <ActionSpacer />
        <div className="action-search">
          <input
            type="search"
            placeholder="Search Mail…"
            className="bevel-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </ActionBar>

      <div className="app-cols">
        {/* Navigator */}
        <div className="nav-pane">
          <div className="nav-title mail-nav-title">
            <span>{user.name}</span>
            <span className="nav-sub-label">on Local</span>
          </div>
          <div className="nav-group">
            {FOLDERS.map((f) => {
              const count =
                f.key === "inbox" ? inboxUnread : f.key === "drafts" ? draftCount : f.key === "followup" ? flagCount : 0;
              return (
                <div
                  key={f.key}
                  className={"nav-item" + (nav === f.key ? " active" : "")}
                  onClick={() => {
                    setNav(f.key);
                    setSelectedId(null);
                    setCompose(null);
                  }}
                >
                  <span className="nav-ic">{f.icon}</span>
                  <span className={"nav-label" + (count > 0 ? " has-count" : "")}>
                    {f.label}
                    {count > 0 ? ` (${count})` : ""}
                  </span>
                </div>
              );
            })}
            {/* Real, user-created folders */}
            <div className="nav-item nav-folders-head">
              <span className="nav-twistie">▼</span>
              <span className="nav-ic">📁</span>
              <span className="nav-label">Folders</span>
              <span
                className="nav-folder-add"
                title="Create a new folder"
                onClick={(e) => {
                  e.stopPropagation();
                  newFolder();
                }}
              >
                ＋
              </span>
            </div>
            {customFolders.length === 0 && (
              <div className="nav-item nav-indent nav-folders-empty">
                <span className="nav-label muted">(no folders)</span>
              </div>
            )}
            {customFolders.map((f) => {
              const key: NavKey = `label:${f.id}`;
              const count = folderCounts[f.id] ?? 0;
              const isDrop = dropTarget === f.id;
              return (
                <div
                  key={f.id}
                  className={
                    "nav-item nav-indent nav-folder" +
                    (nav === key ? " active" : "") +
                    (isDrop ? " drop-target" : "")
                  }
                  onClick={() => {
                    setNav(key);
                    setSelectedId(null);
                    setCompose(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dropTarget !== f.id) setDropTarget(f.id);
                  }}
                  onDragLeave={() => setDropTarget((t) => (t === f.id ? null : t))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropTarget(null);
                    const msgId = e.dataTransfer.getData("text/plain");
                    if (msgId) dropOnFolder(f.id, msgId);
                  }}
                >
                  <span className="nav-ic">🗂️</span>
                  <span className={"nav-label" + (count > 0 ? " has-count" : "")}>
                    {f.name}
                    {count > 0 ? ` (${count})` : ""}
                  </span>
                  <span
                    className="nav-folder-act"
                    title="Rename folder"
                    onClick={(e) => {
                      e.stopPropagation();
                      renameFolderPrompt(f.id, f.name);
                    }}
                  >
                    ✎
                  </span>
                  <span
                    className="nav-folder-act"
                    title="Remove folder"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFolder(f.id, f.name);
                    }}
                  >
                    ✕
                  </span>
                </div>
              );
            })}

            {EXTRA_NAV.map((e) => (
              <div
                key={e.label}
                className="nav-item"
                onClick={() => setStatus(`${e.label} is not available in this demo build.`)}
              >
                {e.twistie ? <span className="nav-twistie">▶</span> : <span className="nav-ic">{e.icon}</span>}
                {e.twistie && <span className="nav-ic">{e.icon}</span>}
                <span className="nav-label">{e.label}</span>
              </div>
            ))}
          </div>
          {nav === "trash" && (
            <div style={{ padding: 8 }}>
              <button className="btn" onClick={() => { emptyTrash(); setSelectedId(null); }}>
                Empty Trash
              </button>
            </div>
          )}
        </div>

        <Splitter />

        {compose ? (
          <ComposeForm
            key={compose.draftId ?? "new:" + compose.subject}
            compose={compose}
            setCompose={setCompose}
            onSend={doSend}
            onSave={doSaveDraft}
            onCancel={() => setCompose(null)}
          />
        ) : (
          <div className="mail-stack">
            {/* Message list */}
            <div className="list-pane mail-list">
              <div className="view">
                <div className="view-head">
                  <div className="col col-c sortable" style={{ flex: "0 0 20px" }} title="Importance"
                    onClick={() => sortBy("importance")}>!{arrow("importance")}</div>
                  <div className="col sortable resizable" style={{ flex: `0 0 ${colW.who}px` }}
                    onClick={() => sortBy("who")}>
                    {showsSender ? "Recipient" : "Sender"}{arrow("who")}
                    <span className="col-resize" onMouseDown={(e) => startResize("who", e)} />
                  </div>
                  <div className="col sortable" style={{ flex: 1 }} onClick={() => sortBy("subject")}>
                    Subject{arrow("subject")}
                  </div>
                  <div className="col sortable resizable" style={{ flex: `0 0 ${colW.date}px` }}
                    onClick={() => sortBy("date")}>
                    Date{arrow("date")}
                    <span className="col-resize" onMouseDown={(e) => startResize("date", e)} />
                  </div>
                  <div className="col col-r sortable resizable" style={{ flex: `0 0 ${colW.size}px` }}
                    onClick={() => sortBy("size")}>
                    Size{arrow("size")}
                    <span className="col-resize" onMouseDown={(e) => startResize("size", e)} />
                  </div>
                  <div className="col col-c" style={{ flex: "0 0 20px" }} title="Read status">○</div>
                  <div className="col col-c" style={{ flex: "0 0 20px" }} title="Attachment">📎</div>
                  <div className="col col-c" style={{ flex: "0 0 20px" }} title="Follow up">⚑</div>
                </div>
                <div className="view-body">
                  {messages.length === 0 && <div className="view-empty">No documents in this view.</div>}
                  {groups
                    ? groups.map((g) => {
                        const isCollapsed = collapsed.has(g.label);
                        return (
                          <div key={g.label}>
                            <div className="view-group" onClick={() => toggleGroup(g.label)}>
                              <span className="nav-twistie">{isCollapsed ? "▶" : "▼"}</span>
                              <span className="view-group-label">{g.label}</span>
                              <span className="view-group-count">({g.items.length})</span>
                            </div>
                            {!isCollapsed && g.items.map(renderRow)}
                          </div>
                        );
                      })
                    : messages.map(renderRow)}
                </div>
              </div>
            </div>

            <Splitter vertical />

            {/* Reading pane (below the list, as in Notes 8) */}
            <div className="preview-pane">
              {selected ? (
                <MemoReader msg={selected} isDraft={selected.folder === "drafts"} onEdit={() => editDraft(selected)} />
              ) : (
                <div className="preview-empty">Select a memo to read it.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {rulesOpen && (
        <RulesDialog
          rules={mailRules}
          folders={customFolders}
          onAdd={addRule}
          onDelete={deleteRule}
          onApply={() => {
            const n = applyRules();
            setStatus(
              n === 0
                ? "Rules applied. No messages affected."
                : `Rules applied. ${n} message${n === 1 ? "" : "s"} affected.`,
            );
          }}
          onClose={() => setRulesOpen(false)}
        />
      )}
    </div>
  );
}

// --- Reading pane -----------------------------------------------------------
function MemoReader({ msg, isDraft, onEdit }: { msg: MailMessage; isDraft: boolean; onEdit: () => void }) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <div className="form memo-reader">
      <div className="memo-head">
        <div className="memo-avatar">{initials(msg.from.name)}</div>
        <div className="memo-headlines">
          <div className="memo-subject">
            {msg.priority === "high" && <span className="prio-high">❗ </span>}
            {msg.subject}
          </div>
          <div className="memo-line">
            <b>{msg.from.name}</b>{" "}
            <span className="muted">to {peopleStr(msg.to) || "—"}</span>
            <span className="memo-date">{fmtDateTime(msg.date)}</span>
            <a
              className="memo-details-toggle"
              onClick={(e) => {
                e.preventDefault();
                setShowDetails((s) => !s);
              }}
            >
              {showDetails ? "Hide Details" : "Show Details"}
            </a>
          </div>
          {showDetails && (
            <div className="memo-details">
              <div className="memo-line muted">From: {msg.from.name} &lt;{msg.from.email}&gt;</div>
              <div className="memo-line muted">To: {peopleStr(msg.to) || "—"}</div>
              {msg.cc.length > 0 && <div className="memo-line muted">Cc: {peopleStr(msg.cc)}</div>}
              <div className="memo-line muted">Date: {fmtDateTime(msg.date)}</div>
              <div className="memo-line muted">
                Importance: {msg.priority[0].toUpperCase() + msg.priority.slice(1)}
              </div>
              <div className="memo-line muted">
                Custom expiration date: {fmtDateTime(msg.date + 365 * 86400000)}
              </div>
            </div>
          )}
        </div>
        {isDraft && <button className="btn" onClick={onEdit}>Edit Draft</button>}
      </div>
      {msg.attachments && msg.attachments.length > 0 && (
        <div className="memo-attachments">
          {msg.attachments.map((a, i) => (
            <a key={i} className="attach-chip" href={a.dataUrl} download={a.name} title={`${a.name} (${fmtBytes(a.size)})`}>
              📎 <span className="attach-name">{a.name}</span>
              <span className="attach-size">{fmtBytes(a.size)}</span>
            </a>
          ))}
        </div>
      )}
      {msg.bodyHtml ? (
        <div className="memo-body" dangerouslySetInnerHTML={{ __html: msg.bodyHtml }} />
      ) : (
        <div className="memo-body">{msg.body}</div>
      )}
    </div>
  );
}

// --- Compose form -----------------------------------------------------------
function ComposeForm({
  compose,
  setCompose,
  onSend,
  onSave,
  onCancel,
}: {
  compose: Compose;
  setCompose: (c: Compose) => void;
  onSend: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<Compose>) => setCompose({ ...compose, ...patch });
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Seed the rich-text editor once for this compose session (keyed remount).
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = compose.bodyHtml || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd);
    if (editorRef.current) set({ bodyHtml: editorRef.current.innerHTML });
  };

  const onPickFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const readers = Array.from(files).map(
      (f) =>
        new Promise<Attachment>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve({ name: f.name, type: f.type || "application/octet-stream", size: f.size, dataUrl: String(r.result) });
          r.readAsDataURL(f);
        }),
    );
    Promise.all(readers).then((added) => set({ attachments: [...compose.attachments, ...added] }));
  };

  return (
    <div className="compose-pane">
      <div className="compose-actions">
        <button className="btn primary" onClick={onSend}>📨 Send</button>
        <button className="btn" onClick={onSave}>💾 Save as Draft</button>
        <span style={{ flex: 1 }} />
        <label className="compose-prio">
          Priority:&nbsp;
          <select value={compose.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>
        <button className="btn" onClick={onCancel}>✕ Discard</button>
      </div>
      <div className="compose-fields">
        <div className="cf-row">
          <label>To</label>
          <input type="text" value={compose.to} placeholder="name@acme.example.com, …"
            onChange={(e) => set({ to: e.target.value })} />
        </div>
        <div className="cf-row">
          <label>cc</label>
          <input type="text" value={compose.cc} onChange={(e) => set({ cc: e.target.value })} />
        </div>
        <div className="cf-row">
          <label>Subject</label>
          <input type="text" value={compose.subject} onChange={(e) => set({ subject: e.target.value })} />
        </div>
      </div>

      {/* Formatting + attach toolbar */}
      <div className="compose-format">
        <button className="fmt-btn" title="Bold" onMouseDown={(e) => { e.preventDefault(); exec("bold"); }}><b>B</b></button>
        <button className="fmt-btn" title="Italic" onMouseDown={(e) => { e.preventDefault(); exec("italic"); }}><i>I</i></button>
        <button className="fmt-btn" title="Underline" onMouseDown={(e) => { e.preventDefault(); exec("underline"); }}><u>U</u></button>
        <span className="fmt-sep" />
        <button className="fmt-btn" title="Bulleted list" onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }}>• ☰</button>
        <button className="fmt-btn" title="Numbered list" onMouseDown={(e) => { e.preventDefault(); exec("insertOrderedList"); }}>1. ☰</button>
        <span className="fmt-sep" />
        <button className="fmt-btn" title="Attach file" onClick={() => fileRef.current?.click()}>📎 Attach</button>
        <input ref={fileRef} type="file" multiple style={{ display: "none" }}
          onChange={(e) => { onPickFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {compose.attachments.length > 0 && (
        <div className="compose-attachments">
          {compose.attachments.map((a, i) => (
            <span key={i} className="attach-chip">
              📎 <span className="attach-name">{a.name}</span>
              <span className="attach-size">{fmtBytes(a.size)}</span>
              <span className="attach-x" title="Remove"
                onClick={() => set({ attachments: compose.attachments.filter((_, j) => j !== i) })}>✕</span>
            </span>
          ))}
        </div>
      )}

      <div
        ref={editorRef}
        className="memo-body compose-body"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Type your message…"
        onInput={(e) => set({ bodyHtml: (e.target as HTMLDivElement).innerHTML })}
      />
    </div>
  );
}

// --- Rules dialog -----------------------------------------------------------
function RulesDialog({
  rules,
  folders,
  onAdd,
  onDelete,
  onApply,
  onClose,
}: {
  rules: MailRule[];
  folders: CustomFolder[];
  onAdd: (r: MailRule) => void;
  onDelete: (id: string) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const [field, setField] = useState<MailRule["field"]>("from");
  const [contains, setContains] = useState("");
  const [action, setAction] = useState<MailRule["action"]>("move");
  const [folderId, setFolderId] = useState<string>(folders[0]?.id ?? "");
  const [flagColor, setFlagColor] = useState<FlagColor>("yellow");

  const fieldLabel = (f: MailRule["field"]) =>
    f === "from" ? "From" : f === "subject" ? "Subject" : "Body";
  const folderName = (id?: string) => folders.find((f) => f.id === id)?.name ?? "(deleted folder)";

  function add() {
    const text = contains.trim();
    if (!text) return;
    if (action === "move" && !folderId) return;
    const rule: MailRule =
      action === "move"
        ? { id: uid(), field, contains: text, action: "move", folderId }
        : { id: uid(), field, contains: text, action: "flag", flagColor };
    onAdd(rule);
    setContains("");
  }

  return (
    <Dialog
      title="Mail Rules"
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="btn" onClick={onApply}>Apply Rules Now</button>
          <button className="btn" onClick={onClose}>Close</button>
        </>
      }
    >
      <div className="rules-list">
        {rules.length === 0 && <div className="rules-empty">No rules defined yet.</div>}
        {rules.map((r) => (
          <div key={r.id} className="rule-row">
            <span className="rule-text">
              When <b>{fieldLabel(r.field)}</b> contains <b>“{r.contains}”</b>
              {r.action === "move" ? (
                <> → file in <b>{folderName(r.folderId)}</b></>
              ) : (
                <> → flag <b>{r.flagColor ?? "yellow"}</b></>
              )}
            </span>
            <button className="btn rule-del" title="Delete rule" onClick={() => onDelete(r.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="rule-form">
        <div className="rule-form-row">
          <span>When</span>
          <select value={field} onChange={(e) => setField(e.target.value as MailRule["field"])}>
            <option value="from">From</option>
            <option value="subject">Subject</option>
            <option value="body">Body</option>
          </select>
          <span>contains</span>
          <input
            type="text"
            className="bevel-field"
            placeholder="text to match…"
            value={contains}
            onChange={(e) => setContains(e.target.value)}
          />
        </div>
        <div className="rule-form-row">
          <span>then</span>
          <select value={action} onChange={(e) => setAction(e.target.value as MailRule["action"])}>
            <option value="move">Move to folder</option>
            <option value="flag">Flag</option>
          </select>
          {action === "move" ? (
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              disabled={folders.length === 0}
            >
              {folders.length === 0 && <option value="">(no folders)</option>}
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          ) : (
            <select value={flagColor} onChange={(e) => setFlagColor(e.target.value as FlagColor)}>
              {FLAG_COLORS.map((c) => (
                <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          )}
          <button
            className="btn primary"
            onClick={add}
            disabled={!contains.trim() || (action === "move" && !folderId)}
          >
            Add Rule
          </button>
        </div>
      </div>
    </Dialog>
  );
}
