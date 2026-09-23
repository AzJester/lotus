// ============================================================================
// Mail: the mail database view. Navigator (Inbox, Drafts, Sent, Follow Up,
// All Documents, Junk, Trash, Chat History, folders, tools) beside a Notes
// view with the selection margin, date categories, sortable columns, the
// replied / forwarded / attachment / follow-up icon columns, and a preview
// pane (View > Document Preview). Memos open in their own window; Delete
// marks documents, and F9 or leaving the folder asks to delete them.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionBar } from "../../components/ActionBar";
import type { ActionItem } from "../../components/ActionBar";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { NotesView } from "../../components/NotesView";
import type { ViewColumn } from "../../components/NotesView";
import { notesAsk, notesPrompt } from "../../components/dialogs";
import { openContextMenu } from "../../components/menu";
import type { MenuItem } from "../../components/menu";
import { Splitter } from "../../components/Splitter";
import { useTab, useTabCommands } from "../../components/tabs";
import { useNotes, isOnline } from "../../data/store";
import { registerCloseGuard, useUI } from "../../data/ui";
import type { MailMessage } from "../../data/types";
import { commonName } from "../../data/names";
import { fmtListDate } from "../../lib/format";
import { MAIL_SERVER } from "../../data/directory";
import { openDocumentProperties } from "../../shell/dialogs/Properties";
import { openOutOfOffice } from "../../shell/dialogs/Preferences";
import { DRAG_DOC } from "../../shell/BookmarkBar";
import { MemoReader } from "./Memo";
import { dateCategory, dateCategoryOrder, hasAttachment, rawBytes, sizeLabel } from "./mailHelpers";
import { rulesDialog } from "./mailDialogs";
import {
  copyDocLink,
  copyIntoAction,
  fileInFolder,
  followUp,
  followUpAction,
  forward,
  noticeActions,
  removeFromFolder,
  reply,
  replyActions,
  resend,
} from "./mailActions";
import "../../styles/mail.css";

type NavKey = "inbox" | "drafts" | "sent" | "followup" | "all" | "junk" | "trash" | "chat" | `label:${string}`;

const NAV: { key: NavKey; label: string; icon: IconName }[] = [
  { key: "inbox", label: "Inbox", icon: "inbox" },
  { key: "drafts", label: "Drafts", icon: "drafts" },
  { key: "sent", label: "Sent", icon: "sent" },
  { key: "followup", label: "Follow Up", icon: "follow-up" },
  { key: "all", label: "All Documents", icon: "all-documents" },
  { key: "junk", label: "Junk", icon: "junk" },
  { key: "trash", label: "Trash", icon: "trash" },
  { key: "chat", label: "Chat History", icon: "chat-history" },
];

export const FLAG_TINT: Record<string, string> = {
  red: "#d00000",
  orange: "#ff8000",
  yellow: "#e8c000",
  green: "#00a000",
  blue: "#2060ff",
  purple: "#9030c0",
};

function inView(m: MailMessage, nav: NavKey): boolean {
  if (nav === "followup") return m.flagged && m.folder !== "trash";
  if (nav === "all") return m.folder !== "trash" && m.folder !== "chat" && m.folder !== "junk";
  if (nav.startsWith("label:")) return m.folder !== "trash" && (m.labels?.includes(nav.slice(6)) ?? false);
  return m.folder === nav;
}

