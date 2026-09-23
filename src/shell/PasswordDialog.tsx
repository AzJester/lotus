// ============================================================================
// <PasswordDialog>: the Lotus Notes "Enter Password" prompt, shown when Notes
// starts and again when the user locks their ID with F5.
//
//   <PasswordDialog userName="Sam Rivera/Acme" mode="startup"
//                   onUnlock={...} onCancel={...} />
//
// The field shows X's instead of what is typed, 1 to 3 per character, so the
// display does not give away the password's length. The papyrus panel on the
// left shows four hieroglyphs that re-roll on every keystroke. They are a pure
// function of the password typed so far (glyphsFor), which is how Notes users
// learned to recognize their own password's pictures and spot a typo before
// pressing Enter. It is all theater: any non-empty password unlocks, and an
// empty one gets the Wrong Password message box.
// ============================================================================

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type {
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { PixelArt } from "../components/Icon";
import { DEFAULT_GLYPHS, HIEROGLYPHS, STOP_ICON } from "./hieroglyphs";
import "../styles/password.css";

export interface PasswordDialogProps {
  /** Hierarchical user name, e.g. "Sam Rivera/Acme". */
  userName: string;
  /** "startup": full-screen plain desktop behind the dialog (Notes has not opened yet).
   *  "locked": translucent scrim over the running Notes window (after F5). */
  mode: "startup" | "locked";
  /** Password accepted. */
  onUnlock: () => void;
  /** Cancel button / Esc. */
  onCancel: () => void;
}

const WRONG_PASSWORD_TEXT =
  "Wrong Password. (Passwords are case sensitive - be sure to use correct upper and lower case.)";

/** How many pictures the panel shows (a 2x2 grid). */
const PICTURES = 4;

// --- Pure helpers: the X mask and the pictures ------------------------------

/** Split into code points, so an emoji or accented letter is one character. */
const chars = (s: string): string[] => Array.from(s);

/** murmur3's 32-bit finalizer: scrambles every input bit into every output bit. */
function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** X's added by the character at `index`: 1, 2 or 3. */
function xCount(ch: string, index: number): number {
  const cp = ch.codePointAt(0) ?? 0;
  return 1 + (fmix(Math.imul(cp, 0x9e3779b1) ^ Math.imul(index + 1, 0x632be5ab)) % 3);
}

/** The X string displayed for a password (never its real characters). */
export function maskFor(password: string): string {
  return chars(password)
    .map((ch, i) => "X".repeat(xCount(ch, i)))
    .join("");
}

/** mulberry32: a tiny seeded PRNG, so a seed always deals the same pictures. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deal four different pictures from the seed, never repeating the last deal. */
function deal(seed: number, previous: readonly number[]): number[] {
  const rand = prng(seed);
  const pool = HIEROGLYPHS.map((_, i) => i);
  for (let i = 0; i < PICTURES; i++) {
    const j = i + Math.floor(rand() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const hand = pool.slice(0, PICTURES);
  // Every keystroke must visibly change the panel.
  if (hand.every((g, i) => g === previous[i])) hand[PICTURES - 1] = pool[PICTURES];
  return hand;
}

/**
 * Indices into HIEROGLYPHS of the four pictures shown for a password. Pure:
 * the same password always shows the same pictures, each keystroke re-rolls
 * them, and an empty password shows DEFAULT_GLYPHS.
 */
export function glyphsFor(password: string): number[] {
  let picks = [...DEFAULT_GLYPHS];
  let h = 0x811c9dc5;
  chars(password).forEach((ch, i) => {
    h = fmix(h ^ Math.imul(ch.codePointAt(0) ?? 0, 0x01000193) ^ Math.imul(i + 1, 0x27d4eb2f));
    picks = deal(h, picks);
  });
  return picks;
}

const dropLast = (s: string): string => chars(s).slice(0, -1).join("");

/** True when every X in the field is selected (Ctrl+A, double-click). */
const allSelected = (el: HTMLInputElement): boolean =>
  el.value.length > 0 && el.selectionStart === 0 && el.selectionEnd === el.value.length;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));

const block = (e: { preventDefault(): void }) => e.preventDefault();

// --- Chrome ------------------------------------------------------------------

/** The little gray X caption button of a classic dialog title bar. */
function CaptionClose({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="pw-caption-btn"
      tabIndex={-1}
      aria-label={label}
      title={label}
      onMouseDown={block}
      onClick={onClick}
    >
      <svg width="8" height="7" viewBox="0 0 8 7" shapeRendering="crispEdges" aria-hidden>
        <path
          fill="currentColor"
          d="M0 0h2v1H0zM6 0h2v1H6zM1 1h2v1H1zM5 1h2v1H5zM2 2h4v1H2zM3 3h2v1H3zM2 4h4v1H2zM1 5h2v1H1zM5 5h2v1H5zM0 6h2v1H0zM6 6h2v1H6z"
        />
      </svg>
    </button>
  );
}

interface Drag {
  x: number;
  y: number;
  ox: number;
  oy: number;
  rect: DOMRect | null;
}

// --- The dialog ----------------------------------------------------------------

export default function PasswordDialog({ userName, mode, onUnlock, onCancel }: PasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState(false);
  /** Bumped to flash the active title bar when the user clicks outside it. */
  const [flash, setFlash] = useState(0);
  /** Where the dialog has been dragged to by its title bar. */
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const boxOkRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | null>(null);

  const id = useId();
  const mask = maskFor(password);
  const pictures = glyphsFor(password).map((i) => HIEROGLYPHS[i]);

  // Autofocus the password field; whatever had focus before the dialog
  // opened gets it back when the dialog closes.
  const [returnFocus] = useState(() => document.activeElement);
  useEffect(() => {
    fieldRef.current?.focus();
    return () => {
      if (returnFocus instanceof HTMLElement && returnFocus !== document.body && returnFocus.isConnected) {
        returnFocus.focus({ preventScroll: true });
      }
    };
  }, [returnFocus]);

  // Keep the caret parked after the last X and scrolled into view.
  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el || document.activeElement !== el) return;
    el.setSelectionRange(mask.length, mask.length);
    el.scrollLeft = el.scrollWidth;
  }, [mask]);

  // The message box owns the focus while it is up.
  useEffect(() => {
    if (wrong) boxOkRef.current?.focus();
  }, [wrong]);

  // Modal focus: anything that pulls focus out of the dialog is sent back.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        (wrong ? boxOkRef.current : fieldRef.current)?.focus();
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [wrong]);

  const submit = () => {
    if (password === "") {
      setFlash(0);
      setWrong(true);
      return;
    }
    onUnlock();
  };

  const closeWrong = () => {
    setFlash(0);
    setWrong(false);
    fieldRef.current?.focus();
  };

  const append = (text: string, replaceAll: boolean) => setPassword((p) => (replaceAll ? "" : p) + text);

  // --- Field input: the real value lives in state, the field only shows X's ---

  const onFieldKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // IME composition and some virtual keyboards report "Process" or
    // "Unidentified"; let those through to onChange, which diffs the result.
    if (e.nativeEvent.isComposing || e.key === "Process" || e.key === "Unidentified") return;
    const el = e.currentTarget;
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      if (allSelected(el)) setPassword("");
      else if (e.key === "Backspace") setPassword(dropLast);
      return;
    }
    // One printable character (AltGr arrives as Ctrl+Alt on Windows).
    if (chars(e.key).length === 1 && !e.metaKey && (!e.ctrlKey || e.altKey)) {
      e.preventDefault();
      append(e.key, allSelected(el));
    }
  };

  const onFieldPaste = (e: ReactClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/[\r\n]+/g, "");
    if (text) append(text, allSelected(e.currentTarget));
  };

  // Fallback for input the key handler never saw (virtual keyboards, IME,
  // autofill): diff the field's new contents against the X's we rendered.
  const onFieldChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    let start = 0;
    while (start < next.length && start < mask.length && next[start] === mask[start]) start++;
    let endNext = next.length;
    let endMask = mask.length;
    while (endNext > start && endMask > start && next[endNext - 1] === mask[endMask - 1]) {
      endNext--;
      endMask--;
    }
    const inserted = next.slice(start, endNext);
    const removed = endMask - start;
    if (!inserted && !removed) return;
    setPassword((p) => {
      let base = p;
      if (removed > 0) base = removed >= mask.length ? "" : dropLast(base);
      return base + inserted;
    });
  };

  // --- Dialog-level keys and mouse ---------------------------------------------

  const trapTab = (e: ReactKeyboardEvent) => {
    const scope = wrong ? boxRef.current : dialogRef.current;
    if (!scope) return;
    const stops = Array.from(scope.querySelectorAll<HTMLElement>("input, button")).filter(
      (el) => el.tabIndex >= 0 && !el.hasAttribute("disabled"),
    );
    if (stops.length === 0) return;
    e.preventDefault();
    const at = stops.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at + 1) % stops.length;
    stops[next].focus();
  };

  const onRootKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Nothing typed here reaches the Notes window behind the dialog.
    e.stopPropagation();
    if (e.key === "Tab") {
      trapTab(e);
    } else if (e.key === "F5") {
      e.preventDefault(); // already locked; and never let the browser reload
    } else if (wrong) {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        closeWrong();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
      // Enter on OK or Cancel lets that button act; anywhere else it means OK.
      e.preventDefault();
      submit();
    }
  };

  const onRootMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Clicking the dialog's face keeps focus in the field, as in a real dialog.
    if (!target.closest("input, button")) e.preventDefault();
    // A click outside the active window flashes its title bar.
    const active = wrong ? boxRef.current : dialogRef.current;
    if (active && !active.contains(target)) setFlash((n) => n + 1);
  };

  // --- Dragging the dialog by its title bar ------------------------------------

  const onTitlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
      rect: dialogRef.current?.getBoundingClientRect() ?? null,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onTitlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if ((e.buttons & 1) === 0) {
      // The button came up somewhere we did not hear about.
      drag.current = null;
      return;
    }
    let dx = e.clientX - d.x;
    let dy = e.clientY - d.y;
    if (d.rect) {
      // Keep a grabbable piece of the title bar on screen.
      dx = clamp(dx, 60 - d.rect.right, window.innerWidth - 60 - d.rect.left);
      dy = clamp(dy, -d.rect.top, window.innerHeight - 24 - d.rect.top);
    }
    setOffset({ x: d.ox + dx, y: d.oy + dy });
  };

  const endDrag = () => {
    drag.current = null;
  };

  const moved = offset.x !== 0 || offset.y !== 0;

  return (
    <div
      ref={rootRef}
      className={"pw-backdrop pw-" + mode}
      onKeyDown={onRootKeyDown}
      onMouseDown={onRootMouseDown}
    >
      <div className="pw-stage">
        {mode === "startup" && (
          <div className="pw-wordmark" aria-hidden>
            <span className="pw-squares">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="pw-word">Lotus Notes</span>
          </div>
        )}

        <div
          className="pw-float"
          style={moved ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}
        >
          <div
            ref={dialogRef}
            className={"pw-window pw-dialog" + (wrong ? " pw-inactive" : "")}
            role="dialog"
            aria-modal="true"
            aria-labelledby={id + "title"}
            aria-describedby={id + "prompt"}
          >
            <div
              key={wrong ? "idle" : flash}
              className={"pw-title" + (!wrong && flash > 0 ? " pw-flash" : "")}
              onPointerDown={onTitlePointerDown}
              onPointerMove={onTitlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <span id={id + "title"} className="pw-title-text">
                Enter Password
              </span>
              <CaptionClose label="Close" onClick={onCancel} />
            </div>

            <div className="pw-body">
              <div
                className="pw-pictures"
                role="img"
                aria-label={"Password pictures: " + pictures.map((p) => p.name).join(", ")}
              >
                {pictures.map((p, slot) => (
                  <span key={slot} className="pw-glyph" data-glyph={p.id}>
                    <PixelArt art={p.art} cacheKey={"pw-glyph-" + p.id} />
                  </span>
                ))}
              </div>

              <div className="pw-main">
                <label id={id + "prompt"} className="pw-prompt" htmlFor={id + "field"}>
                  Enter your password:
                </label>
                <input
                  ref={fieldRef}
                  id={id + "field"}
                  className="pw-field"
                  type="text"
                  aria-label="Password"
                  value={mask}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onKeyDown={onFieldKeyDown}
                  onPaste={onFieldPaste}
                  onChange={onFieldChange}
                  onCopy={block}
                  onCut={block}
                  onDrop={block}
                  onDragStart={block}
                />
                <div className="pw-user" title={userName}>
                  User ID: {userName}
                </div>
              </div>
            </div>

            <div className="pw-foot">
              <button type="button" className="btn pw-btn pw-default" onClick={submit}>
                OK
              </button>
              <button type="button" className="btn pw-btn" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </div>

          {wrong && (
            <>
              {/* Covers the dialog so it cannot be used until the box is closed. */}
              <div className="pw-blocker" />
              <div
                ref={boxRef}
                className="pw-window pw-msgbox"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={id + "msgtitle"}
                aria-describedby={id + "msgtext"}
              >
                <div key={flash} className={"pw-title" + (flash > 0 ? " pw-flash" : "")}>
                  <span id={id + "msgtitle"} className="pw-title-text">
                    Lotus Notes
                  </span>
                  <CaptionClose label="Close" onClick={closeWrong} />
                </div>
                <div className="pw-msg-body">
                  <PixelArt art={STOP_ICON} cacheKey="pw-stop" className="pw-msg-icon" />
                  <p id={id + "msgtext"} className="pw-msg-text">
                    {WRONG_PASSWORD_TEXT}
                  </p>
                </div>
                <div className="pw-msg-foot">
                  <button ref={boxOkRef} type="button" className="btn pw-btn pw-default" onClick={closeWrong}>
                    OK
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
