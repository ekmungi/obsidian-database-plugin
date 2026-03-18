/**
 * Undo/redo hook — maintains edit history stacks for cell value changes.
 * Supports Ctrl+Z (undo), Ctrl+Shift+Z / Ctrl+Y (redo).
 */

import { useState, useCallback } from "preact/hooks";
import type { CellValue } from "../../types";

/** A single undoable edit representing a cell value change. */
export interface UndoableEdit {
  readonly recordId: string;
  readonly field: string;
  readonly oldValue: CellValue;
  readonly newValue: CellValue;
}

/** Options for configuring undo/redo behavior. */
export interface UndoRedoOptions {
  /** Callback to apply an edit (used during undo/redo). */
  readonly onApply: (edit: UndoableEdit) => void;
  /** Maximum number of entries in the undo stack (default 50). */
  readonly maxHistory?: number;
}

/** Immutable history state holding undo and redo stacks. */
interface HistoryState {
  readonly undoStack: readonly UndoableEdit[];
  readonly redoStack: readonly UndoableEdit[];
}

/** Return value from the useUndoRedo hook. */
export interface UndoRedoResult {
  /** Push a new edit onto the undo stack (clears redo stack). */
  readonly pushEdit: (edit: UndoableEdit) => void;
  /** Undo the last edit. */
  readonly undo: () => void;
  /** Redo the last undone edit. */
  readonly redo: () => void;
  /** Whether there are edits to undo. */
  readonly canUndo: boolean;
  /** Whether there are edits to redo. */
  readonly canRedo: boolean;
}

/**
 * Create a new history state with an edit pushed onto the undo stack.
 * Clears the redo stack and enforces the max history limit.
 * @param state - Current history state.
 * @param edit - The new edit to push.
 * @param maxHistory - Maximum undo stack size.
 * @returns New history state with the edit added.
 */
function pushToHistory(
  state: HistoryState,
  edit: UndoableEdit,
  maxHistory: number,
): HistoryState {
  const newUndo = [...state.undoStack, edit];

  // Trim oldest entries if over the limit
  const trimmed = newUndo.length > maxHistory
    ? newUndo.slice(newUndo.length - maxHistory)
    : newUndo;

  return {
    undoStack: trimmed,
    redoStack: [],
  };
}

/**
 * Create a reversed edit (swap oldValue and newValue).
 * @param edit - The edit to reverse.
 * @returns A new edit with old and new values swapped.
 */
function reverseEdit(edit: UndoableEdit): UndoableEdit {
  return {
    recordId: edit.recordId,
    field: edit.field,
    oldValue: edit.newValue,
    newValue: edit.oldValue,
  };
}

/**
 * Hook for undo/redo functionality on cell edits.
 * Maintains immutable undo and redo stacks.
 * New edits clear the redo stack. Stack size is capped at maxHistory.
 * @param options - Configuration including the onApply callback.
 * @returns Push, undo, redo functions and canUndo/canRedo flags.
 */
export function useUndoRedo(options: UndoRedoOptions): UndoRedoResult {
  const { onApply, maxHistory = 50 } = options;

  const [history, setHistory] = useState<HistoryState>({
    undoStack: [],
    redoStack: [],
  });

  /** Push a new edit — adds to undo stack, clears redo stack. */
  const pushEdit = useCallback(
    (edit: UndoableEdit) => {
      setHistory((prev) => pushToHistory(prev, edit, maxHistory));
    },
    [maxHistory],
  );

  /** Undo the most recent edit — pops from undo, pushes reversed edit to redo. */
  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.undoStack.length === 0) return prev;

      const lastEdit = prev.undoStack[prev.undoStack.length - 1];
      const newUndo = prev.undoStack.slice(0, -1);
      const newRedo = [...prev.redoStack, lastEdit];

      // Apply the reverse of the edit
      onApply(reverseEdit(lastEdit));

      return {
        undoStack: newUndo,
        redoStack: newRedo,
      };
    });
  }, [onApply]);

  /** Redo the most recently undone edit — pops from redo, pushes to undo. */
  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.redoStack.length === 0) return prev;

      const lastRedo = prev.redoStack[prev.redoStack.length - 1];
      const newRedo = prev.redoStack.slice(0, -1);
      const newUndo = [...prev.undoStack, lastRedo];

      // Re-apply the original edit
      onApply(lastRedo);

      return {
        undoStack: newUndo,
        redoStack: newRedo,
      };
    });
  }, [onApply]);

  return {
    pushEdit,
    undo,
    redo,
    canUndo: history.undoStack.length > 0,
    canRedo: history.redoStack.length > 0,
  };
}
