/** Number cell editor — numeric input with validation. */

import { h } from "preact";
import { useState, useCallback, useRef } from "preact/hooks";

/** Props for the NumberCell component. */
interface NumberCellProps {
  readonly value: number | null;
  readonly onChange: (value: number | null) => void;
}

/**
 * Inline number editor that validates numeric input.
 * @param props.value - Current numeric value (null renders as empty).
 * @param props.onChange - Called with parsed number or null on blur.
 */
export function NumberCell({ value, onChange }: NumberCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value !== null ? String(value) : "");
  const inputRef = useRef<HTMLInputElement>(null);

  /** Enter edit mode and sync draft. */
  const handleClick = useCallback(() => {
    setDraft(value !== null ? String(value) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [value]);

  /** Parse and commit on blur. */
  const handleBlur = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (value !== null) onChange(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!isNaN(parsed) && parsed !== value) {
      onChange(parsed);
    }
  }, [draft, value, onChange]);

  /** Commit on Enter, cancel on Escape. */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        (e.target as HTMLInputElement).blur();
      } else if (e.key === "Escape") {
        setDraft(value !== null ? String(value) : "");
        setEditing(false);
      }
    },
    [value]
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        class="cell-editor"
        type="number"
        value={draft}
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <div class="cell-display" onClick={handleClick}>
      {value !== null ? String(value) : ""}
    </div>
  );
}
