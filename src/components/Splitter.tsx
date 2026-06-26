// ============================================================================
// A draggable pane splitter (like the resizable dividers between Notes panes).
// Drop a <Splitter /> between two sibling panes inside a flex container: it
// resizes its PREVIOUS sibling on drag (horizontal by default, vertical with
// the `vertical` prop). Session-only — sizes reset on reload.
// ============================================================================

import { useRef } from "react";

export function Splitter({
  vertical = false,
  min = 120,
  max = 900,
}: {
  vertical?: boolean;
  min?: number;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const handle = ref.current;
    const prev = handle?.previousElementSibling as HTMLElement | null;
    if (!prev) return;
    const startPos = vertical ? e.clientY : e.clientX;
    const startSize = vertical ? prev.offsetHeight : prev.offsetWidth;

    const move = (ev: MouseEvent) => {
      const delta = (vertical ? ev.clientY : ev.clientX) - startPos;
      const size = Math.max(min, Math.min(max, startSize + delta));
      prev.style.flex = `0 0 ${size}px`;
      if (vertical) prev.style.height = `${size}px`;
      else prev.style.width = `${size}px`;
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    document.body.style.cursor = vertical ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
  };

  const onDouble = () => {
    // Double-click clears the manual size, returning to the CSS default.
    const prev = ref.current?.previousElementSibling as HTMLElement | null;
    if (!prev) return;
    prev.style.flex = "";
    prev.style.width = "";
    prev.style.height = "";
  };

  return (
    <div
      ref={ref}
      className={"pane-splitter" + (vertical ? " vertical" : "")}
      onMouseDown={onDown}
      onDoubleClick={onDouble}
      title="Drag to resize · double-click to reset"
    />
  );
}
