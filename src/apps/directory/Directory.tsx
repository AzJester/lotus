// ============================================================================
// Acme's Directory (names.nsf on Mail01/Acme), opened read-only the way a
// user sees the Domino Directory: People, People by Organization and Groups
// views, a Person or Group document in the preview pane, and actions to
// write a memo, chat, or copy a person into the Personal Address Book.
// ============================================================================

import { useMemo, useState } from "react";
import { ActionBar } from "../../components/ActionBar";
import type { ActionItem } from "../../components/ActionBar";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { NotesView } from "../../components/NotesView";
import type { ViewColumn } from "../../components/NotesView";
import { openContextMenu } from "../../components/menu";
import { Splitter } from "../../components/Splitter";
import { useTabCommands } from "../../components/tabs";
import { useNotes } from "../../data/store";
import { useUI } from "../../data/ui";
import { DIRECTORY, DIRECTORY_PEOPLE, MAIL_SERVER, ORG } from "../../data/directory";
import type { DirectoryEntry, DirectoryGroup, DirectoryPerson } from "../../data/directory";
import { stampNew, uid } from "../../data/docs";
import type { Contact } from "../../data/types";
import { presenceOf } from "../../lib/presence";
import "../../styles/directory.css";

type DirNav = "people" | "org" | "groups";

const NAV: { key: DirNav; label: string; icon: IconName }[] = [
  { key: "people", label: "People", icon: "person" },
  { key: "org", label: "People by Organization", icon: "company" },
  { key: "groups", label: "Groups", icon: "group" },
];

const lastFirst = (name: string) => {
  const parts = name.split(" ");
  if (parts.length < 2 || name.startsWith("IT ") || name.includes("Resources") || name.includes("Administrator")) return name;
  const last = parts.pop();
  return `${last}, ${parts.join(" ")}`;
};

const hierName = (p: DirectoryPerson) => `${p.name}/${ORG}`;

