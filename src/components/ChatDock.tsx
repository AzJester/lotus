// ============================================================================
// Sametime chat windows. A row of small IM windows pinned to the bottom-right
// of the Notes desktop, one per buddy in the UI store's `openChats`. Each
// window keeps its own message log in local state, seeds with a presence line,
// and fires a varied canned auto-reply a beat after the user sends a message —
// enough to feel like the buddy is typing back. Styled after the Notes 8 /
// Sametime chat window (small, beveled, glossy blue title bar).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useUI } from "../data/ui";
import { fmtTime } from "../lib/format";
import "../styles/chat.css";

type Presence = "online" | "away" | "offline";

// Deterministic pseudo-presence from the buddy name, so a window's dot matches
// the buddy list's feel without any shared state.
function presence(name: string): Presence {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const r = h % 3;
  return r === 0 ? "online" : r === 1 ? "away" : "offline";
}

// Canned auto-replies, picked by how many messages the user has sent so the
// banter varies a little over the course of a conversation.
const REPLIES = [
  "Sure, sounds good.",
  "Let me check and get back to you.",
  "Ha, agreed!",
  "Can you send that over?",
  "I'm in a meeting, ttyl.",
  "👍",
  "Good point — let's do that.",
  "Thanks for the heads up.",
];

interface ChatLine {
  who: "me" | "them" | "system";
  text: string;
  at: number;
}

function ChatWindow({ name, onClose }: { name: string; onClose: () => void }) {
  const status = presence(name);
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

  function send() {
    const value = text.trim();
    if (!value) return;
    setLines((prev) => [...prev, { who: "me", text: value, at: Date.now() }]);
    setText("");
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
        <span className="chat-close" title="Close chat" onClick={onClose}>✕</span>
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
          placeholder="Type a message…"
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
