// ============================================================================
// Outgoing Mail (mail.box): memos sent while you were not connected to the
// server, waiting for the next replication (or Send Outgoing Mail).
// ============================================================================

import { useState } from "react";
import { ActionBar } from "../../components/ActionBar";
import { Icon } from "../../components/Icon";
import { NotesView } from "../../components/NotesView";
import type { ViewColumn } from "../../components/NotesView";
import { useNotes } from "../../data/store";
import type { MailMessage } from "../../data/types";
import { commonName } from "../../data/names";
import { fmtListDate } from "../../lib/format";
import { runReplication } from "../../shell/replicate";
import { MemoReader } from "../mail/Memo";

const COLUMNS: ViewColumn<MailMessage>[] = [
  { id: "to", title: "To", width: 200, sortable: true, sortValue: (m) => m.to.map(commonName).join(", "), render: (m) => m.to.map(commonName).join(", ") },
  { id: "subject", title: "Subject", flex: true, sortable: true, sortValue: (m) => m.subject, render: (m) => m.subject },
  { id: "date", title: "Queued", width: 110, sortable: true, sortValue: (m) => m.date, render: (m) => fmtListDate(m.date) },
];

export default function Outbox() {
  const outbox = useNotes((s) => s.outbox);
  const [caret, setCaret] = useState<string | null>(null);
  const [sel, setSel] = useState<MailMessage | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  return (
    <div className="app outbox-app">
      <ActionBar
        actions={[
          { id: "send", label: "Send Now", icon: "send", disabled: !outbox.length, run: () => void runReplication({ dbs: [], sendOutgoing: true }) },
        ]}
      />
      <div className="outbox-note">
        <Icon name="outbox" /> {outbox.length ? `${outbox.length} memo${outbox.length === 1 ? "" : "s"} waiting to be sent.` : "No mail is waiting to be sent."}
      </div>
      <div className="app-cols" style={{ flexDirection: "column" }}>
        <div className="list-pane" style={{ flex: 1 }}>
          <NotesView
            viewKey="outbox"
            docs={outbox}
            getId={(m) => m.id}
            columns={COLUMNS}
            defaultSort={{ col: "date", dir: -1 }}
            caret={caret}
            onCaret={(k, m) => {
              setCaret(k);
              setSel(m);
            }}
            checked={checked}
            onChecked={setChecked}
            onOpen={(m) => setSel(m)}
            emptyText="Outgoing Mail is empty."
          />
        </div>
        {sel && (
          <div className="preview-pane" style={{ flex: 1 }}>
            <div className="memo-scroll">
              <MemoReader m={sel} compact />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
