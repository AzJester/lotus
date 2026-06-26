// ============================================================================
// A draggable pane splitter (like the resizable dividers between Notes panes).
// Drop a <Splitter /> between two sibling panes inside a flex container: it
// resizes its PREVIOUS sibling on drag (horizontal by default, vertical with
// the `vertical` prop). Uses pointer capture so the drag never gets "lost".
// Double-click resets to the CSS default. Session-only.
// ============================================================================

import { useRef } from "react";

export function Splitter({
  vertical = false,
  min = 120,
  max = 1000,
}: {
  vertical?: boolean;
  min?: number;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const handle = ref.current;
    const prev = handle?.previousElementSibling as HTMLElement | null;
    if (!handle || !prev) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("dragging");

    const startPos = vertical ? e.clientY : e.clientX;
    const startSize = vertical ? prev.offsetHeight : prev.offsetWidth;

    const move = (ev: PointerEvent) => {
      const delta = (vertical ? ev.clientY : ev.clientX) - startPos;
      const size = Math.max(min, Math.min(max, startSize + delta));
      prev.style.flex = `0 0 ${size}px`;
      if (vertical) prev.style.height = `${size}px`;
      else prev.style.width = `${size}px`;
    };
    const up = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      handle.classList.remove("dragging");
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  const onDoubleClick = () => {
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
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize · double-click to reset"
    >
      <span className="pane-splitter-grip" />
    </div>
  );
}
