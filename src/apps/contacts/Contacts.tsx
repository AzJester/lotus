// ============================================================================
// Contacts: the Personal Address Book (names.nsf on Local), laid out like the
// Notes 6/7 Contacts database. The navigator switches between the Contacts
// view (with the A-Z index beside it), Contacts by Category and Groups, and
// holds the vCard tools. The preview pane shows the selected contact as a
// business card. Contacts open in their own window (ContactDocument); groups
// are not documents you open in a window, so they open in the Group dialog.
// Delete marks documents, and F9 or leaving the view asks to delete them.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { stampNew } from "../../data/docs";
import { useNotes, uid } from "../../data/store";
import { registerCloseGuard, useUI } from "../../data/ui";
import type { Contact, ContactGroup } from "../../data/types";
import { openDocumentProperties } from "../../shell/dialogs/Properties";
import { DRAG_DOC } from "../../shell/BookmarkBar";
import {
  LETTERS,
  categoriesOf,
  colleagueOf,
  compareContacts,
  displayName,
  groupMembers,
  indexLetter,
  jumpTarget,
  matchesQuery,
  membersOfGroups,
  plural,
  safeFileName,
  vcfFileName,
  viewName,
} from "./pab";
import {
  chatWith,
  copyContactLink,
  copyInto,
  exportContacts,
  importVCardFile,
  writeMemoTo,
  writeMemoToGroups,
} from "./pabActions";
import type { CopyTarget } from "./pabActions";
import { addToGroupDialog, exportDialog, groupDialog } from "./pabDialogs";
import { BusinessCard, GroupCard, Presence } from "./BusinessCard";
import "../../styles/contacts.css";

type NavKey = "contacts" | "category" | "groups";

const NAV: { key: NavKey; label: string; icon: IconName }[] = [
  { key: "contacts", label: "Contacts", icon: "person" },
  { key: "category", label: "Contacts by Category", icon: "tag" },
  { key: "groups", label: "Groups", icon: "group" },
];

const NOT_CATEGORIZED = "(Not Categorized)";

const contactId = (c: Contact) => c.id;
const groupId = (g: ContactGroup) => g.id;
const categorizeContact = (c: Contact) => {
  const cats = categoriesOf(c);
  return cats.length ? cats : "";
};

const CONTACT_COLUMNS: ViewColumn<Contact>[] = [
  {
    id: "name",
    title: "Name",
    width: 180,
    sortable: true,
    sortValue: (c) => viewName(c).toLowerCase(),
    text: viewName,
    render: (c) => {
      const colleague = colleagueOf(c);
      return (
        <span className="pab-name">
          {colleague && <Presence name={colleague.name} />}
          <span>{viewName(c)}</span>
        </span>
      );
    },
  },
  {
    id: "email",
    title: "E-mail",
    width: 230,
    sortable: true,
    sortValue: (c) => c.email.toLowerCase(),
    render: (c) => c.email,
  },
  {
    id: "phone",
    title: "Business Phone",
    width: 120,
    sortable: true,
    sortValue: (c) => c.workPhone,
    render: (c) => c.workPhone,
  },
  {
    id: "company",
    title: "Company",
    flex: true,
    minWidth: 140,
    sortable: true,
    sortValue: (c) => c.company.toLowerCase(),
    render: (c) => c.company,
  },
];

const COPY_TARGETS: { id: CopyTarget; label: string }[] = [
  { id: "memo", label: "Memo" },
  { id: "calendar", label: "Calendar Entry" },
  { id: "todo", label: "To Do" },
];

