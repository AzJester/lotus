// ============================================================================
// Mail dialogs: Close Window (send / save / discard when you close a memo),
// Delivery Options (importance, return receipt, mood stamps), Select
// Addresses (the directory picker with To / cc / bcc buttons), Move To
// Folder, Rules, and Propose New Time for meeting invitations.
// ============================================================================

import { useMemo, useState } from "react";
import { NotesDialog, openDialog } from "../../components/dialogs";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { useNotes, uid } from "../../data/store";
import { addressCandidates } from "../../data/names";
import type { AddressCandidate } from "../../data/names";
import type { CustomFolder, FlagColor, MailRule, MoodStamp, Priority } from "../../data/types";
import { MOODS } from "./mailHelpers";
import { fmtTime, toDateInput } from "../../lib/format";

// ---------------------------------------------------------------------------
// Close Window
// ---------------------------------------------------------------------------

export type CloseChoice = "send-save" | "send" | "save" | "discard" | null;

export function closeWindowDialog(): Promise<CloseChoice> {
  return openDialog<CloseChoice>((close) => <CloseWindow close={close} />);
}

function CloseWindow({ close }: { close: (c: CloseChoice) => void }) {
  const [choice, setChoice] = useState<Exclude<CloseChoice, null>>("send-save");
  const options: [Exclude<CloseChoice, null>, string][] = [
    ["send-save", "Send and save a copy"],
    ["send", "Send only"],
    ["save", "Save only"],
    ["discard", "Discard changes"],
  ];
  return (
    <NotesDialog
      title="Close Window"
      onClose={() => close(null)}
      width={330}
      footer={
        <>
          <button className="btn primary" onClick={() => close(choice)}>
            OK
          </button>
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
        </>
      }
    >
      <div className="closewin" role="radiogroup">
        {options.map(([id, label]) => (
          <label key={id} className="closewin-row">
            <input
              type="radio"
              name="closewin"
              checked={choice === id}
              data-autofocus={id === "send-save" ? true : undefined}
              onChange={() => setChoice(id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") close(choice);
              }}
            />
            {label}
          </label>
        ))}
      </div>
    </NotesDialog>
  );
}

// ---------------------------------------------------------------------------
// Delivery Options
// ---------------------------------------------------------------------------

export interface DeliveryOpts {
  priority: Priority;
  mood: MoodStamp;
  returnReceipt: boolean;
}

export const MOOD_ICON: Record<MoodStamp, IconName | null> = {
  normal: null,
  personal: "mood-personal",
  confidential: "mood-confidential",
  private: "mood-private",
  thankyou: "mood-thankyou",
  flame: "mood-flame",
  goodjob: "mood-goodjob",
  joke: "mood-joke",
  fyi: "mood-fyi",
  question: "mood-question",
  reminder: "mood-reminder",
};

export function deliveryOptionsDialog(initial: DeliveryOpts): Promise<DeliveryOpts | null> {
  return openDialog<DeliveryOpts | null>((close) => <DeliveryOptions initial={initial} close={close} />);
}

