// ============================================================================
// A draggable pane splitter (the resizable dividers between Notes panes).
// Drop a <Splitter /> between two sibling panes inside a flex container: it
// resizes its PREVIOUS sibling on drag (horizontal by default, vertical with
// the `vertical` prop). Pointer capture keeps the drag from getting lost.
// Give it an `id` and the size is remembered with the desktop, as Notes
// remembered pane sizes per view. Double-click resets to the CSS default.
// ============================================================================

import { useLayoutEffect, useRef } from "react";
import { useUI } from "../data/ui";

export function Splitter({
  vertical = false,
  min = 120,
  max = 1000,
  id,
}: {
  vertical?: boolean;
  min?: number;
  max?: number;
  /** Remember the size under this key (e.g. "mail.nav"). */
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const apply = (prev: HTMLElement, size: number) => {
    prev.style.flex = `0 0 ${size}px`;
    if (vertical) prev.style.height = `${size}px`;
    else prev.style.width = `${size}px`;
  };

  // Restore a remembered size.
  useLayoutEffect(() => {
    if (!id) return;
    const size = useUI.getState().paneSizes[id];
    const prev = ref.current?.previousElementSibling as HTMLElement | null;
    if (prev && size) apply(prev, Math.max(min, Math.min(max, size)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onPointerDown = (e: React.PointerEvent) => {
    const handle = ref.current;
    const prev = handle?.previousElementSibling as HTMLElement | null;
    if (!handle || !prev) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("dragging");

    const startPos = vertical ? e.clientY : e.clientX;
    const startSize = vertical ? prev.offsetHeight : prev.offsetWidth;
    let last = startSize;

    const move = (ev: PointerEvent) => {
      const delta = (vertical ? ev.clientY : ev.clientX) - startPos;
      last = Math.max(min, Math.min(max, startSize + delta));
      apply(prev, last);
    };
    const up = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      handle.classList.remove("dragging");
      if (id && last !== startSize) useUI.getState().setPaneSize(id, last);
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
    if (id) useUI.getState().setPaneSize(id, 0);
  };

  return (
    <div
      ref={ref}
      className={"pane-splitter" + (vertical ? " vertical" : "")}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize. Double-click to reset."
    >
      <span className="pane-splitter-grip" />
    </div>
  );
}
