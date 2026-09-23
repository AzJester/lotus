// ============================================================================
// Sametime chat windows. A row of small IM windows pinned to the bottom-right
// of the Notes desktop, one per buddy in the UI store's `openChats`. Each
// window keeps its own message log, opens with a presence line, and answers
// with a canned reply a beat after you send a message (unless the buddy is
// offline). Closing a window saves the transcript to Chat History in the
// mail file, as Sametime's "save chat transcripts" option did.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useUI } from "../data/ui";
import { useNotes } from "../data/store";
import type { ChatLine } from "../data/store";
import { fmtTime } from "../lib/format";
import { presenceOf } from "../lib/presence";
import "../styles/chat.css";


// Canned auto-replies, picked by how many messages the user has sent so the
// banter varies a little over the course of a conversation.
const REPLIES = [
  "Sure, sounds good.",
  "Let me check and get back to you.",
  "Ha, agreed!",
  "Can you send that over?",
  "I'm in a meeting, ttyl.",
  ":-)",
  "Good point, let's do that.",
  "Thanks for the heads up.",
];

function ChatWindow({ name, onClose }: { name: string; onClose: () => void }) {
  const status = presenceOf(name);
  const [lines, setLines] = useState<ChatLine[]>(() => [
    { who: "system", text: `${name} is ${status === "offline" ? "offline" : "available"}.`, at: Date.now() },
  ]);
  const [text, setText] = useState("");
  const sentCount = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Keep the log scrolled to the newest message.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // Clear any pending auto-reply timers when the window closes.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) clearTimeout(t);
    };
  }, []);

  const linesRef = useRef(lines);
  linesRef.current = lines;
  const close = () => {
    useNotes.getState().saveChatTranscript(name, linesRef.current);
    onClose();
  };

  function send() {
    const value = text.trim();
    if (!value) return;
    setLines((prev) => [...prev, { who: "me", text: value, at: Date.now() }]);
    setText("");
    if (status === "offline") {
      setLines((prev) => [...prev, { who: "system", text: `${name} is offline. The message was not delivered.`, at: Date.now() }]);
      return;
    }
    const reply = REPLIES[sentCount.current % REPLIES.length];
    sentCount.current += 1;
    const timer = setTimeout(() => {
      setLines((prev) => [...prev, { who: "them", text: reply, at: Date.now() }]);
    }, 800);
    timers.current.push(timer);
  }

  return (
    <div className="chat-win">
      <div className="chat-title">
        <span className={"chat-title-presence " + status} />
        <span className="chat-title-name" title={name}>{name}</span>
        <span className="chat-close" title="Close chat (the transcript is saved to Chat History)" onClick={close}>✕</span>
      </div>
      <div className="chat-log" ref={logRef}>
        {lines.map((l, i) =>
          l.who === "system" ? (
            <div key={i} className="chat-msg system">{l.text}</div>
          ) : (
            <div key={i} className={"chat-msg " + l.who}>
              <span className="chat-msg-who">{l.who === "me" ? "You" : name}: </span>
              {l.text}{" "}
              <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{fmtTime(l.at)}</span>
            </div>
          ),
        )}
      </div>
      <div className="chat-compose">
        <input
          className="chat-input"
          type="text"
          value={text}
          placeholder="Type a message..."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="button" className="chat-send" onClick={send}>Send</button>
      </div>
    </div>
  );
}

export default function ChatDock() {
  const openChats = useUI((s) => s.openChats);
  const closeChat = useUI((s) => s.closeChat);

  if (openChats.length === 0) return null;

  return (
    <div className="chat-dock">
      {openChats.map((name) => (
        <ChatWindow key={name} name={name} onClose={() => closeChat(name)} />
      ))}
    </div>
  );
}