/** The A-Z index down the right side of the Contacts view. */
function LetterIndex({
  contacts,
  current,
  onJump,
}: {
  contacts: Contact[];
  current: string | null;
  onJump: (letter: string) => void;
}) {
  const have = useMemo(() => new Set(contacts.map(indexLetter)), [contacts]);
  return (
    <div className="pab-index" role="navigation" aria-label="Go to names starting with a letter">
      {LETTERS.map((l) => (
        <button
          key={l}
          type="button"
          tabIndex={-1}
          className={"pab-index-l" + (have.has(l) ? " on" : "") + (current === l ? " current" : "")}
          title={have.has(l) ? `Go to names starting with ${l}` : `No names start with ${l}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onJump(l)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export default function Contacts() {
  const { tab } = useTab();
  const contacts = useNotes((s) => s.contacts);
  const groups = useNotes((s) => s.contactGroups);
  const dbTitle = useNotes((s) => s.databases.find((d) => d.id === "contacts")?.title ?? "Personal Address Book");
  const setStatus = useUI((s) => s.setStatus);
  const openDocument = useUI((s) => s.openDocument);
  const preview = useUI((s) => s.uiPrefs.preview);

  const [nav, setNav] = useState<NavKey>("contacts");
  const [caret, setCaret] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [toolsOpen, setToolsOpen] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isGroups = nav === "groups";

  const shownContacts = useMemo(
    () => (applied ? contacts.filter((c) => matchesQuery(c, applied)) : contacts),
    [contacts, applied],
  );
  const shownGroups = useMemo(() => {
    if (!applied) return groups;
    const q = applied.toLowerCase();
    return groups.filter(
      (g) => g.name.toLowerCase().includes(q) || groupMembers(g, contacts).some((c) => matchesQuery(c, applied)),
    );
  }, [groups, contacts, applied]);

  const groupColumns = useMemo<ViewColumn<ContactGroup>[]>(
    () => [
      {
        id: "name",
        title: "Group Name",
        width: 200,
        sortable: true,
        sortValue: (g) => g.name.toLowerCase(),
        text: (g) => g.name,
        render: (g) => (
          <span className="pab-name">
            <Icon name="group" />
            <span>{g.name}</span>
          </span>
        ),
      },
      {
        id: "count",
        title: "Members",
        width: 70,
        align: "right",
        sortable: true,
        sortValue: (g) => groupMembers(g, contacts).length,
        render: (g) => groupMembers(g, contacts).length,
      },
      {
        id: "members",
        title: "Member List",
        flex: true,
        minWidth: 200,
        render: (g) => groupMembers(g, contacts).map(displayName).join(", "),
      },
    ],
    [contacts],
  );

  const selectedContact = isGroups ? null : contacts.find((c) => c.id === selectedId) ?? null;
  const selectedGroup = isGroups ? groups.find((g) => g.id === selectedId) ?? null : null;

  const selectionIds = useCallback(
    () => (checked.size ? [...checked] : selectedId ? [selectedId] : []),
    [checked, selectedId],
  );
  const selContacts = (): Contact[] => {
    if (isGroups) return [];
    const ids = new Set(selectionIds());
    return contacts.filter((c) => ids.has(c.id)).sort(compareContacts);
  };
  const selGroups = (): ContactGroup[] => {
    if (!isGroups) return [];
    const ids = new Set(selectionIds());
    return groups.filter((g) => ids.has(g.id));
  };
  const selC = selContacts();
  const selG = selGroups();
  const chatTarget = selC.length === 1 ? selC[0] : null;

  // ---- deletion marks ------------------------------------------------------
  /** Delete marks documents (or clears the marks when they all have one). */
  const markForDeletion = (ids: string[]) => {
    if (!ids.length) return;
    const allMarked = ids.every((id) => marked.has(id));
    const next = new Set(marked);
    for (const id of ids) {
      if (allMarked) next.delete(id);
      else next.add(id);
    }
    setMarked(next);
    setChecked(new Set());
    setStatus(
      allMarked ? "Deletion mark removed." : `${plural(ids.length, "document")} marked for deletion. Press F9 to delete.`,
    );
  };

  /** F9 / leaving the view: ask, then delete what is marked. Resolves true when something was deleted. */
  const processDeletions = async (): Promise<boolean> => {
    if (!marked.size) return false;
    const s = useNotes.getState();
    const contactIds = s.contacts.filter((c) => marked.has(c.id)).map((c) => c.id);
    const groupIds = s.contactGroups.filter((g) => marked.has(g.id)).map((g) => g.id);
    const n = contactIds.length + groupIds.length;
    let deleted = false;
    if (n) {
      const ok = await notesAsk(`Delete ${plural(n, "document")} marked for deletion?`, { title: "Delete Documents" });
      if (ok) {
        for (const id of contactIds) s.deleteContact(id);
        for (const id of groupIds) s.deleteGroup(id);
        setStatus(`${plural(n, "document")} deleted.`);
        if (selectedId && marked.has(selectedId)) setSelectedId(null);
        deleted = true;
      }
    }
    setMarked(new Set());
    return deleted;
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

  // Closing the Address Book with marked documents asks first, too.
  useEffect(() =>
    registerCloseGuard(tab.id, {
      isDirty: () => false,
      confirmClose: async () => {
        await processDeletions();
        return true;
      },
    }),
  );

  // ---- documents and groups -----------------------------------------------
  const openContact = (c: Contact) => openDocument({ coll: "contacts", id: c.id }, { title: displayName(c) });

  /** In Contacts by Category, the category of the current row (for New Contact). */
  const caretCategory = (): string => {
    if (nav !== "category" || !caret) return "";
    const cat = caret.startsWith("cat:") ? caret.slice(4) : caret.includes("|") ? caret.slice(0, caret.lastIndexOf("|")) : "";
    return cat === NOT_CATEGORIZED ? "" : cat;
  };

  const newContact = () => {
    const category = caretCategory();
    useUI.getState().newDocument("contacts", category ? { category } : {}, { title: "New Contact" });
  };

  const createGroup = async (memberIds: string[]) => {
    const r = await groupDialog({ memberIds });
    if (!r) return;
    const s = useNotes.getState();
    const id = uid();
    s.addGroup(stampNew<ContactGroup>({ id, name: r.name, memberIds: r.memberIds }, s.user.notesName));
    setStatus(`Group "${r.name}" created with ${plural(r.memberIds.length, "member")}.`);
    if (isGroups) {
      setCaret(id);
      setSelectedId(id);
    }
  };

  const newGroup = () => createGroup(isGroups ? [] : selC.map((c) => c.id));

  const editGroup = async (g: ContactGroup) => {
    const r = await groupDialog({ group: g });
    if (!r) return;
    useNotes.getState().updateGroup(g.id, { name: r.name, memberIds: r.memberIds });
    setStatus(`Group "${r.name}" saved with ${plural(r.memberIds.length, "member")}.`);
  };

  const addToGroup = async (list: Contact[], targetId?: string) => {
    if (!list.length) return;
    let id = targetId;
    if (!id) {
      const choice = await addToGroupDialog(list.length);
      if (!choice) return;
      if ("newName" in choice) {
        const s = useNotes.getState();
        s.addGroup(stampNew<ContactGroup>({ id: uid(), name: choice.newName, memberIds: list.map((c) => c.id) }, s.user.notesName));
        setStatus(`Group "${choice.newName}" created with ${plural(list.length, "member")}.`);
        return;
      }
      id = choice.groupId;
    }
    const g = useNotes.getState().contactGroups.find((x) => x.id === id);
    if (!g) return;
    const adding = list.filter((c) => !g.memberIds.includes(c.id));
    if (!adding.length) {
      setStatus(list.length === 1 ? `${displayName(list[0])} is already in "${g.name}".` : `They are all in "${g.name}" already.`);
      return;
    }
    useNotes.getState().updateGroup(g.id, { memberIds: [...g.memberIds, ...adding.map((c) => c.id)] });
    setStatus(`${plural(adding.length, "contact")} added to "${g.name}".`);
  };

  // ---- vCard ---------------------------------------------------------------
  const importVCard = () => fileRef.current?.click();

  const onImportFile = async (file: File) => {
    const ids = await importVCardFile(file);
    if (!ids.length) return;
    if (isGroups) await goNav("contacts");
    setCaret(ids[0]);
    setSelectedId(ids[0]);
  };

  const exportVCard = async () => {
    const pickedGroups = selGroups();
    const selected = isGroups ? membersOfGroups(pickedGroups, contacts) : selContacts();
    const all = [...contacts].sort(compareContacts);
    const choice = await exportDialog({
      selected: selected.length,
      all: all.length,
      selectedLabel: isGroups ? "Members of the selected groups" : "Selected contacts",
      selectedFile:
        isGroups && pickedGroups.length === 1 ? `${safeFileName(pickedGroups[0].name) || "group"}.vcf` : vcfFileName(selected),
      allFile: "contacts.vcf",
    });
    if (choice) exportContacts(choice.scope === "selected" ? selected : all, choice.fileName);
  };

  // ---- the A-Z index -------------------------------------------------------
  const jump = (letter: string) => {
    const target = jumpTarget(letter, shownContacts);
    if (!target) return;
    setCaret(target.id);
    setSelectedId(target.id);
    setChecked(new Set());
    if (indexLetter(target) !== letter) setStatus(`No names start with ${letter}.`);
    listRef.current?.querySelector<HTMLElement>(".nview")?.focus({ preventScroll: true });
  };

  // ---- menus ---------------------------------------------------------------
  const copyIntoItems = (list: Contact[]): ActionItem[] =>
    COPY_TARGETS.map((t) => ({ id: "ci-" + t.id, label: t.label, run: () => copyInto(list, t.id) }));

  const contactMenu = (c: Contact | null): MenuItem[] => {
    if (!c)
      return [
        { label: "New &Contact", run: newContact },
        { label: "New &Group...", run: () => void newGroup() },
        { sep: true },
        { label: "&Import vCard...", run: importVCard },
        { label: "&Export vCard...", run: () => void exportVCard() },
      ];
    const list = checked.has(c.id) ? selContacts() : [c];
    const ids = list.map((x) => x.id);
    const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return [
      { label: "&Open", accel: "Enter", run: () => openContact(c) },
      { sep: true },
      { label: "&Write Memo", run: () => writeMemoTo(list) },
      { label: "C&hat", disabled: list.length !== 1, run: () => chatWith(c) },
      {
        label: "Copy Into &New",
        children: [
          { label: "&Memo", run: () => copyInto(list, "memo") },
          { label: "&Calendar Entry", run: () => copyInto(list, "calendar") },
          { label: "&To Do", run: () => copyInto(list, "todo") },
        ],
      },
      { sep: true },
      {
        label: "Add to &Group",
        children: [
          ...sortedGroups.map((g) => {
            const all = ids.every((id) => g.memberIds.includes(id));
            return { label: g.name, checked: all, disabled: all, run: () => void addToGroup(list, g.id) };
          }),
          ...(sortedGroups.length ? [{ sep: true }] : []),
          { label: "&New Group...", run: () => void createGroup(ids) },
        ],
      },
      { label: "E&xport vCard...", run: () => void exportVCard() },
      { label: "Copy as &Link", children: [{ label: "&Document Link", run: () => copyContactLink(c) }] },
      { sep: true },
      { label: "&Delete", accel: "Del", run: () => markForDeletion(ids) },
      { label: "Document &Properties...", accel: "Alt+Enter", run: () => void openDocumentProperties("contacts", c.id) },
    ];
  };

  const groupMenu = (g: ContactGroup | null): MenuItem[] => {
    if (!g) return [{ label: "New &Group...", run: () => void newGroup() }];
    const list = checked.has(g.id) ? selGroups() : [g];
    return [
      { label: "&Open", accel: "Enter", run: () => void editGroup(g) },
      { sep: true },
      { label: "&Write Memo", run: () => writeMemoToGroups(list) },
      { label: "E&xport vCard...", run: () => void exportVCard() },
      { sep: true },
      { label: "&Delete", accel: "Del", run: () => markForDeletion(list.map((x) => x.id)) },
    ];
  };

  useTabCommands("contacts", {
    refresh,
    deleteSelected: () => markForDeletion(selectionIds()),
    searchBar: () => setSearchOpen((o) => !o),
    newDocument: isGroups ? () => void newGroup() : newContact,
    properties: selectedContact ? () => void openDocumentProperties("contacts", selectedContact.id) : undefined,
    copyAsLink: selectedContact ? () => copyContactLink(selectedContact) : undefined,
  });

  const anySelected = isGroups ? selG.length > 0 : selC.length > 0;
  const actions: ActionItem[] = [
    {
      id: "new",
      label: "New",
      icon: "person-new",
      children: [
        { id: "new-contact", label: "Contact", icon: "person-new", run: newContact },
        { id: "new-group", label: "Group...", icon: "group", run: () => void newGroup() },
      ],
    },
    isGroups && {
      id: "edit-group",
      label: "Edit Group...",
      icon: "edit",
      disabled: !selectedGroup,
      run: () => selectedGroup && void editGroup(selectedGroup),
    },
    "sep",
    {
      id: "memo",
      label: "Write Memo",
      icon: "write-memo",
      disabled: !anySelected,
      run: () => (isGroups ? writeMemoToGroups(selG) : writeMemoTo(selC)),
    },
    { id: "chat", label: "Chat", icon: "chat", disabled: !chatTarget, run: () => chatTarget && chatWith(chatTarget) },
    { id: "copyinto", label: "Copy Into New", icon: "copy-into", disabled: !selC.length, children: copyIntoItems(selC) },
    "sep",
    {
      id: "delete",
      label: "Delete",
      icon: "trash",
      accel: "Del",
      disabled: !anySelected,
      run: () => markForDeletion(selectionIds()),
    },
    "sep",
    {
      id: "tools",
      label: "Tools",
      icon: "tools",
      children: [
        { id: "import", label: "Import vCard...", icon: "vcard-import", run: importVCard },
        { id: "export", label: "Export vCard...", icon: "vcard-export", run: () => void exportVCard() },
        "sep",
        {
          id: "addgroup",
          label: "Add Selected to Group...",
          icon: "group",
          disabled: !selC.length,
          run: () => void addToGroup(selC),
        },
      ],
    },
  ];

  // ---- render --------------------------------------------------------------
  const found = isGroups ? shownGroups.length : shownContacts.length;
  const view = (
    <div className="list-pane pab-list" ref={listRef}>
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
          {applied && <span className="search-result">{plural(found, "document")} found</span>}
        </div>
      )}
      <div className="pab-viewrow">
        {isGroups ? (
          <NotesView
            viewKey="pab-groups"
            docs={shownGroups}
            getId={groupId}
            columns={groupColumns}
            defaultSort={{ col: "name", dir: 1 }}
            caret={caret}
            onCaret={(key, g) => {
              setCaret(key);
              setSelectedId(g ? g.id : null);
            }}
            checked={checked}
            onChecked={setChecked}
            marked={marked}
            onOpen={(g) => void editGroup(g)}
            onDelete={markForDeletion}
            onRefresh={refresh}
            onContextMenu={(e, g) => openContextMenu(e, groupMenu(g))}
            emptyText={applied ? "No groups match." : "There are no groups. Choose New > Group to create one."}
            autoFocus
          />
        ) : (
          <NotesView
            viewKey={nav === "category" ? "pab-category" : "pab-contacts"}
            docs={shownContacts}
            getId={contactId}
            columns={CONTACT_COLUMNS}
            defaultSort={{ col: "name", dir: 1 }}
            categorize={nav === "category" ? categorizeContact : undefined}
            caret={caret}
            onCaret={(key, c) => {
              setCaret(key);
              setSelectedId(c ? c.id : null);
            }}
            checked={checked}
            onChecked={setChecked}
            marked={marked}
            onOpen={openContact}
            onDelete={markForDeletion}
            onRefresh={refresh}
            onContextMenu={(e, c) => openContextMenu(e, contactMenu(c))}
            onDragStart={(e, c) => {
              e.dataTransfer.setData("text/plain", c.id);
              e.dataTransfer.setData(DRAG_DOC, JSON.stringify({ coll: "contacts", id: c.id, title: displayName(c) }));
              e.dataTransfer.effectAllowed = "copyLink";
            }}
            emptyText={applied ? "No contacts match." : "There are no contacts. Choose New > Contact to add one."}
            autoFocus
          />
        )}
        {nav === "contacts" && (
          <LetterIndex
            contacts={shownContacts}
            current={selectedContact ? indexLetter(selectedContact) : null}
            onJump={jump}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="app pab-app">
      <ActionBar actions={actions} />
      <input
        ref={fileRef}
        type="file"
        accept=".vcf,.vcard,text/vcard,text/x-vcard"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onImportFile(file);
        }}
      />
      <div className="app-cols">
        <div className="nav-pane pab-nav">
          <div className="nav-title">
            <span>{dbTitle}</span>
            <span className="nav-sub-label">on Local</span>
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
              </div>
            ))}
            <div className="nav-item" onClick={() => setToolsOpen((o) => !o)}>
              <span className="nav-ic">
                <Icon name={toolsOpen ? "twistie-down" : "twistie-right"} />
              </span>
              <span className="nav-label">Tools</span>
            </div>
            {toolsOpen && (
              <>
                <div className="nav-item nav-indent" onClick={importVCard}>
                  <span className="nav-ic">
                    <Icon name="vcard-import" />
                  </span>
                  <span className="nav-label">Import vCard...</span>
                </div>
                <div className="nav-item nav-indent" onClick={() => void exportVCard()}>
                  <span className="nav-ic">
                    <Icon name="vcard-export" />
                  </span>
                  <span className="nav-label">Export vCard...</span>
                </div>
              </>
            )}
          </div>
          <div className="pab-nav-note">
            {plural(contacts.length, "contact")}, {plural(groups.length, "group")}
          </div>
        </div>

        <Splitter />

        <div className={"pab-stack preview-" + preview}>
          {view}
          {preview !== "off" && (
            <>
              <Splitter vertical={preview === "bottom"} />
              <div className="preview-pane pab-preview">
                {isGroups ? (
                  selectedGroup ? (
                    <GroupCard g={selectedGroup} members={groupMembers(selectedGroup, contacts)} />
                  ) : (
                    <div className="preview-empty">Select a group to see its members.</div>
                  )
                ) : selectedContact ? (
                  <BusinessCard c={selectedContact} />
                ) : (
                  <div className="preview-empty">Select a contact to see the business card.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export { ContactDocument } from "./ContactDocument";
