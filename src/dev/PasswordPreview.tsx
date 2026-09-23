// ============================================================================
// Dev-only preview of the Enter Password dialog (served by `npm run dev` at
// /dev/password.html; not part of the production build).
//   ?mode=startup | locked     the startup desktop, or the F5 lock over a
//                              static mock of the Notes window
//   ?theme=notes8 | r5         sets theme-notes8 / theme-r5 on <html>
//   ?user=Jo%20Doe/Sales/Acme  the hierarchical name shown in the dialog
//   ?sheet=1                   every hieroglyph, plus the pictures a sample
//                              password deals keystroke by keystroke
//                              (&sample=... picks the password)
//   ?bare=1                    hide the dev switcher (for screenshots)
// After OK or Cancel the dialog closes; F5 (or "Show dialog") brings it back.
// ============================================================================

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PixelArt } from "../components/Icon";
import PasswordDialog, { glyphsFor, maskFor } from "../shell/PasswordDialog";
import { HIEROGLYPHS, STOP_ICON } from "../shell/hieroglyphs";
import "../styles/tokens.css";
import "../styles/chrome.css";
import "../styles/views.css";

type Mode = "startup" | "locked";
type Theme = "notes8" | "r5";

const params = new URLSearchParams(location.search);
const MODE: Mode = params.get("mode") === "locked" ? "locked" : "startup";
const THEME: Theme = params.get("theme") === "r5" ? "r5" : "notes8";
const USER = params.get("user") || "Sam Rivera/Acme";
const BARE = params.has("bare");
const SHEET = params.has("sheet");
const SAMPLE = params.get("sample") || "Lotus123";

document.documentElement.classList.remove("theme-notes8", "theme-r5");
document.documentElement.classList.add("theme-" + THEME);

/** A query string with some parameters changed (null removes one). */
function linkTo(changes: Record<string, string | null>): string {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) p.delete(k);
    else p.set(k, v);
  }
  return "?" + p.toString();
}

// --- A static stand-in for the running Notes window (locked mode) -----------

const MAIL = [
  { who: "Jordan Lee", subject: "Q3 budget review: final numbers", date: "09/23/2026", unread: true },
  { who: "Priya Natarajan", subject: "Re: Domino server maintenance window", date: "09/23/2026", unread: true },
  { who: "Chris Okafor", subject: "Lunch and learn: replication basics", date: "09/22/2026" },
  { who: "Alex Chen", subject: "Updated org chart", date: "09/22/2026" },
  { who: "Morgan Diaz", subject: "Travel request approved", date: "09/21/2026" },
  { who: "Taylor Brooks", subject: "Minutes from Monday's staff meeting", date: "09/21/2026" },
  { who: "Sam Rivera", subject: "Draft: customer survey results", date: "09/20/2026" },
  { who: "Dana Whitfield", subject: "Holiday calendar for next year", date: "09/19/2026" },
];

