// ============================================================================
// Notes dialogs. Browser confirm()/prompt() boxes break the illusion, so every
// question goes through here instead: Lotus Notes message boxes (title
// "Lotus Notes", an icon, centered buttons) and arbitrary dialogs, all
// promise-based and stacked by a single <DialogHost/> in the shell.
//
//   await notesAlert("Document has been deleted.")
//   const b = await notesConfirm("Do you want to save your changes?",
//                                { buttons: ["Yes", "No", "Cancel"] })
//   const name = await notesPrompt("Folder name:", { title: "Create Folder" })
//   const v = await openDialog<T>((close) => <MyDialog onDone={close} />)
// ============================================================================

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { create } from "zustand";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

interface DialogEntry {
  id: number;
  render: (close: (value: unknown) => void) => ReactNode;
  resolve: (value: unknown) => void;
}

interface DialogStore {
  stack: DialogEntry[];
}

export const useDialogs = create<DialogStore>(() => ({ stack: [] }));

let nextId = 1;

/** Show a dialog; resolves with whatever the dialog passes to `close`. */
export function openDialog<T>(render: (close: (value: T) => void) => ReactNode): Promise<T> {
  // Give focus back to whatever had it (a field, a view) when the box closes.
  const before = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
  return new Promise<T>((resolve) => {
    const id = nextId++;
    const entry: DialogEntry = {
      id,
      render: render as DialogEntry["render"],
      resolve: (v) => {
        useDialogs.setState((s) => ({ stack: s.stack.filter((d) => d.id !== id) }));
        resolve(v as T);
        setTimeout(() => {
          if (useDialogs.getState().stack.length) return;
          const ae = document.activeElement;
          if (before && before.isConnected && (!ae || ae === document.body)) before.focus({ preventScroll: true });
        }, 0);
      },
    };
    useDialogs.setState((s) => ({ stack: [...s.stack, entry] }));
  });
}

/** True while any dialog is open (global shortcuts stand down). */
export const dialogOpen = () => useDialogs.getState().stack.length > 0;

export function DialogHost() {
  const stack = useDialogs((s) => s.stack);
  return (
    <>
      {stack.map((d) => (
        <div key={d.id} className="dlg-layer">
          {d.render(d.resolve)}
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// The dialog frame
// ---------------------------------------------------------------------------

export function NotesDialog({
  title,
  children,
  footer,
  onClose,
  width,
  className,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Esc and the title-bar X call this. */
  onClose?: () => void;
  width?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Focus the first control so keyboard users can act immediately.
    const el = ref.current?.querySelector<HTMLElement>(
      "[data-autofocus], input:not([type=hidden]):not([disabled]), select, textarea, button.primary, button",
    );
    el?.focus();
  }, []);
  return (
    <div className="modal-scrim dlg-scrim">
      <div
        ref={ref}
        role="dialog"
        aria-label={title}
        className={"modal notes-dialog" + (className ? " " + className : "")}
        style={width ? { width } : undefined}
        onKeyDown={(e) => {
          if (e.key === "Escape" && onClose) {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="modal-title">
          <span style={{ flex: 1 }}>{title}</span>
          {onClose && (
            <span className="titlebar-btn close dlg-x" onClick={onClose} title="Close">
              ✕
            </span>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message boxes
// ---------------------------------------------------------------------------

type BoxIcon = "info" | "warning" | "error" | "question";

const BOX_ICON: Record<BoxIcon, IconName> = {
  info: "info",
  warning: "warning",
  error: "error",
  question: "question",
};

function MessageBox({
  title,
  message,
  icon,
  buttons,
  defaultButton,
  cancelValue,
  close,
}: {
  title: string;
  message: ReactNode;
  icon: BoxIcon;
  buttons: string[];
  defaultButton: string;
  cancelValue: string;
  close: (v: string) => void;
}) {
  return (
    <NotesDialog title={title} onClose={() => close(cancelValue)} width={380}>
      <div className="msgbox">
        <span className="msgbox-icon">
          <Icon name={BOX_ICON[icon]} scale={2} />
        </span>
        <div className="msgbox-text">{message}</div>
      </div>
      <div className="msgbox-buttons">
        {buttons.map((b) => (
          <button
            key={b}
            className={"btn" + (b === defaultButton ? " primary" : "")}
            data-autofocus={b === defaultButton ? true : undefined}
            onClick={() => close(b)}
          >
            {b}
          </button>
        ))}
      </div>
    </NotesDialog>
  );
}

export function notesAlert(message: ReactNode, opts: { title?: string; icon?: BoxIcon } = {}): Promise<void> {
  return openDialog<string>((close) => (
    <MessageBox
      title={opts.title ?? "Lotus Notes"}
      message={message}
      icon={opts.icon ?? "info"}
      buttons={["OK"]}
      defaultButton="OK"
      cancelValue="OK"
      close={close}
    />
  )).then(() => undefined);
}

/** Ask a question; resolves with the button label (Esc = the last button). */
export function notesConfirm(
  message: ReactNode,
  opts: { title?: string; icon?: BoxIcon; buttons?: string[]; defaultButton?: string } = {},
): Promise<string> {
  const buttons = opts.buttons ?? ["Yes", "No"];
  return openDialog<string>((close) => (
    <MessageBox
      title={opts.title ?? "Lotus Notes"}
      message={message}
      icon={opts.icon ?? "question"}
      buttons={buttons}
      defaultButton={opts.defaultButton ?? buttons[0]}
      cancelValue={buttons[buttons.length - 1]}
      close={close}
    />
  ));
}

/** Yes/No question as a boolean. */
export async function notesAsk(message: ReactNode, opts: { title?: string; icon?: BoxIcon } = {}): Promise<boolean> {
  return (await notesConfirm(message, { ...opts, buttons: ["Yes", "No"] })) === "Yes";
}

function PromptBox({
  title,
  message,
  initial,
  close,
}: {
  title: string;
  message: string;
  initial: string;
  close: (v: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <NotesDialog
      title={title}
      onClose={() => close(null)}
      width={380}
      footer={
        <>
          <button className="btn primary" onClick={() => close(value)}>
            OK
          </button>
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
        </>
      }
    >
      <label className="prompt-label">
        {message}
        <input
          type="text"
          className="prompt-input"
          value={value}
          data-autofocus
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              close(value);
            }
          }}
        />
      </label>
    </NotesDialog>
  );
}

export function notesPrompt(message: string, opts: { title?: string; value?: string } = {}): Promise<string | null> {
  return openDialog<string | null>((close) => (
    <PromptBox title={opts.title ?? "Lotus Notes"} message={message} initial={opts.value ?? ""} close={close} />
  ));
}