function PersonDoc({ p }: { p: DirectoryPerson }) {
  const presence = presenceOf(p.name);
  return (
    <div className="dir-doc">
      <div className="dir-doc-head">
        <Icon name="person" scale={2} />
        <div>
          <div className="dir-doc-title">{p.name}</div>
          <div className="dir-doc-sub">
            {p.title}, {p.dept}
          </div>
        </div>
        <span className={"presence-dot " + presence} title={`Sametime: ${presence}`} />
      </div>
      <table className="dir-fields">
        <tbody>
          <tr>
            <th>User name:</th>
            <td>
              {hierName(p)}
              <br />
              {p.name}
            </td>
          </tr>
          <tr>
            <th>Internet address:</th>
            <td>{p.email}</td>
          </tr>
          <tr>
            <th>Title:</th>
            <td>{p.title}</td>
          </tr>
          <tr>
            <th>Department:</th>
            <td>{p.dept}</td>
          </tr>
          <tr>
            <th>Office phone:</th>
            <td>{p.phone}</td>
          </tr>
          <tr>
            <th>Mail server:</th>
            <td>{MAIL_SERVER}</td>
          </tr>
          <tr>
            <th>Mail file:</th>
            <td>mail\{p.email.split("@")[0].replace(/\./g, "").slice(0, 8)}.nsf</td>
          </tr>
          {p.ooo && (
            <tr>
              <th>Out of office:</th>
              <td className="dir-ooo">Out of the office. {p.ooo.message}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupDoc({ g }: { g: DirectoryGroup }) {
  return (
    <div className="dir-doc">
      <div className="dir-doc-head">
        <Icon name="group" scale={2} />
        <div>
          <div className="dir-doc-title">{g.name}</div>
          <div className="dir-doc-sub">{g.description}</div>
        </div>
      </div>
      <table className="dir-fields">
        <tbody>
          <tr>
            <th>Group type:</th>
            <td>Mail only</td>
          </tr>
          <tr>
            <th>Members:</th>
            <td>
              {g.members.map((m) => (
                <div key={m}>
                  {m}/{ORG}
                </div>
              ))}
            </td>
          </tr>
          <tr>
            <th>Owners:</th>
            <td>Domino Administrator/{ORG}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function Directory() {
  const [nav, setNav] = useState<DirNav>("people");
  const [caret, setCaret] = useState<string | null>(null);
  const [sel, setSel] = useState<DirectoryEntry | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const contacts = useNotes((s) => s.contacts);
  const addContact = useNotes((s) => s.addContact);
  const setStatus = useUI((s) => s.setStatus);
  const requestMemo = useUI((s) => s.requestMemo);
  const openChat = useUI((s) => s.openChat);

  const docs = useMemo<DirectoryEntry[]>(
    () => (nav === "groups" ? DIRECTORY.filter((d) => d.kind === "group") : DIRECTORY_PEOPLE),
    [nav],
  );

  const columns: ViewColumn<DirectoryEntry>[] = useMemo(() => {
    if (nav === "groups")
      return [
        {
          id: "name",
          title: "Group Name",
          width: 200,
          sortable: true,
          sortValue: (d) => d.name.toLowerCase(),
          render: (d) => (
            <span className="dir-name">
              <Icon name="group" /> {d.name}
            </span>
          ),
        },
        { id: "type", title: "Type", width: 90, render: () => "Mail only" },
        { id: "desc", title: "Description", flex: true, render: (d) => (d as DirectoryGroup).description },
      ];
    return [
      {
        id: "name",
        title: "Name",
        width: 190,
        sortable: true,
        sortValue: (d) => lastFirst(d.name).toLowerCase(),
        text: (d) => d.name,
        render: (d) => (
          <span className="dir-name">
            <span className={"presence-dot " + presenceOf(d.name)} /> {lastFirst(d.name)}
          </span>
        ),
      },
      { id: "title", title: "Title", width: 180, sortable: true, sortValue: (d) => (d as DirectoryPerson).title, render: (d) => (d as DirectoryPerson).title },
      { id: "phone", title: "Phone", width: 70, render: (d) => (d as DirectoryPerson).phone },
      { id: "email", title: "E-mail", flex: true, render: (d) => (d as DirectoryPerson).email },
    ];
  }, [nav]);

  const person = sel?.kind === "person" ? sel : null;

  const addToPab = (p: DirectoryPerson) => {
    if (contacts.some((c) => c.email.toLowerCase() === p.email.toLowerCase())) {
      setStatus(`${p.name} is already in your Personal Address Book.`);
      return;
    }
    const [firstName, ...rest] = p.name.split(" ");
    const c = stampNew<Contact>({
      id: uid(),
      firstName,
      lastName: rest.join(" "),
      email: p.email,
      company: ORG,
      title: p.title,
      workPhone: p.phone,
      cellPhone: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      country: "",
      category: p.dept,
      comments: `Copied from ${ORG}'s Directory.`,
    });
    addContact(c);
    setStatus(`${p.name} was added to your Personal Address Book.`);
  };

  const actions: ActionItem[] = [
    { id: "memo", label: "Write Memo", icon: "write-memo", disabled: !sel, run: () => sel && requestMemo(sel.name) },
    { id: "chat", label: "Chat", icon: "chat", disabled: !person, run: () => person && openChat(person.name) },
    "sep",
    { id: "pab", label: "Add to Address Book", icon: "person-new", disabled: !person, run: () => person && addToPab(person) },
  ];

  useTabCommands("directory", { refresh: () => setStatus("View refreshed.") });

  return (
    <div className="app directory-app">
      <ActionBar actions={actions} />
      <div className="app-cols">
        <div className="nav-pane">
          <div className="nav-title">
            <span>{ORG}'s Directory</span>
            <span className="nav-sub-label">on {MAIL_SERVER}</span>
          </div>
          <div className="nav-group">
            {NAV.map((n) => (
              <div
                key={n.key}
                className={"nav-item" + (nav === n.key ? " active" : "")}
                onClick={() => {
                  setNav(n.key);
                  setCaret(null);
                  setSel(null);
                }}
              >
                <span className="nav-ic">
                  <Icon name={n.icon} />
                </span>
                <span className="nav-label">{n.label}</span>
              </div>
            ))}
          </div>
          <div className="nav-note">You have Reader access to this database.</div>
        </div>
        <Splitter id="directory.nav" />
        <div className="dir-stack">
          <div className="list-pane">
            <NotesView
              viewKey={`directory-${nav}`}
              docs={docs}
              getId={(d) => d.name}
              columns={columns}
              defaultSort={{ col: "name", dir: 1 }}
              categorize={nav === "org" ? (d) => (d as DirectoryPerson).dept : undefined}
              caret={caret}
              onCaret={(k, d) => {
                setCaret(k);
                setSel(d);
              }}
              checked={checked}
              onChecked={setChecked}
              onOpen={(d) => setSel(d)}
              onContextMenu={(e, d) =>
                d &&
                openContextMenu(e, [
                  { label: "&Write Memo", run: () => requestMemo(d.name) },
                  ...(d.kind === "person"
                    ? [
                        { label: "&Chat", run: () => openChat(d.name) },
                        { label: "&Add to Address Book", run: () => addToPab(d) },
                      ]
                    : []),
                ])
              }
              emptyText="No documents."
              autoFocus
            />
          </div>
          <Splitter vertical id="directory.preview" />
          <div className="preview-pane">
            {sel ? (
              sel.kind === "person" ? (
                <PersonDoc p={sel} />
              ) : (
                <GroupDoc g={sel} />
              )
            ) : (
              <div className="preview-empty">Select a person or group.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