function DeliveryOptions({ initial, close }: { initial: DeliveryOpts; close: (v: DeliveryOpts | null) => void }) {
  const [o, setO] = useState(initial);
  const icon = MOOD_ICON[o.mood];
  return (
    <NotesDialog
      title="Delivery Options"
      onClose={() => close(null)}
      width={420}
      footer={
        <>
          <button className="btn primary" onClick={() => close(o)}>
            OK
          </button>
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
        </>
      }
    >
      <div className="delivery">
        <fieldset>
          <legend>Basics</legend>
          <label className="delivery-row">
            Importance:&nbsp;
            <select value={o.priority} onChange={(e) => setO({ ...o, priority: e.target.value as Priority })} data-autofocus>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="delivery-row">
            Mood stamp:&nbsp;
            <select value={o.mood} onChange={(e) => setO({ ...o, mood: e.target.value as MoodStamp })}>
              {MOODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="delivery-mood">{icon ? <Icon name={icon} scale={2} /> : null}</span>
          </label>
          <label className="delivery-row">
            <input
              type="checkbox"
              checked={o.returnReceipt}
              onChange={(e) => setO({ ...o, returnReceipt: e.target.checked })}
            />
            &nbsp;Return receipt
          </label>
        </fieldset>
        <div className="delivery-note">
          A return receipt tells you when each recipient opens the memo. The mood stamp appears at the top of the memo.
        </div>
      </div>
    </NotesDialog>
  );
}

// ---------------------------------------------------------------------------
// Select Addresses
// ---------------------------------------------------------------------------

export interface AddressPick {
  to: string[];
  cc: string[];
  bcc: string[];
}

export function addressDialog(initial: AddressPick, opts: { single?: boolean; title?: string } = {}): Promise<AddressPick | null> {
  return openDialog<AddressPick | null>((close) => <AddressDialog initial={initial} close={close} single={opts.single} title={opts.title} />);
}

function AddressDialog({
  initial,
  close,
  single,
  title,
}: {
  initial: AddressPick;
  close: (v: AddressPick | null) => void;
  single?: boolean;
  title?: string;
}) {
  const contacts = useNotes((s) => s.contacts);
  const groups = useNotes((s) => s.contactGroups);
  const all = useMemo(() => addressCandidates(contacts, groups), [contacts, groups]);
  const [book, setBook] = useState<"directory" | "pab">("directory");
  const [find, setFind] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [pick, setPick] = useState<AddressPick>(initial);
  const list = all.filter(
    (c) => c.source === book && (!find || c.name.toLowerCase().startsWith(find.toLowerCase()) || c.display.toLowerCase().startsWith(find.toLowerCase())),
  );
  const current: AddressCandidate | undefined = list.find((c) => c.display === sel) ?? list[0];
  const add = (field: keyof AddressPick) => {
    if (!current) return;
    if (pick[field].includes(current.display)) return;
    setPick(single ? { to: [current.display], cc: [], bcc: [] } : { ...pick, [field]: [...pick[field], current.display] });
  };
  const remove = (field: keyof AddressPick, name: string) => setPick({ ...pick, [field]: pick[field].filter((n) => n !== name) });

  return (
    <NotesDialog
      title={title ?? "Select Addresses"}
      onClose={() => close(null)}
      width={600}
      footer={
        <>
          <button className="btn primary" onClick={() => close(pick)}>
            OK
          </button>
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
        </>
      }
    >
      <div className="addr-dlg">
        <div className="addr-left">
          <label className="addr-row">
            Choose address book:&nbsp;
            <select value={book} onChange={(e) => setBook(e.target.value as "directory" | "pab")}>
              <option value="directory">Acme's Directory</option>
              <option value="pab">Personal Address Book</option>
            </select>
          </label>
          <label className="addr-row">
            Find names starting with:&nbsp;
            <input type="text" value={find} data-autofocus onChange={(e) => setFind(e.target.value)} />
          </label>
          <div className="addr-list" role="listbox" tabIndex={0}>
            {list.map((c) => (
              <div
                key={c.source + c.display}
                role="option"
                aria-selected={current?.display === c.display}
                className={"addr-item" + (current?.display === c.display ? " active" : "")}
                onMouseDown={() => setSel(c.display)}
                onDoubleClick={() => add("to")}
                title={c.detail}
              >
                <Icon name={c.kind === "group" ? "group" : "person"} />
                <span className="addr-name">{c.name}</span>
                <span className="addr-detail">{c.detail}</span>
              </div>
            ))}
            {list.length === 0 && <div className="addr-empty">No names found.</div>}
          </div>
        </div>
        <div className="addr-buttons">
          <button className="btn" onClick={() => add("to")}>
            {single ? "Select >" : "To >"}
          </button>
          {!single && (
            <>
              <button className="btn" onClick={() => add("cc")}>
                cc &gt;
              </button>
              <button className="btn" onClick={() => add("bcc")}>
                bcc &gt;
              </button>
              <button className="btn" onClick={() => setPick({ to: [], cc: [], bcc: [] })}>
                Remove All
              </button>
            </>
          )}
        </div>
        <div className="addr-right">
          <div className="addr-row">Recipients:</div>
          <div className="addr-recips">
            {(single ? (["to"] as const) : (["to", "cc", "bcc"] as const)).map((f) => (
              <div key={f} className="addr-recip-group">
                {!single && <div className="addr-recip-head">{f === "to" ? "To:" : f === "cc" ? "cc:" : "bcc:"}</div>}
                {pick[f].map((n) => (
                  <div key={n} className="addr-recip" title="Double-click to remove" onDoubleClick={() => remove(f, n)}>
                    <Icon name="person" /> {n}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </NotesDialog>
  );
}

// ---------------------------------------------------------------------------
// Move To Folder
// ---------------------------------------------------------------------------

export function moveToFolderDialog(title = "Move To Folder"): Promise<string | null> {
  return openDialog<string | null>((close) => <MoveToFolder close={close} title={title} />);
}

function MoveToFolder({ close, title }: { close: (id: string | null) => void; title: string }) {
  const folders = useNotes((s) => s.customFolders);
  const addFolder = useNotes((s) => s.addFolder);
  const [sel, setSel] = useState<string | null>(folders[0]?.id ?? null);
  const [creating, setCreating] = useState("");
  return (
    <NotesDialog
      title={title}
      onClose={() => close(null)}
      width={340}
      footer={
        <>
          <button className="btn primary" onClick={() => close(sel)} disabled={!sel}>
            Move
          </button>
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
        </>
      }
    >
      <div className="opendb-label">Select a folder:</div>
      <div className="opendb-list" role="listbox">
        {folders.map((f: CustomFolder) => (
          <div
            key={f.id}
            role="option"
            aria-selected={f.id === sel}
            className={"opendb-item" + (f.id === sel ? " active" : "")}
            onMouseDown={() => setSel(f.id)}
            onDoubleClick={() => close(f.id)}
          >
            <Icon name="folder" />
            <span>{f.name}</span>
          </div>
        ))}
        {folders.length === 0 && <div className="opendb-empty">No folders yet. Create one below.</div>}
      </div>
      <div className="movefolder-new">
        <input type="text" placeholder="New folder name" value={creating} onChange={(e) => setCreating(e.target.value)} />
        <button
          className="btn"
          disabled={!creating.trim()}
          onClick={() => {
            const id = addFolder(creating.trim());
            setCreating("");
            setSel(id);
          }}
        >
          New Folder
        </button>
      </div>
    </NotesDialog>
  );
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const FLAG_COLORS: FlagColor[] = ["red", "yellow", "green", "blue", "purple", "orange"];

export function rulesDialog() {
  return openDialog<void>((close) => <RulesDialog close={() => close()} />);
}

function RulesDialog({ close }: { close: () => void }) {
  const rules = useNotes((s) => s.mailRules);
  const folders = useNotes((s) => s.customFolders);
  const addRule = useNotes((s) => s.addRule);
  const deleteRule = useNotes((s) => s.deleteRule);
  const applyRules = useNotes((s) => s.applyRules);
  const [field, setField] = useState<MailRule["field"]>("from");
  const [contains, setContains] = useState("");
  const [action, setAction] = useState<MailRule["action"]>("move");
  const [folderId, setFolderId] = useState(folders[0]?.id ?? "");
  const [flagColor, setFlagColor] = useState<FlagColor>("yellow");
  const [status, setStatus] = useState("Rules run automatically on every memo that arrives.");
  const folderName = (id?: string) => folders.find((f) => f.id === id)?.name ?? "(deleted folder)";
  const fieldLabel = (f: MailRule["field"]) => (f === "from" ? "Sender" : f === "subject" ? "Subject" : "Body");

  const add = () => {
    const text = contains.trim();
    if (!text || (action === "move" && !folderId)) return;
    addRule(
      action === "move"
        ? { id: uid(), field, contains: text, action, folderId }
        : action === "flag"
          ? { id: uid(), field, contains: text, action, flagColor }
          : { id: uid(), field, contains: text, action },
    );
    setContains("");
  };

  return (
    <NotesDialog
      title="Rules"
      onClose={close}
      width={520}
      footer={
        <>
          <button
            className="btn"
            onClick={() => {
              const n = applyRules();
              setStatus(n ? `Rules applied to the Inbox: ${n} memo${n === 1 ? "" : "s"} changed.` : "Rules applied: no memos changed.");
            }}
          >
            Run on Inbox Now
          </button>
          <button className="btn primary" onClick={close}>
            Close
          </button>
        </>
      }
    >
      <div className="rules-list">
        {rules.length === 0 && <div className="rules-empty">No rules defined.</div>}
        {rules.map((r) => (
          <div key={r.id} className="rule-row">
            <Icon name="rules" />
            <span className="rule-text">
              When <b>{fieldLabel(r.field)}</b> contains <b>"{r.contains}"</b>{" "}
              {r.action === "move" ? (
                <>
                  then move to folder <b>{folderName(r.folderId)}</b>
                </>
              ) : r.action === "flag" ? (
                <>
                  then flag <b>{r.flagColor ?? "yellow"}</b>
                </>
              ) : (
                <>
                  then move to <b>Junk</b>
                </>
              )}
            </span>
            <button className="btn rule-del" title="Delete rule" onClick={() => deleteRule(r.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
      <fieldset className="rule-form">
        <legend>New rule</legend>
        <div className="rule-form-row">
          <span>When</span>
          <select value={field} onChange={(e) => setField(e.target.value as MailRule["field"])}>
            <option value="from">Sender</option>
            <option value="subject">Subject</option>
            <option value="body">Body</option>
          </select>
          <span>contains</span>
          <input type="text" value={contains} placeholder="text" onChange={(e) => setContains(e.target.value)} />
        </div>
        <div className="rule-form-row">
          <span>then</span>
          <select value={action} onChange={(e) => setAction(e.target.value as MailRule["action"])}>
            <option value="move">Move to folder</option>
            <option value="flag">Flag for follow up</option>
            <option value="junk">Move to Junk</option>
          </select>
          {action === "move" && (
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)} disabled={!folders.length}>
              {folders.length === 0 && <option value="">(no folders)</option>}
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          {action === "flag" && (
            <select value={flagColor} onChange={(e) => setFlagColor(e.target.value as FlagColor)}>
              {FLAG_COLORS.map((c) => (
                <option key={c} value={c}>
                  {c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          )}
          <button className="btn primary" onClick={add} disabled={!contains.trim() || (action === "move" && !folderId)}>
            Add Rule
          </button>
        </div>
      </fieldset>
      <div className="rules-status">{status}</div>
    </NotesDialog>
  );
}

// ---------------------------------------------------------------------------
// Propose New Time
// ---------------------------------------------------------------------------

export function proposeTimeDialog(start: number, end: number): Promise<{ start: number; end: number; comment: string } | null> {
  return openDialog((close) => <ProposeTime start={start} end={end} close={close} />);
}

function ProposeTime({
  start,
  end,
  close,
}: {
  start: number;
  end: number;
  close: (v: { start: number; end: number; comment: string } | null) => void;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const hm = (ms: number) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;
  const [date, setDate] = useState(toDateInput(start));
  const [from, setFrom] = useState(hm(start + 3600000));
  const [to, setTo] = useState(hm(end + 3600000));
  const [comment, setComment] = useState("");
  const toMs = (d: string, t: string) => new Date(`${d}T${t}`).getTime();
  const s = toMs(date, from);
  const e = toMs(date, to);
  const bad = !(e > s);
  return (
    <NotesDialog
      title="Propose New Time"
      onClose={() => close(null)}
      width={360}
      footer={
        <>
          <button className="btn primary" disabled={bad} onClick={() => close({ start: s, end: e, comment })}>
            OK
          </button>
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
        </>
      }
    >
      <div className="propose">
        <label className="delivery-row">
          Date:&nbsp;
          <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} data-autofocus />
        </label>
        <label className="delivery-row">
          Begins:&nbsp;
          <input type="time" value={from} onChange={(ev) => setFrom(ev.target.value)} />
          &nbsp;Ends:&nbsp;
          <input type="time" value={to} onChange={(ev) => setTo(ev.target.value)} />
        </label>
        {bad && <div className="prio-high">The meeting must end after it begins.</div>}
        {!bad && (
          <div className="muted">
            Proposing {fmtTime(s)} - {fmtTime(e)}
          </div>
        )}
        <label className="ooo-label">Comment (optional):</label>
        <textarea rows={3} value={comment} onChange={(ev) => setComment(ev.target.value)} />
      </div>
    </NotesDialog>
  );
}
