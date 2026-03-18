/**
 * Tests for the useUndoRedo hook — push, undo, redo, max history,
 * and redo stack clearing on new edits.
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { useUndoRedo } from "../use-undo-redo";
import type { UndoableEdit } from "../use-undo-redo";

/** Create a test edit with the given values. */
function makeEdit(
  recordId: string,
  field: string,
  oldValue: string,
  newValue: string,
): UndoableEdit {
  return { recordId, field, oldValue, newValue };
}

describe("useUndoRedo", () => {
  it("starts with empty stacks", () => {
    const onApply = vi.fn();
    const { result } = renderHook(() => useUndoRedo({ onApply }));

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("pushEdit enables undo", () => {
    const onApply = vi.fn();
    const { result } = renderHook(() => useUndoRedo({ onApply }));

    act(() => {
      result.current.pushEdit(makeEdit("r1", "status", "todo", "done"));
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("undo calls onApply with reversed edit", () => {
    const onApply = vi.fn();
    const { result } = renderHook(() => useUndoRedo({ onApply }));

    act(() => {
      result.current.pushEdit(makeEdit("r1", "status", "todo", "done"));
    });

    act(() => {
      result.current.undo();
    });

    expect(onApply).toHaveBeenCalledWith({
      recordId: "r1",
      field: "status",
      oldValue: "done",
      newValue: "todo",
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it("redo calls onApply with original edit", () => {
    const onApply = vi.fn();
    const { result } = renderHook(() => useUndoRedo({ onApply }));
    const edit = makeEdit("r1", "status", "todo", "done");

    act(() => {
      result.current.pushEdit(edit);
    });
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.redo();
    });

    // Second call should be the redo (re-apply original)
    expect(onApply).toHaveBeenCalledTimes(2);
    expect(onApply).toHaveBeenLastCalledWith(edit);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("new edit clears redo stack", () => {
    const onApply = vi.fn();
    const { result } = renderHook(() => useUndoRedo({ onApply }));

    act(() => {
      result.current.pushEdit(makeEdit("r1", "status", "todo", "done"));
    });
    act(() => {
      result.current.undo();
    });

    expect(result.current.canRedo).toBe(true);

    // Push a new edit — redo should be cleared
    act(() => {
      result.current.pushEdit(makeEdit("r2", "title", "old", "new"));
    });

    expect(result.current.canRedo).toBe(false);
    expect(result.current.canUndo).toBe(true);
  });

  it("respects maxHistory limit", () => {
    const onApply = vi.fn();
    const maxHistory = 3;
    const { result } = renderHook(() => useUndoRedo({ onApply, maxHistory }));

    // Push 5 edits — only last 3 should survive
    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current.pushEdit(makeEdit(`r${i}`, "f", `old-${i}`, `new-${i}`));
      }
    });

    // Should be able to undo exactly 3 times
    let undoCount = 0;
    while (result.current.canUndo) {
      act(() => {
        result.current.undo();
      });
      undoCount++;
    }

    expect(undoCount).toBe(maxHistory);
  });

  it("undo on empty stack is a no-op", () => {
    const onApply = vi.fn();
    const { result } = renderHook(() => useUndoRedo({ onApply }));

    act(() => {
      result.current.undo();
    });

    expect(onApply).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
  });

  it("redo on empty stack is a no-op", () => {
    const onApply = vi.fn();
    const { result } = renderHook(() => useUndoRedo({ onApply }));

    act(() => {
      result.current.redo();
    });

    expect(onApply).not.toHaveBeenCalled();
    expect(result.current.canRedo).toBe(false);
  });

  it("supports multiple sequential undo/redo cycles", () => {
    const onApply = vi.fn();
    const { result } = renderHook(() => useUndoRedo({ onApply }));

    act(() => {
      result.current.pushEdit(makeEdit("r1", "a", "1", "2"));
      result.current.pushEdit(makeEdit("r2", "b", "3", "4"));
    });

    // Undo both
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.undo();
    });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    // Redo both
    act(() => {
      result.current.redo();
    });
    act(() => {
      result.current.redo();
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });
});
