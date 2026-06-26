// ============================================================================
// Shared UI primitives. Every module composes its chrome from these so the
// apps stay visually consistent. Pure presentational helpers — no store access.
// ============================================================================

import type { ReactNode } from "react";

// --- Action bar (the green strip of buttons atop each view) ---------------
export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="action-bar">{children}</div>;
}

export function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  caret,
  title,
}: {
  icon?: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  caret?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={"action-btn" + (disabled ? " disabled" : "")}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title ?? label}
    >
      {icon && <span className="ic">{icon}</span>}
      <span>{label}</span>
      {caret && <span className="caret">▾</span>}
    </button>
  );
}

export function ActionSep() {
  return <div className="action-sep" />;
}

export function ActionSpacer() {
  return <div className="action-spacer" />;
}

// --- Form field rows ------------------------------------------------------
export function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="field-row">
      <div className="field-label">{label}</div>
      <div className="field-val">{children}</div>
    </div>
  );
}

// --- Twistie (the expand/collapse caret in navigators & threads) ----------
export function Twistie({ open }: { open: boolean }) {
  return <span className="nav-twistie">{open ? "▼" : "▶"}</span>;
}

// --- Empty state ----------------------------------------------------------
export function Empty({ children }: { children: ReactNode }) {
  return <div className="view-empty">{children}</div>;
}

// --- Modal dialog ---------------------------------------------------------
export function Dialog({
  title,
  children,
  onClose,
  footer,
  width,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div
        className="modal"
        style={width ? { width } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-title">
          <span style={{ flex: 1 }}>{title}</span>
          {onClose && (
            <span
              className="titlebar-btn close"
              style={{ width: 18, height: 16 }}
              onClick={onClose}
            >
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
