/**
 * Column resize hook — tracks column widths and handles mouse-drag resizing
 * for the table view's column headers.
 */

import { useState, useCallback, useEffect, useRef } from "preact/hooks";
import type { ColumnDefinition } from "../../types";

/** Default column width in pixels when no width is specified. */
const DEFAULT_WIDTH = 150;

/** Minimum column width in pixels to prevent columns from collapsing. */
const DEFAULT_MIN_WIDTH = 80;

/** Options for configuring column resize behavior. */
export interface ColumnResizeOptions {
  /** Column definitions (used to initialize widths from column.width). */
  readonly columns: readonly ColumnDefinition[];
  /** Callback when a column is resized — persist the new width. */
  readonly onResize: (columnId: string, width: number) => void;
  /** Minimum column width in pixels (default 80). */
  readonly minWidth?: number;
  /** Default column width in pixels (default 150). */
  readonly defaultWidth?: number;
}

/** Return value from the useColumnResize hook. */
export interface ColumnResizeResult {
  /** Current widths for each column, keyed by column ID. */
  readonly widths: ReadonlyMap<string, number>;
  /** Start a resize drag on a column. Call on mousedown of the resize handle. */
  readonly onResizeStart: (columnId: string, startX: number) => void;
}

/**
 * Build the initial width map from column definitions.
 * Uses column.width if defined, otherwise falls back to defaultWidth.
 * @param columns - Column definitions to read widths from.
 * @param defaultWidth - Fallback width for columns without an explicit width.
 * @returns Map of column ID to width in pixels.
 */
function buildInitialWidths(
  columns: readonly ColumnDefinition[],
  defaultWidth: number,
): ReadonlyMap<string, number> {
  const widths = new Map<string, number>();
  for (const col of columns) {
    widths.set(col.id, col.width ?? defaultWidth);
  }
  return widths;
}

/**
 * Hook for draggable column resizing in the table view.
 * Initializes widths from column definitions and handles mousedown/mousemove/mouseup
 * to resize a column by dragging its border handle.
 * @param options - Resize configuration.
 * @returns Current widths map and a resize start handler.
 */
export function useColumnResize(options: ColumnResizeOptions): ColumnResizeResult {
  const {
    columns,
    onResize,
    minWidth = DEFAULT_MIN_WIDTH,
    defaultWidth = DEFAULT_WIDTH,
  } = options;

  const [widths, setWidths] = useState<ReadonlyMap<string, number>>(
    () => buildInitialWidths(columns, defaultWidth),
  );

  /** Track the active drag state without triggering re-renders. */
  const dragState = useRef<{
    columnId: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  /** Re-initialize widths when columns change (new columns added, etc.). */
  useEffect(() => {
    setWidths((prev) => {
      const next = new Map(prev);
      let changed = false;

      for (const col of columns) {
        if (!next.has(col.id)) {
          next.set(col.id, col.width ?? defaultWidth);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [columns, defaultWidth]);

  /** Handle mousemove during a drag — update width. */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const drag = dragState.current;
      if (!drag) return;

      const delta = e.clientX - drag.startX;
      const newWidth = Math.max(minWidth, drag.startWidth + delta);

      setWidths((prev) => {
        const next = new Map(prev);
        next.set(drag.columnId, newWidth);
        return next;
      });
    },
    [minWidth],
  );

  /** Handle mouseup — finalize the resize and clean up listeners. */
  const handleMouseUp = useCallback(() => {
    const drag = dragState.current;
    if (!drag) return;

    // Read the final width and notify the consumer
    setWidths((prev) => {
      const finalWidth = prev.get(drag.columnId) ?? defaultWidth;
      onResize(drag.columnId, finalWidth);
      return prev;
    });

    dragState.current = null;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [defaultWidth, onResize, handleMouseMove]);

  /**
   * Start a column resize drag.
   * @param columnId - ID of the column being resized.
   * @param startX - Initial mouse X position (from mousedown event).
   */
  const onResizeStart = useCallback(
    (columnId: string, startX: number) => {
      const currentWidth = widths.get(columnId) ?? defaultWidth;

      dragState.current = {
        columnId,
        startX,
        startWidth: currentWidth,
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [widths, defaultWidth, handleMouseMove, handleMouseUp],
  );

  return {
    widths,
    onResizeStart,
  };
}