function MockNotesWindow() {
  return (
    <div className={"notes-window theme-" + THEME}>
      <div className="titlebar">
        <span className="tb-appicon" aria-hidden>
          <span className="tb-appicon-mark">❋</span>
        </span>
        <span className="titlebar-title">Mail - Inbox - IBM Lotus Notes</span>
        <span className="titlebar-spacer" />
        <div className="titlebar-btns">
          <span className="titlebar-btn">
            <i className="xp-min" />
          </span>
          <span className="titlebar-btn">
            <i className="xp-max" />
          </span>
          <span className="titlebar-btn close">✕</span>
        </div>
      </div>
      <div className="menubar">
        {["File", "Edit", "View", "Create", "Actions", "Tools", "Window", "Help"].map((m) => (
          <span key={m} className="menu-item">
            {m}
          </span>
        ))}
      </div>
      <div className="toolbar">
        {["✉️", "📅", "👤", "✅"].map((g) => (
          <span key={g} className="tool-btn">
            {g}
          </span>
        ))}
        <div className="tool-sep" />
        {["🗔", "📓", "💬"].map((g) => (
          <span key={g} className="tool-btn">
            {g}
          </span>
        ))}
        <div className="addr">
          <input type="search" className="bevel-field tb-search" placeholder="Search all databases…" readOnly />
          <span className="btn tb-search-btn">Search</span>
        </div>
      </div>
      <div className="notes-body">
        <div className="bookmark-bar">
          {["🏠", "🗔", "✉️", "📅", "👤", "✅", "📓", "💬"].map((g, i) => (
            <span key={g} className={"bm-btn" + (i === 2 ? " active" : "")}>
              <span className="glyph">{g}</span>
            </span>
          ))}
          <div className="bm-sep" />
        </div>
        <div className="workpane">
          <div className="tabs-row">
            <div className="open-launcher">
              <span className="open-btn">
                <span className="open-ic">⊞</span> Open <span className="open-caret">▾</span>
              </span>
            </div>
            <div className="window-tabs">
              <div className="wtab">
                <span className="wtab-accent" style={{ background: "#3a6ea5" }} />
                <span className="wtab-label">Welcome</span>
              </div>
              <div className="wtab active">
                <span className="wtab-accent" style={{ background: "#c8a415" }} />
                <span className="wtab-label">Mail</span>
                <span className="wtab-close">✕</span>
              </div>
            </div>
          </div>
          <div className="workview">
            <div className="app">
              <div className="action-bar">
                {["New Memo", "Reply", "Reply to All", "Forward", "Delete", "Folder"].map((a) => (
                  <span key={a} className="action-btn">
                    {a}
                  </span>
                ))}
              </div>
              <div className="app-cols">
                <div className="nav-pane">
                  <div className="nav-title">Sam Rivera - Mail</div>
                  <div className="nav-group">
                    {["Inbox", "Drafts", "Sent", "Follow Up", "All Documents", "Junk Mail", "Trash"].map((f, i) => (
                      <div key={f} className={"nav-item" + (i === 0 ? " active" : "")}>
                        <span className="nav-label">{f}</span>
                        {i === 0 && <span className="nav-count">2</span>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="list-pane">
                  <div className="view">
                    <div className="view-head">
                      <div className="col" style={{ width: 140 }}>
                        Who
                      </div>
                      <div className="col" style={{ flex: 1 }}>
                        Subject
                      </div>
                      <div className="col" style={{ width: 86 }}>
                        Date
                      </div>
                    </div>
                    <div className="view-body">
                      {MAIL.map((m, i) => (
                        <div
                          key={m.subject}
                          className={"view-row" + (m.unread ? " unread" : "") + (i === 2 ? " selected" : "")}
                        >
                          <div className="col" style={{ width: 140 }}>
                            {m.who}
                          </div>
                          <div className="col" style={{ flex: 1 }}>
                            {m.subject}
                          </div>
                          <div className="col" style={{ width: 86 }}>
                            {m.date}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="preview-pane">
                  <div className="form">
                    <div className="form-header">
                      <div className="form-title">Lunch and learn: replication basics</div>
                    </div>
                    <div className="field-row">
                      <div className="field-label">From</div>
                      <div className="field-val field-static">Chris Okafor/Acme</div>
                    </div>
                    <div className="field-row">
                      <div className="field-label">To</div>
                      <div className="field-val field-static">Sales Team/Acme</div>
                    </div>
                    <div className="memo-body">
                      Bring your laptops on Thursday. We will set up a local replica of the team
                      discussion database and walk through replication settings together.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="statusbar">
        <div className="status-cell" style={{ width: 26, justifyContent: "center" }}>
          <span className="dot" />
        </div>
        <div className="status-cell grow">Your Notes ID is locked.</div>
        <div className="status-cell">{USER}</div>
        <div className="status-cell">Office (Network)</div>
        <div className="status-cell">▲ Online</div>
      </div>
    </div>
  );
}

// --- Glyph sheet --------------------------------------------------------------

const papyrus = { background: "#eadcb0", border: "1px solid #b8a878", padding: 6 };

function GlyphSheet() {
  const letters = Array.from(SAMPLE);
  const prefixes = letters.map((_, i) => letters.slice(0, i + 1).join(""));
  return (
    <div style={{ height: "100%", overflow: "auto", padding: "40px 16px 24px", background: "var(--window)" }}>
      <h2 style={{ font: "bold 14px var(--font-ui)", margin: "0 0 8px" }}>Hieroglyphs ({HIEROGLYPHS.length})</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {HIEROGLYPHS.map((g, i) => (
          <figure key={g.id} style={{ margin: 0, width: 150 }}>
            <div style={{ ...papyrus, display: "flex", alignItems: "flex-end", gap: 8 }}>
              <PixelArt art={g.art} cacheKey={"pw-glyph-" + g.id} />
              <PixelArt art={g.art} cacheKey={"pw-glyph-" + g.id} scale={3} />
            </div>
            <figcaption style={{ marginTop: 3 }}>
              {i}: {g.name}
            </figcaption>
          </figure>
        ))}
        <figure style={{ margin: 0, width: 150 }}>
          <div style={{ background: "var(--face)", padding: 6, display: "flex", alignItems: "flex-end", gap: 8 }}>
            <PixelArt art={STOP_ICON} cacheKey="pw-stop" />
            <PixelArt art={STOP_ICON} cacheKey="pw-stop" scale={3} />
          </div>
          <figcaption style={{ marginTop: 3 }}>message box icon</figcaption>
        </figure>
      </div>

      <h2 style={{ font: "bold 14px var(--font-ui)", margin: "20px 0 8px" }}>
        Typing "{SAMPLE}" one key at a time
      </h2>
      <table style={{ borderCollapse: "collapse" }}>
        <tbody>
          {["", ...prefixes].map((p) => (
            <tr key={p} style={{ borderBottom: "1px solid var(--grid)" }}>
              <td style={{ padding: "4px 12px 4px 0", fontFamily: "var(--font-mono)" }}>{p || "(empty)"}</td>
              <td style={{ padding: "4px 12px 4px 0", letterSpacing: 1, minWidth: 180 }}>{maskFor(p)}</td>
              <td style={{ padding: "4px 12px 4px 0" }}>
                <span style={{ ...papyrus, display: "inline-flex", gap: 4, padding: 3 }}>
                  {glyphsFor(p).map((g, slot) => (
                    <PixelArt key={slot} art={HIEROGLYPHS[g].art} cacheKey={"pw-glyph-" + HIEROGLYPHS[g].id} />
                  ))}
                </span>
              </td>
              <td style={{ color: "var(--ink-muted)" }}>{glyphsFor(p).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Dev switcher ---------------------------------------------------------------

function DevBar({ last, open, onShow }: { last: string; open: boolean; onShow: () => void }) {
  const item = (label: string, href: string, on: boolean) => (
    <a
      href={href}
      style={{
        padding: "1px 6px",
        color: on ? "#fff" : "#000",
        background: on ? "#0a246a" : "transparent",
        textDecoration: "none",
      }}
    >
      {label}
    </a>
  );
  return (
    <div
      style={{
        position: "fixed",
        top: 6,
        left: 6,
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "3px 6px",
        font: "11px var(--font-ui)",
        background: "#ffffe1",
        border: "1px solid #000",
        boxShadow: "2px 2px 0 rgba(0, 0, 0, 0.3)",
      }}
    >
      <b style={{ marginRight: 4 }}>dev</b>
      {item("Startup", linkTo({ mode: "startup", sheet: null }), !SHEET && MODE === "startup")}
      {item("Locked", linkTo({ mode: "locked", sheet: null }), !SHEET && MODE === "locked")}
      {item("Glyphs", linkTo({ sheet: "1" }), SHEET)}
      <span style={{ margin: "0 4px", color: "#888" }}>|</span>
      {item("Notes 8", linkTo({ theme: "notes8" }), THEME === "notes8")}
      {item("R5", linkTo({ theme: "r5" }), THEME === "r5")}
      {!SHEET && !open && (
        <>
          <span style={{ margin: "0 4px", color: "#888" }}>|</span>
          <span>{last} called.</span>
          <button type="button" className="btn" style={{ minHeight: 0, padding: "0 6px", marginLeft: 6 }} onClick={onShow}>
            Show dialog (F5)
          </button>
        </>
      )}
    </div>
  );
}

function Preview() {
  const [open, setOpen] = useState(true);
  const [last, setLast] = useState("");

  // F5 locks the (pretend) ID again, as it does in Notes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F5") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = (what: string) => () => {
    setOpen(false);
    setLast(what);
  };

  return (
    <>
      {SHEET ? (
        <GlyphSheet />
      ) : (
        <>
          {MODE === "locked" && <MockNotesWindow />}
          {MODE === "startup" && !open && <div style={{ position: "fixed", inset: 0, background: "#008080" }} />}
          {open && (
            <PasswordDialog userName={USER} mode={MODE} onUnlock={close("onUnlock()")} onCancel={close("onCancel()")} />
          )}
        </>
      )}
      {!BARE && <DevBar last={last} open={open} onShow={() => setOpen(true)} />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
