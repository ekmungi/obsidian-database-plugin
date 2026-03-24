/** Colored bar with live drag-to-resize, drag-to-move, and floating tooltip. */

import { h } from "preact";
import { useCallback, useRef } from "preact/hooks";

/** Props for the TimelineBar component. */
export interface TimelineBarProps {
  readonly left: number;
  readonly width: number;
  readonly isDot: boolean;
  readonly bgColor: string;
  readonly textColor: string;
  readonly label: string;
  readonly tooltip: string;
  readonly onClick: () => void;
  readonly onResize?: (edge: "left" | "right", deltaPx: number) => void;
  readonly onMove?: (deltaPx: number) => void;
  readonly getDatePreview?: (action: "move" | "resize-left" | "resize-right", deltaPx: number) => { start: string; end: string };
}

/** Create a floating tooltip element near the cursor. */
function createDragTooltip(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "timeline-drag-tooltip";
  document.body.appendChild(el);
  return el;
}

/** Update the tooltip position and content using DOM methods. */
function updateDragTooltip(el: HTMLDivElement, x: number, y: number, name: string, start: string, end: string): void {
  el.style.left = `${x + 12}px`;
  el.style.top = `${y - 10}px`;
  el.empty();
  const strong = document.createElement("strong");
  strong.textContent = name;
  el.appendChild(strong);
  el.appendChild(document.createElement("br"));
  el.appendText(`Start: ${start}`);
  el.appendChild(document.createElement("br"));
  el.appendText(`End: ${end}`);
}

/** Remove the tooltip from the DOM. */
function removeDragTooltip(el: HTMLDivElement | null): void {
  if (el?.parentNode) el.parentNode.removeChild(el);
}

/**
 * TimelineBar with live visual feedback during drag operations.
 * The bar element's style is manipulated directly during mousemove for smooth animation.
 */
export function TimelineBar({
  left, width, isDot, bgColor, textColor, label, tooltip,
  onClick, onResize, onMove, getDatePreview,
}: TimelineBarProps): h.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);
  const didDrag = useRef(false);

  const handleClick = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    if (!didDrag.current) onClick();
    didDrag.current = false;
  }, [onClick]);

  /** Start a resize drag on a handle edge — live visual resize. */
  const handleResizeStart = useCallback((edge: "left" | "right", e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const origLeft = left;
    const origWidth = width;
    didDrag.current = false;
    let tip: HTMLDivElement | null = null;

    const onMouseMove = (me: MouseEvent) => {
      const delta = me.clientX - startX;
      if (Math.abs(delta) <= 3) return;
      didDrag.current = true;

      /* Live visual update on the DOM element. */
      const bar = barRef.current;
      if (bar) {
        if (edge === "left") {
          const newLeft = origLeft + delta;
          const newWidth = Math.max(origWidth - delta, 6);
          bar.style.left = `${newLeft}px`;
          bar.style.width = `${newWidth}px`;
        } else {
          const newWidth = Math.max(origWidth + delta, 6);
          bar.style.width = `${newWidth}px`;
        }
      }

      /* Tooltip. */
      if (!tip) tip = createDragTooltip();
      if (getDatePreview) {
        const action = edge === "left" ? "resize-left" as const : "resize-right" as const;
        const preview = getDatePreview(action, delta);
        updateDragTooltip(tip, me.clientX, me.clientY, label, preview.start, preview.end);
      }
    };

    const onMouseUp = (me: MouseEvent) => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      removeDragTooltip(tip);

      /* Reset visual to let React re-render with new data. */
      const bar = barRef.current;
      if (bar) {
        bar.style.left = `${origLeft}px`;
        bar.style.width = `${origWidth}px`;
      }

      const delta = me.clientX - startX;
      if (Math.abs(delta) > 3 && onResize) onResize(edge, delta);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [onResize, getDatePreview, label, left, width]);

  /** Start a move drag on the bar body — live visual move. */
  const handleMoveStart = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.classList.contains("timeline-bar__handle")) return;

    e.preventDefault();
    const startX = e.clientX;
    const origLeft = left;
    didDrag.current = false;
    let tip: HTMLDivElement | null = null;

    const onMouseMove = (me: MouseEvent) => {
      const delta = me.clientX - startX;
      if (Math.abs(delta) <= 3) return;
      didDrag.current = true;

      /* Live visual update — slide the whole bar. */
      const bar = barRef.current;
      if (bar) {
        bar.style.left = `${origLeft + delta}px`;
      }

      /* Tooltip. */
      if (!tip) tip = createDragTooltip();
      if (getDatePreview) {
        const preview = getDatePreview("move", delta);
        updateDragTooltip(tip, me.clientX, me.clientY, label, preview.start, preview.end);
      }
    };

    const onMouseUp = (me: MouseEvent) => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      removeDragTooltip(tip);

      /* Reset visual to let React re-render with new data. */
      const bar = barRef.current;
      if (bar) bar.style.left = `${origLeft}px`;

      const delta = me.clientX - startX;
      if (Math.abs(delta) > 3 && onMove) onMove(delta);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [onMove, getDatePreview, label, left]);

  if (isDot) {
    return (
      <div
        class="timeline-bar timeline-bar--dot"
        style={{ left: `${left}px`, background: bgColor }}
        title={tooltip}
        onClick={handleClick}
      />
    );
  }

  return (
    <div
      ref={barRef}
      class="timeline-bar"
      style={{ left: `${left}px`, width: `${width}px`, background: bgColor, color: textColor }}
      title={tooltip}
      onClick={handleClick}
      onMouseDown={onMove ? handleMoveStart : undefined}
    >
      {onResize && (
        <div
          class="timeline-bar__handle timeline-bar__handle--left"
          onMouseDown={(e: MouseEvent) => handleResizeStart("left", e)}
        />
      )}
      <span class="timeline-bar__label">{label}</span>
      {onResize && (
        <div
          class="timeline-bar__handle timeline-bar__handle--right"
          onMouseDown={(e: MouseEvent) => handleResizeStart("right", e)}
        />
      )}
    </div>
  );
}