export default function Mail() {
  const { tab, active } = useTab();
  const mail = useNotes((s) => s.mail);
  const user = useNotes((s) => s.user);
  const customFolders = useNotes((s) => s.customFolders);
  const deleteMails = useNotes((s) => s.deleteMails);
  const markReadMany = useNotes((s) => s.markReadMany);
  const markRead = useNotes((s) => s.markRead);
  const emptyTrash = useNotes((s) => s.emptyTrash);
  const addFolder = useNotes((s) => s.addFolder);
  const renameFolder = useNotes((s) => s.renameFolder);
  const deleteFolder = useNotes((s) => s.deleteFolder);
  const setMailFolderLabel = useNotes((s) => s.setMailFolderLabel);
  const setStatus = useUI((s) => s.setStatus);
  const openDocument = useUI((s) => s.openDocument);
  const openView = useUI((s) => s.openView);
  const preview = useUI((s) => s.uiPrefs.preview);
  const viewKey = "mail";
  const sortPref = useUI((s) => s.viewPrefs[viewKey]?.sort);

  const [nav, setNav] = useState<NavKey>("inbox");
  const [caret, setCaret] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(true);

  const showsRecipient = nav === "sent" || nav === "drafts";
  const docs = useMemo(() => {
    let list = mail.filter((m) => inView(m, nav));
    if (applied) {
      const q = applied.toLowerCase();
      list = list.filter(
        (m) =>
          m.subject.toLowerCase().includes(q) ||
          m.body.toLowerCase().includes(q) ||
          m.from.name.toLowerCase().includes(q) ||
          m.to.some((p) => p.name.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [mail, nav, applied]);

  const selected = mail.find((m) => m.id === selectedId) ?? null;
  const selection = useCallback(
    () => (checked.size ? [...checked] : selectedId ? [selectedId] : []),
    [checked, selectedId],
  );

  const counts = useMemo(() => {
    const c = { inbox: 0, drafts: 0, followup: 0, junk: 0 };
    for (const m of mail) {
      if (m.folder === "inbox" && !m.read) c.inbox++;
      if (m.folder === "drafts") c.drafts++;
      if (m.flagged && m.folder !== "trash") c.followup++;
      if (m.folder === "junk" && !m.read) c.junk++;
    }
    return c;
  }, [mail]);

  const folderCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of mail) {
      if (m.folder === "trash") continue;
      for (const l of m.labels ?? []) out[l] = (out[l] ?? 0) + 1;
    }
    return out;
  }, [mail]);

  // ---- deletion marks ------------------------------------------------------
  const markForDeletion = (ids: string[]) => {
    if (!ids.length) return;
    setMarked((prev) => {
      const next = new Set(prev);
      const allMarked = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allMarked) next.delete(id);
        else next.add(id);
      }
      setStatus(
        allMarked
          ? "Deletion mark removed."
          : `${ids.length} document${ids.length === 1 ? "" : "s"} marked for deletion. Press F9 to delete.`,
      );
      return next;
    });
    setChecked(new Set());
  };

  /** F9 / leaving the folder: ask, then delete what is marked. */
  const processDeletions = async (): Promise<void> => {
    const ids = [...marked].filter((id) => useNotes.getState().mail.some((m) => m.id === id));
    if (!ids.length) return;
    const inTrash = nav === "trash";
    const ok = await notesAsk(
      inTrash
        ? `Permanently delete ${ids.length} document${ids.length === 1 ? "" : "s"} marked for deletion?`
        : `Delete ${ids.length} document${ids.length === 1 ? "" : "s"} marked for deletion? They will be moved to the Trash.`,
      { title: "Delete Documents" },
    );
    if (ok) {
      deleteMails(ids);
      setStatus(inTrash ? `${ids.length} document(s) deleted.` : `${ids.length} document(s) moved to Trash.`);
      if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    }
    setMarked(new Set());
  };

  const refresh = () => {
    void processDeletions().then(() => setStatus("View refreshed."));
  };

  const goNav = async (key: NavKey) => {
    if (key === nav) return;
    await processDeletions();
    setNav(key);
    setCaret(null);
    setSelectedId(null);
    setChecked(new Set());
  };

  // Closing the Mail window with marked documents asks first, too.
  useEffect(() =>
    registerCloseGuard(tab.id, {
      isDirty: () => false,
      confirmClose: async () => {
        await processDeletions();
        return true;
      },
    }),
  );

  // Reading a memo in the preview pane for a moment marks it read, as Notes does.
  useEffect(() => {
    if (!active || preview === "off" || !selectedId) return;
    const m = useNotes.getState().mail.find((x) => x.id === selectedId);
    if (!m || m.read) return;
    const t = window.setTimeout(() => markRead(selectedId, true), 1500);
    return () => window.clearTimeout(t);
  }, [active, selectedId, preview, markRead]);

  const toggleUnread = (m: MailMessage) => {
    markRead(m.id, !m.read);
    setStatus(m.read ? "Marked unread." : "Marked read.");
  };

  const markReadCmd = (read: boolean, scope: "selected" | "all") => {
    const ids = scope === "all" ? docs.map((d) => d.id) : selection();
    markReadMany(ids, read);
    setStatus(`${ids.length} document${ids.length === 1 ? "" : "s"} marked ${read ? "read" : "unread"}.`);
  };

  const openMemo = (m: MailMessage) => openDocument({ coll: "mail", id: m.id }, { title: m.subject || "(No subject)" });

  useTabCommands("mail", {
    refresh,
    deleteSelected: () => markForDeletion(selection()),
    markRead: markReadCmd,
    searchBar: () => setSearchOpen((o) => !o),
    copyAsLink: selected ? () => copyDocLink(selected) : undefined,
    properties: selected ? () => void openDocumentProperties("mail", selected.id) : undefined,
  });

  // ---- columns --------------------------------------------------------------
  const columns: ViewColumn<MailMessage>[] = useMemo(
    () => [
      {
        id: "importance",
        title: "",
        headerIcon: "importance",
        icon: true,
        sortable: true,
        sortValue: (m) => (m.priority === "high" ? 0 : m.priority === "normal" ? 1 : 2),
        render: (m) => (m.priority === "high" ? <Icon name="importance" /> : null),
      },
      {
        id: "who",
        title: showsRecipient ? "Recipient" : "Who",
        width: 160,
        sortable: true,
        sortValue: (m) => (showsRecipient ? m.to.map(commonName).join(", ") : commonName(m.from)).toLowerCase(),
        text: (m) => (showsRecipient ? m.to.map(commonName).join(", ") : commonName(m.from)),
        render: (m) => (showsRecipient ? m.to.map(commonName).join(", ") || "(none)" : commonName(m.from)),
      },
      {
        id: "subject",
        title: "Subject",
        flex: true,
        minWidth: 200,
        sortable: true,
        sortValue: (m) => m.subject.toLowerCase(),
        text: (m) => m.subject,
        render: (m) => (
          <span className="mail-subject">
            {m.form === "Notice" && <Icon name="invitation" />}
            {m.form === "DeliveryReport" && <Icon name="error" />}
            {m.conflictOf ? "[Replication or Save Conflict]" : m.subject || "(No subject)"}
          </span>
        ),
      },
      {
        id: "date",
        title: "Date",
        width: 110,
        sortable: true,
        sortValue: (m) => m.date,
        render: (m) => fmtListDate(m.date),
      },
      {
        id: "size",
        title: "Size",
        width: 58,
        align: "right",
        sortable: true,
        sortValue: (m) => rawBytes(m),
        render: (m) => sizeLabel(m),
      },
      {
        id: "attach",
        title: "",
        headerIcon: "attachment",
        icon: true,
        render: (m) => (hasAttachment(m) ? <Icon name="attachment" /> : null),
      },
      {
        id: "replied",
        title: "",
        headerIcon: "replied",
        icon: true,
        render: (m) => (m.forwardedAt ? <Icon name="forwarded" /> : m.repliedAt ? <Icon name="replied" /> : null),
      },
      {
        id: "flag",
        title: "",
        headerIcon: "follow-up",
        icon: true,
        sortable: true,
        sortValue: (m) => (m.flagged ? 0 : 1),
        render: (m) => (m.flagged ? <Icon name="follow-up" tint={FLAG_TINT[m.flagColor ?? "yellow"]} /> : null),
      },
    ],
    [showsRecipient],
  );

  const sortCol = sortPref?.col ?? "date";
  const sortDir = sortPref?.dir ?? -1;
  const categorized = sortCol === "date";
  const folderLabel = nav.startsWith("label:") ? nav.slice(6) : null;

  const rowMenu = (m: MailMessage | null): MenuItem[] => {
    if (!m) return [{ label: "&New Memo", run: () => useUI.getState().requestMemo("") }];
    const ids = checked.has(m.id) ? [...checked] : [m.id];
    return [
      { label: "&Open", run: () => openMemo(m) },
      { sep: true },
      { label: "&Reply", run: () => reply(m, false, "plain") },
      { label: "Reply with &History", run: () => reply(m, false, "history") },
      { label: "Reply to &All", run: () => reply(m, true, "plain") },
      { label: "&Forward", run: () => forward(m) },
      { sep: true },
      { label: "Copy as &Link", children: [{ label: "&Document Link", run: () => copyDocLink(m) }] },
      { label: "&Move to Folder...", run: () => void fileInFolder(ids) },
      ...(folderLabel ? [{ label: "Remove from &Folder", run: () => removeFromFolder(ids, folderLabel) }] : []),
      { sep: true },
      { label: m.read ? "Mark &Unread" : "Mark R&ead", run: () => markReadMany(ids, !m.read) },
      {
        label: "Follow &Up",
        children: [
          ...(["red", "orange", "yellow", "green", "blue", "purple"] as const).map((c) => ({
            label: c[0].toUpperCase() + c.slice(1),
            run: () => followUp(ids, c),
          })),
          { sep: true },
          { label: "Clear", run: () => followUp(ids, null) },
        ],
      },
      { sep: true },
      { label: "&Delete", accel: "Del", run: () => markForDeletion(ids) },
      { label: "Document &Properties...", accel: "Alt+Enter", run: () => void openDocumentProperties("mail", m.id) },
    ];
  };

  const ids = selection();
  const actions: ActionItem[] = [
    { id: "new", label: "New Memo", icon: "new-memo", run: () => useUI.getState().requestMemo(""), accel: "Ctrl+M" },
    "sep",
    ...replyActions(selected),
    "sep",
    followUpAction(ids),
    { id: "delete", label: "Delete", icon: "trash", disabled: !ids.length, run: () => markForDeletion(ids), accel: "Del" },
    "sep",
    copyIntoAction(selected),
    {
      id: "folder",
      label: "Folder",
      icon: "move-to-folder",
      disabled: !ids.length,
      children: [
        { id: "mv", label: "Move to Folder...", run: () => void fileInFolder(ids) },
        ...(folderLabel ? [{ id: "rm", label: "Remove from Folder", run: () => removeFromFolder(ids, folderLabel) }] : []),
      ],
    },
    {
      id: "tools",
      label: "Tools",
      icon: "tools",
      children: [
        { id: "rules", label: "Rules...", run: () => void rulesDialog() },
        { id: "ooo", label: "Out of Office...", run: () => void openOutOfOffice() },
      ],
    },
    ...(nav === "trash"
      ? [
          "sep" as const,
          {
            id: "empty",
            label: "Empty Trash",
            icon: "trash" as const,
            run: async () => {
              if (await notesAsk("Permanently delete everything in the Trash?", { icon: "warning" })) {
                emptyTrash();
                setSelectedId(null);
                setStatus("Trash emptied.");
              }
            },
          },
        ]
      : []),
    ...(selected?.failure ? ["sep" as const, { id: "resend", label: "Resend", icon: "send" as const, run: () => resend(selected) }] : []),
    ...noticeActions(selected),
  ];

  const newFolder = async () => {
    const name = await notesPrompt("Folder name:", { title: "Create Folder" });
    if (name?.trim()) {
      const id = addFolder(name.trim());
      void goNav(`label:${id}`);
    }
  };

  const view = (
    <div className="list-pane mail-list">
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
          <span className="search-indexed">
            <Icon name="info" /> Indexed
          </span>
          {applied && (
            <span className="search-result">
              {docs.length} document{docs.length === 1 ? "" : "s"} found
            </span>
          )}
        </div>
      )}
      <NotesView
        viewKey={viewKey}
        docs={docs}
        getId={(m) => m.id}
        columns={columns}
        defaultSort={{ col: "date", dir: -1 }}
        categorize={categorized ? (m) => dateCategory(m.date) : undefined}
        categoryOrder={categorized ? dateCategoryOrder(sortDir) : undefined}
        parentOf={(m) => m.conflictOf}
        isUnread={(m) => !m.read && m.folder !== "sent" && m.folder !== "drafts"}
        rowClass={(m) => (m.flagged ? "flag-" + (m.flagColor ?? "yellow") : undefined)}
        caret={caret}
        onCaret={(key, m) => {
          setCaret(key);
          setSelectedId(m ? m.id : null);
        }}
        checked={checked}
        onChecked={setChecked}
        marked={marked}
        onOpen={openMemo}
        onToggleUnread={toggleUnread}
        onDelete={markForDeletion}
        onRefresh={refresh}
        onContextMenu={(e, m) => openContextMenu(e, rowMenu(m))}
        onDragStart={(e, m) => {
          e.dataTransfer.setData("text/plain", m.id);
          e.dataTransfer.setData(DRAG_DOC, JSON.stringify({ coll: "mail", id: m.id, title: m.subject }));
          e.dataTransfer.effectAllowed = "copyMove";
        }}
        emptyText="There are no documents in this view."
        autoFocus
      />
    </div>
  );

  return (
    <div className="app mail-app">
      <ActionBar actions={actions} />
      <div className="app-cols">
        <div className="nav-pane mail-nav">
          <div className="nav-title mail-nav-title">
            <span>{user.name}</span>
            <span className="nav-sub-label">on {isOnline(user.location) ? MAIL_SERVER : "Local"}</span>
          </div>
          <div className="nav-group">
            {NAV.map((f) => {
              const count =
                f.key === "inbox"
                  ? counts.inbox
                  : f.key === "drafts"
                    ? counts.drafts
                    : f.key === "followup"
                      ? counts.followup
                      : f.key === "junk"
                        ? counts.junk
                        : 0;
              return (
                <div key={f.key} className={"nav-item" + (nav === f.key ? " active" : "")} onClick={() => void goNav(f.key)}>
                  <span className="nav-ic">
                    <Icon name={f.icon} />
                  </span>
                  <span className={"nav-label" + (count > 0 ? " has-count" : "")}>
                    {f.label}
                    {count > 0 ? ` (${count})` : ""}
                  </span>
                </div>
              );
            })}
            <div className="nav-item" onClick={() => openView("calendar")}>
              <span className="nav-ic">
                <Icon name="calendar" />
              </span>
              <span className="nav-label">Calendar</span>
            </div>
            <div className="nav-item" onClick={() => openView("todo")}>
              <span className="nav-ic">
                <Icon name="todo" />
              </span>
              <span className="nav-label">To Do</span>
            </div>

            <div
              className="nav-item nav-folders-head"
              onContextMenu={(e) => openContextMenu(e, [{ label: "&New Folder...", run: () => void newFolder() }])}
            >
              <span className="nav-ic">
                <Icon name="folder-open" />
              </span>
              <span className="nav-label">Folders</span>
              <span
                className="nav-folder-add"
                title="Create a folder"
                onClick={(e) => {
                  e.stopPropagation();
                  void newFolder();
                }}
              >
                +
              </span>
            </div>
            {customFolders.length === 0 && (
              <div className="nav-item nav-indent">
                <span className="nav-label muted">(no folders)</span>
              </div>
            )}
            {customFolders.map((f) => {
              const key: NavKey = `label:${f.id}`;
              const count = folderCounts[f.id] ?? 0;
              return (
                <div
                  key={f.id}
                  className={"nav-item nav-indent nav-folder" + (nav === key ? " active" : "") + (dropTarget === f.id ? " drop-target" : "")}
                  onClick={() => void goNav(key)}
                  onContextMenu={(e) =>
                    openContextMenu(e, [
                      {
                        label: "&Rename Folder...",
                        run: async () => {
                          const name = await notesPrompt("Folder name:", { title: "Rename Folder", value: f.name });
                          if (name?.trim()) renameFolder(f.id, name.trim());
                        },
                      },
                      {
                        label: "&Delete Folder",
                        run: async () => {
                          if (await notesAsk(`Delete the folder "${f.name}"? The memos in it stay in your mail file.`)) {
                            deleteFolder(f.id);
                            if (nav === key) void goNav("inbox");
                          }
                        },
                      },
                    ])
                  }
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dropTarget !== f.id) setDropTarget(f.id);
                  }}
                  onDragLeave={() => setDropTarget((t) => (t === f.id ? null : t))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropTarget(null);
                    const id = e.dataTransfer.getData("text/plain");
                    const moving = checked.has(id) ? [...checked] : id ? [id] : [];
                    for (const mid of moving) setMailFolderLabel(mid, f.id, true);
                    if (moving.length) setStatus(`${moving.length} document${moving.length === 1 ? "" : "s"} moved to folder "${f.name}".`);
                  }}
                >
                  <span className="nav-ic">
                    <Icon name="folder" />
                  </span>
                  <span className={"nav-label" + (count > 0 ? " has-count" : "")}>
                    {f.name}
                    {count > 0 ? ` (${count})` : ""}
                  </span>
                </div>
              );
            })}

            <div className="nav-item" onClick={() => setToolsOpen((o) => !o)}>
              <span className="nav-ic">
                <Icon name={toolsOpen ? "twistie-down" : "twistie-right"} />
              </span>
              <span className="nav-label">Tools</span>
            </div>
            {toolsOpen && (
              <>
                <div className="nav-item nav-indent" onClick={() => void rulesDialog()}>
                  <span className="nav-ic">
                    <Icon name="rules" />
                  </span>
                  <span className="nav-label">Rules</span>
                </div>
                <div className="nav-item nav-indent" onClick={() => void openOutOfOffice()}>
                  <span className="nav-ic">
                    <Icon name="location-travel" />
                  </span>
                  <span className="nav-label">Out of Office</span>
                </div>
              </>
            )}
          </div>
        </div>

        <Splitter id="mail.nav" />

        <div className={"mail-stack preview-" + preview}>
          {view}
          {preview !== "off" && (
            <>
              <Splitter vertical={preview === "bottom"} id={preview === "bottom" ? "mail.preview.bottom" : "mail.preview.right"} />
              <div className="preview-pane">
                {selected ? (
                  <div className="memo-scroll">
                    <MemoReader m={selected} compact />
                  </div>
                ) : (
                  <div className="preview-empty">Select a document to preview it.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export { MemoDocument } from "./Memo";
