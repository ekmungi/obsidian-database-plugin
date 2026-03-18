/**
 * Keyboard navigation hook — arrow keys, tab, enter, escape, and shortcuts
 * for navigating and editing cells in the table view.
 */

import { useState, useCallback } from "preact/hooks";

/** Options for configuring keyboard navigation behavior. */
export interface KeyboardNavOptions {
  /** Total number of rows in the table. */
  readonly rows: number;
  /** Total number of columns in the table. */
  readonly cols: number;
  /** Callback when a cell should enter edit mode. */
  readonly onEdit: (row: number, col: number) => void;
  /** Callback when navigation moves to a new cell. */
  readonly onNavigate: (row: number, col: number) => void;
  /** Callback to create a new record (Ctrl+N). */
  readonly onNewRecord: () => void;
}

/** Cell coordinates in the table grid. */
export interface CellPosition {
  readonly row: number;
  readonly col: number;
}

/** Return value from the useKeyboardNav hook. */
export interface KeyboardNavResult {
  /** Currently active cell, or null if no cell is selected. */
  readonly activeCell: CellPosition | null;
  /** Keydown event handler to attach to the table container. */
  readonly onKeyDown: (e: KeyboardEvent) => void;
  /** Programmatically set the active cell. */
  readonly setActiveCell: (row: number, col: number) => void;
}

/**
 * Clamp a value between min and max (inclusive).
 * @param value - Value to clamp.
 * @param min - Minimum allowed value.
 * @param max - Maximum allowed value.
 * @returns The clamped value.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Hook for keyboard-based table cell navigation.
 * Supports arrow keys, Tab/Shift+Tab, Enter to edit, Escape to deselect,
 * and Ctrl+N to create a new record.
 * @param options - Navigation configuration.
 * @returns Active cell state, keydown handler, and setter.
 */
export function useKeyboardNav(options: KeyboardNavOptions): KeyboardNavResult {
  const { rows, cols, onEdit, onNavigate, onNewRecord } = options;

  const [activeCell, setActiveCellState] = useState<CellPosition | null>(null);

  /** Set the active cell and notify the onNavigate callback. */
  const setActiveCell = useCallback(
    (row: number, col: number) => {
      const clamped: CellPosition = {
        row: clamp(row, 0, Math.max(0, rows - 1)),
        col: clamp(col, 0, Math.max(0, cols - 1)),
      };
      setActiveCellState(clamped);
      onNavigate(clamped.row, clamped.col);
    },
    [rows, cols, onNavigate],
  );

  /**
   * Move the active cell by a delta, wrapping within grid bounds.
   * @param dRow - Row delta (-1, 0, or 1).
   * @param dCol - Column delta (-1, 0, or 1).
   */
  const moveCell = useCallback(
    (dRow: number, dCol: number) => {
      if (!activeCell) {
        // No active cell — select first cell
        setActiveCell(0, 0);
        return;
      }
      setActiveCell(activeCell.row + dRow, activeCell.col + dCol);
    },
    [activeCell, setActiveCell],
  );

  /**
   * Move to the next cell (Tab) or previous cell (Shift+Tab).
   * Wraps across rows when reaching the end/start of a row.
   * @param forward - True for next cell, false for previous.
   */
  const tabMove = useCallback(
    (forward: boolean) => {
      if (!activeCell) {
        setActiveCell(0, 0);
        return;
      }

      const { row, col } = activeCell;

      if (forward) {
        if (col < cols - 1) {
          setActiveCell(row, col + 1);
        } else if (row < rows - 1) {
          setActiveCell(row + 1, 0);
        }
        // At last cell — do nothing
      } else {
        if (col > 0) {
          setActiveCell(row, col - 1);
        } else if (row > 0) {
          setActiveCell(row - 1, cols - 1);
        }
        // At first cell — do nothing
      }
    },
    [activeCell, cols, rows, setActiveCell],
  );

  /** Handle keydown events for navigation and editing. */
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ctrl+N: create new record
      if (e.key === "n" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onNewRecord();
        return;
      }

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          moveCell(-1, 0);
          break;

        case "ArrowDown":
          e.preventDefault();
          moveCell(1, 0);
          break;

        case "ArrowLeft":
          e.preventDefault();
          moveCell(0, -1);
          break;

        case "ArrowRight":
          e.preventDefault();
          moveCell(0, 1);
          break;

        case "Tab":
          e.preventDefault();
          tabMove(!e.shiftKey);
          break;

        case "Enter":
          e.preventDefault();
          if (activeCell) {
            onEdit(activeCell.row, activeCell.col);
          }
          break;

        case "Escape":
          e.preventDefault();
          setActiveCellState(null);
          break;

        default:
          break;
      }
    },
    [activeCell, moveCell, tabMove, onEdit, onNewRecord],
  );

  return {
    activeCell,
    onKeyDown,
    setActiveCell,
  };
}
